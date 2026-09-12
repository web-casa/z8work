"""Synthetic ZIP/BlockMap fixtures, not installable or signed MSIX packages."""
import base64
import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

path = Path(__file__).resolve().parents[2] / 'scripts/desktop-msix-check.py'
spec = importlib.util.spec_from_file_location('msix_check', path)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.package = Path(self.temp.name) / 'test.msix'
        self.payload = {
            'AppxManifest.xml': b'<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"><Identity Name="Z8Work.Desktop.Dev" Publisher="CN=Z8.Work Development" Version="1.0.0.0" ProcessorArchitecture="x64"/></Package>',
            'bin/data': b'abc' * 30000,
            'empty': b'',
        }
        self.prepared = {'schema': 1, 'scope': 'development-msix-layout', 'redistributionApproved': False, 'config': {'identity': 'Z8Work.Desktop.Dev', 'publisher': 'CN=Z8.Work Development', 'version': '1.0.0.0', 'channel': 'local-development', 'storeSubmissionAllowed': False}, 'files': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in self.payload.items()}}
        self.map = '<BlockMap xmlns="http://schemas.microsoft.com/appx/2010/blockmap" HashMethod="http://www.w3.org/2001/04/xmlenc#sha256">'
        for name, data in self.payload.items():
            self.map += f'<File Name="{name}" Size="{len(data)}">'
            for offset in range(0, len(data), 65536):
                self.map += '<Block Hash="' + base64.b64encode(hashlib.sha256(data[offset:offset+65536]).digest()).decode() + '"/>'
            self.map += '</File>'
        self.map += '</BlockMap>'

    def write(self, extra=None):
        with zipfile.ZipFile(self.package, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in self.payload.items():
                archive.writestr(name, data)
            archive.writestr('AppxBlockMap.xml', self.map)
            archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
            if extra:
                archive.writestr(*extra)

    def test_valid_multiblock_archive(self):
        self.write()
        result = checker.check(self.package, self.prepared)
        self.assertEqual(result['verifiedBlocks'], 3)
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['signature'], 'not-present')

    def test_arm64_manifest_is_bound_to_the_prepared_architecture(self):
        original = self.payload['AppxManifest.xml']
        data = original.replace(b'ProcessorArchitecture="x64"', b'ProcessorArchitecture="arm64"')
        self.payload['AppxManifest.xml'] = data
        self.prepared['files']['AppxManifest.xml'] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        self.map = self.map.replace(f'Name="AppxManifest.xml" Size="{len(original)}"', f'Name="AppxManifest.xml" Size="{len(data)}"')
        self.map = self.map.replace(base64.b64encode(hashlib.sha256(original).digest()).decode(), base64.b64encode(hashlib.sha256(data).digest()).decode())
        self.prepared['config']['architecture'] = 'arm64'
        self.write()
        self.assertEqual(checker.check(self.package, self.prepared)['status'], 'passed')
        self.prepared['config']['architecture'] = 'x64'
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            checker.check(self.package, self.prepared)

    def add_file_hash(self, value=None, namespace='http://schemas.microsoft.com/appx/2021/blockmap'):
        value = value if value is not None else hashlib.sha256(self.payload['bin/data']).digest()
        tag = f'<b4:FileHash xmlns:b4="{namespace}" Hash="{base64.b64encode(value).decode()}"/>'
        start = self.map.index('<File Name="bin/data"')
        end = self.map.index('</File>', start)
        self.map = self.map[:end] + tag + self.map[end:]

    def test_windows_sdk_whole_file_hash_is_verified_with_blocks(self):
        self.add_file_hash()
        self.write()
        result = checker.check(self.package, self.prepared)
        self.assertEqual(result['verifiedFileHashes'], 1)
        self.assertEqual(result['verifiedBlocks'], 3)

    def test_whole_file_hash_tampering_is_rejected(self):
        self.add_file_hash(b'x' * 32)
        self.write()
        with self.assertRaisesRegex(ValueError, 'FileHash mismatch'):
            checker.check(self.package, self.prepared)

    def test_file_hash_does_not_replace_block_checks(self):
        self.add_file_hash()
        self.map = self.map.replace('Hash="', 'Hash="A', 1)
        self.write()
        with self.assertRaises(ValueError):
            checker.check(self.package, self.prepared)

    def test_unknown_extension_namespace_is_rejected(self):
        self.add_file_hash(namespace='https://example.invalid/blockmap')
        self.write()
        with self.assertRaisesRegex(ValueError, 'Unexpected BlockMap element'):
            checker.check(self.package, self.prepared)

    def test_duplicate_and_short_file_hashes_are_rejected(self):
        original = self.map
        self.add_file_hash()
        self.add_file_hash()
        self.write()
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            checker.check(self.package, self.prepared)
        self.map = original
        self.add_file_hash(b'x')
        self.write()
        with self.assertRaisesRegex(ValueError, 'FileHash length'):
            checker.check(self.package, self.prepared)

    def test_payload_tampering_even_with_updated_zip_crc(self):
        self.payload['bin/data'] = b'x' * 90000
        self.write()
        with self.assertRaisesRegex(ValueError, 'BlockMap hash'):
            checker.check(self.package, self.prepared)

    def test_opc_escaped_plus_matches_literal_blockmap_name(self):
        data = self.payload.pop('bin/data')
        self.payload['bin/license%2Bspec'] = data
        self.prepared['files']['bin/license+spec'] = self.prepared['files'].pop('bin/data')
        self.map = self.map.replace('bin/data', 'bin/license+spec')
        self.write()
        self.assertEqual(checker.check(self.package, self.prepared)['status'], 'passed')
        self.assertEqual(checker.zip_part_name('bin/a+b'), 'bin/a+b')
        self.assertEqual(checker.zip_part_name('bin/a%252Bb'), 'bin/a%2Bb')

    def test_encoded_traversal_and_malformed_uri_are_rejected(self):
        for name in ['%2E%2E/escape', 'bin%2Fdata', 'bin%5cdata', 'bin/%00', 'bin/%ff', 'bin/%', 'bin/%GG']:
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    checker.zip_part_name(name)

    def test_decoded_duplicate_is_rejected(self):
        self.payload['bin/%64ata'] = self.payload.pop('empty')
        self.write()
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            checker.check(self.package, self.prepared)

    def test_blockmap_hash_tampering(self):
        self.map = self.map.replace('Hash="', 'Hash="A', 1)
        self.write()
        with self.assertRaises(ValueError):
            checker.check(self.package, self.prepared)

    def test_extra_signature_or_traversal_cannot_pass(self):
        for name in ['AppxSignature.p7x', '../escape', 'BIN/data']:
            with self.subTest(name=name):
                self.write((name, b'extra'))
                with self.assertRaises(ValueError):
                    checker.check(self.package, self.prepared)

    def test_signed_mode_requires_signature_but_does_not_claim_trust(self):
        self.write(('AppxSignature.p7x', b'not-a-real-signature'))
        result = checker.check(self.package, self.prepared, signed=True)
        self.assertEqual(result['signature'], 'present-not-verified')
        self.assertEqual(result['scope'], 'signed-development-msix-content')
        with self.assertRaises(ValueError):
            checker.check(self.package, self.prepared)
        self.write()
        with self.assertRaises(ValueError):
            checker.check(self.package, self.prepared, signed=True)

    def test_signed_catalog_is_explicit_metadata_not_a_trusted_payload(self):
        self.write(('AppxSignature.p7x', b'not-a-real-signature'))
        with zipfile.ZipFile(self.package, 'a') as archive:
            archive.writestr('AppxMetadata/CodeIntegrity.cat', b'fake catalog')
        result = checker.check(self.package, self.prepared, signed=True)
        self.assertEqual(result['codeIntegrity']['trust'], 'not-verified')
        self.assertEqual(result['codeIntegrity']['sha256'], hashlib.sha256(b'fake catalog').hexdigest())
        self.assertEqual(result['payloadFiles'], 3)
        with self.assertRaises(ValueError):
            checker.check(self.package, self.prepared)

    def test_signed_mode_does_not_allow_other_metadata(self):
        self.write(('AppxSignature.p7x', b'not-a-real-signature'))
        with zipfile.ZipFile(self.package, 'a') as archive:
            archive.writestr('AppxMetadata/extra.exe', b'unexpected')
        with self.assertRaisesRegex(ValueError, 'footprint or payload'):
            checker.check(self.package, self.prepared, signed=True)

    def test_signed_mode_still_rejects_changed_payload(self):
        self.payload['bin/data'] = b'x' * 90000
        self.write(('AppxSignature.p7x', b'not-a-real-signature'))
        with self.assertRaisesRegex(ValueError, 'BlockMap hash'):
            checker.check(self.package, self.prepared, signed=True)

    def test_xml_entities_are_rejected(self):
        self.map = '<!DOCTYPE x [<!ENTITY x "bad">]>' + self.map
        self.write()
        with self.assertRaisesRegex(ValueError, 'Unsupported XML'):
            checker.check(self.package, self.prepared)

    def test_unsafe_names(self):
        for name in ['../a', '/a', 'C:\\a', 'bin/CON.exe', 'bin/name.', 'bin/a\x00']:
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    checker.safe_name(name)

    def test_missing_block_coverage(self):
        start = self.map.index('<File Name="bin/data"')
        self.map = self.map[:start] + '</BlockMap>'
        self.write()
        with self.assertRaisesRegex(ValueError, 'coverage'):
            checker.check(self.package, self.prepared)


if __name__ == '__main__':
    unittest.main()
