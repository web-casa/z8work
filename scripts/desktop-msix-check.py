"""Read-only ZIP/BlockMap verification, independent of the SDK unpacker."""
import argparse
import base64
import hashlib
import json
import re
import stat
import zipfile
from pathlib import Path
from urllib.parse import unquote_to_bytes
from xml.etree import ElementTree as ET


def safe_name(name):
    name = name.replace('\\', '/')
    if (not name or any(ord(c) < 32 for c in name) or
        any(c in name for c in ':<>"|?*') or
        any(p in ('', '.', '..') or p.endswith((' ', '.')) or
            re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', p, re.I)
            for p in name.split('/'))):
        raise ValueError('Unsafe MSIX path')
    return name


def xml_document(data):
    if len(data) > 4 * 1024**2 or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('Unsupported XML declaration or size')
    return ET.fromstring(data)


def zip_part_name(name):
    # ZIP members use OPC URI escaping; BlockMap and preparation use file names.
    # Decode once, preserving literal '+' and rejecting encoded separators.
    if re.search(r'%(?![0-9a-fA-F]{2})|%(?:2f|5c)', name, re.I):
        raise ValueError('Invalid MSIX part URI')
    return safe_name(unquote_to_bytes(name).decode('utf-8', errors='strict'))


def check(package, prepared, signed=False):
    if prepared.get('schema') != 1 or prepared.get('scope') != 'development-msix-layout' or prepared.get('redistributionApproved') is not False:
        raise ValueError('Expected development preparation receipt')
    expected = prepared['files']
    if not 1 <= len(expected) <= 2000:
        raise ValueError('Invalid inventory size')
    expected_names = {safe_name(n) for n in expected}
    if len(expected_names) != len(expected):
        raise ValueError('Duplicate payload name')
    with zipfile.ZipFile(package) as archive:
        members = archive.infolist()
        if len(members) not in ({len(expected) + 3, len(expected) + 4} if signed else {len(expected) + 2}):
            raise ValueError('Missing or extra package members')
        indexed = {}
        folded = set()
        total = 0
        for entry in members:
            name = zip_part_name(entry.filename)
            if name.casefold() in folded or entry.is_dir() or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG) or entry.flag_bits & 1:
                raise ValueError('Duplicate, encrypted or non-regular ZIP member')
            folded.add(name.casefold())
            total += entry.file_size
            if entry.file_size > 2 * 1024**3 or total > 4 * 1024**3 or entry.compress_type not in (0, 8):
                raise ValueError('Unsupported package size or compression')
            indexed[name] = entry
        footprints = {'AppxBlockMap.xml', '[Content_Types].xml'}
        if signed:
            footprints.add('AppxSignature.p7x')
            if 'AppxMetadata/CodeIntegrity.cat' in indexed:
                footprints.add('AppxMetadata/CodeIntegrity.cat')
        if set(indexed) != expected_names | footprints:
            raise ValueError('Unexpected MSIX footprint or payload')
        for name in footprints:
            if indexed[name].file_size > 4 * 1024**2:
                raise ValueError('Oversized package metadata')
        catalog = None
        if 'AppxMetadata/CodeIntegrity.cat' in footprints:
            data = archive.read(indexed['AppxMetadata/CodeIntegrity.cat'])
            catalog = {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'trust': 'not-verified'}
        blockmap = xml_document(archive.read(indexed['AppxBlockMap.xml']))
        ns = '{http://schemas.microsoft.com/appx/2010/blockmap}'
        if blockmap.tag != ns + 'BlockMap' or blockmap.get('HashMethod') != 'http://www.w3.org/2001/04/xmlenc#sha256':
            raise ValueError('Unsupported BlockMap hash algorithm')
        blocks = {}
        file_hashes = {}
        for node in blockmap:
            name = safe_name(node.attrib['Name'])
            if node.tag != ns+'File' or name in blocks or name not in expected:
                raise ValueError('Unexpected BlockMap file')
            if int(node.attrib['Size']) != expected[name]['bytes']:
                raise ValueError('BlockMap size mismatch')
            blocks[name] = []
            for child in node:
                if child.tag == ns + 'Block':
                    blocks[name].append(child)
                elif child.tag == '{http://schemas.microsoft.com/appx/2021/blockmap}FileHash':
                    # Windows SDK adds a whole-file SHA-256 alongside 64 KiB hashes.
                    # Verify it as well; do not ignore arbitrary namespace extensions.
                    if name in file_hashes or set(child.attrib) != {'Hash'} or len(child):
                        raise ValueError('Invalid or duplicate BlockMap FileHash')
                    value = base64.b64decode(child.attrib['Hash'], validate=True)
                    if len(value) != 32:
                        raise ValueError('Invalid BlockMap FileHash length')
                    file_hashes[name] = value
                else:
                    raise ValueError(f'Unexpected BlockMap element: {child.tag}')

        if set(blocks) != expected_names:
            raise ValueError('Incomplete BlockMap coverage')
        count = 0
        for name, fingerprint in expected.items():
            if indexed[name].file_size != fingerprint['bytes']:
                raise ValueError('Payload size mismatch')
            digest = hashlib.sha256()
            with archive.open(indexed[name]) as stream:
                for block in blocks[name]:
                    chunk = stream.read(65536)
                    if not chunk or base64.b64decode(block.attrib['Hash'], validate=True) != hashlib.sha256(chunk).digest():
                        raise ValueError('BlockMap hash mismatch')
                    digest.update(chunk)
                    count += 1
                if stream.read(1):
                    raise ValueError('Missing block hash')
            if name in file_hashes and digest.digest() != file_hashes[name]:
                raise ValueError('BlockMap FileHash mismatch')
            if digest.hexdigest() != fingerprint['sha256']:
                raise ValueError('Payload SHA-256 mismatch')
        manifest = xml_document(archive.read(indexed['AppxManifest.xml']))
        identity = manifest.find('{http://schemas.microsoft.com/appx/manifest/foundation/windows10}Identity')
        c = prepared['config']
        if c.get('architecture', 'x64') not in ('x64', 'arm64'):
            raise ValueError('Unsupported package architecture')
        if identity is None or identity.attrib != {'Name': c['identity'], 'Publisher': c['publisher'], 'Version': c['version'], 'ProcessorArchitecture': c.get('architecture', 'x64')}:
            raise ValueError('Package identity mismatch')
        if (c.get('storeSubmissionAllowed') is not False or c.get('channel') != 'local-development'
            or c.get('identity') != 'Z8Work.Desktop.Dev' or c.get('publisher') != 'CN=Z8.Work Development'):
            raise ValueError('Not a development package')
    with Path(package).open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'schema': 1, 'status': 'passed', 'scope': 'signed-development-msix-content' if signed else 'unsigned-development-msix', 'sha256': digest, 'bytes': Path(package).stat().st_size, 'payloadFiles': len(expected), 'verifiedBlocks': count, 'verifiedFileHashes': len(file_hashes), 'signature': 'present-not-verified' if signed else 'not-present', 'codeIntegrity': catalog, 'installation': 'not-run', 'redistributionApproved': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', required=True)
    parser.add_argument('--prepared', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--signed', action='store_true', help='Require signature footprint; does NOT verify signature or trust')
    args = parser.parse_args()
    if Path(args.output).exists():
        raise ValueError('Output report already exists')
    prepared_path = Path(args.prepared)
    if prepared_path.stat().st_size > 2 * 1024**2:
        raise ValueError('Preparation receipt too large')
    with zipfile.ZipFile(args.package) as archive:
        info = archive.getinfo('AppxBlockMap.xml')
        if info.file_size > 4 * 1024**2:
            raise ValueError('Oversized BlockMap')
        metadata_path = Path(args.output).with_suffix('.blockmap.xml')
        with metadata_path.open('xb') as stream:
            stream.write(archive.read(info))
    result = check(args.package, json.loads(prepared_path.read_text()), signed=args.signed)
    with Path(args.output).open('x') as stream:
        json.dump(result, stream, indent=2)
        stream.write('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
