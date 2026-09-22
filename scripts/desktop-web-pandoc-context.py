"""Prepare a pinned Pandoc WASM source and toolchain context.

The collected Git trees are audited before copying. Remote Cabal packages are
replaced by local audited trees; every historical tool archive is hash checked.
This prepares inputs only. A successful build and binary comparison are separate
release evidence.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil

spec = importlib.util.spec_from_file_location(
    'git_sources', Path(__file__).with_name('desktop-web-git-sources.py'))
git_sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(git_sources)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def collection_name(repository):
    return repository.replace('/', '__')


def verify_collection(collection, entry):
    report = json.loads((collection / 'report.json').read_text())
    source = report['sources'][0]
    expected = (entry['repository'], entry['commit'], entry['archiveSha256'])
    actual = (source['repository'], source['commit'], source['archiveSha256'])
    if actual != expected:
        raise ValueError('Collected source identity differs: ' + entry['repository'])
    archive = collection / source['archive']
    if sha256(archive) != entry['archiveSha256']:
        raise ValueError('Source archive digest differs: ' + entry['repository'])
    audit = git_sources.audit_sources(collection)
    if audit['status'] != 'passed':
        raise ValueError('Source Git blob verification failed: ' + entry['repository'])
    return audit['checkedBlobs']


def repository_name(url):
    prefix = 'https://github.com/'
    if not url.startswith(prefix):
        raise ValueError('Unexpected source repository URL: ' + url)
    return url[len(prefix):].removesuffix('.git')


def local_project(original, lock):
    if hashlib.sha256(original.encode()).hexdigest() != lock['projectSha256']:
        raise ValueError('Upstream cabal.project digest mismatch')
    blocks = list(re.finditer(
        r'(?ms)^source-repository-package\n(?P<body>(?:  [^\n]*\n)+)', original))
    expected = {
        (entry['repository'], entry['commit'], entry.get('upstreamSubdir'))
        for entry in lock['sources'][1:]
    }
    actual = set()
    for match in blocks:
        fields = {}
        for line in match.group('body').splitlines():
            key, value = line.strip().split(':', 1)
            fields[key] = value.strip()
        actual.add((repository_name(fields['location']), fields['tag'], fields.get('subdir')))
    if actual != expected or len(blocks) != len(expected):
        raise ValueError('Pinned source-repository-package boundary changed')
    result = re.sub(
        r'(?ms)^source-repository-package\n(?:  [^\n]*\n)+', '', original)
    marker = '          pandoc-cli\n'
    if result.count(marker) != 1:
        raise ValueError('Pandoc package boundary changed')
    packages = []
    for entry in lock['sources'][1:]:
        suffix = '' if entry['localPackage'] == '.' else '/' + entry['localPackage']
        packages.append(f"          ../vendor/{entry['name']}{suffix}\n")
    return result.replace(marker, marker + ''.join(packages))


def prepare(collection_root, metadata_collection, tool_inputs, output, lock):
    collection_root = Path(collection_root).resolve()
    metadata_collection = Path(metadata_collection).resolve()
    tool_inputs = Path(tool_inputs).resolve()
    output = Path(output).resolve()
    if output.exists():
        raise ValueError('Output must be a new directory')
    if lock.get('schema') != 1 or lock.get('indexState') != '2024-11-15T08:25:42Z':
        raise ValueError('Unexpected Pandoc build lock')
    repositories = [entry['repository'] for entry in lock['sources']]
    if len(repositories) != len(set(repositories)):
        raise ValueError('Duplicate source repository')

    checked = 0
    collections = {}
    for entry in lock['sources']:
        path = collection_root / collection_name(entry['repository'])
        checked += verify_collection(path, entry)
        collections[entry['name']] = path

    metadata_entry = {
        'repository': lock['toolchain']['metadataRepository'],
        'commit': lock['toolchain']['metadataCommit'],
    }
    metadata_report = json.loads((metadata_collection / 'report.json').read_text())
    metadata_source = metadata_report['sources'][0]
    if (metadata_source['repository'], metadata_source['commit']) != (
            metadata_entry['repository'], metadata_entry['commit']):
        raise ValueError('Toolchain metadata identity differs')
    metadata_archive = metadata_collection / metadata_source['archive']
    if (metadata_source['archiveSha256'] !=
            lock['toolchain']['metadataArchiveSha256'] or
            sha256(metadata_archive) != lock['toolchain']['metadataArchiveSha256']):
        raise ValueError('Toolchain metadata archive differs')
    metadata_audit = git_sources.audit_sources(metadata_collection)
    if metadata_audit['status'] != 'passed':
        raise ValueError('Toolchain metadata Git blob verification failed')
    checked += metadata_audit['checkedBlobs']
    for name, digest in lock['toolchain']['metadataFiles'].items():
        if sha256(metadata_collection / 'source' / name) != digest:
            raise ValueError('Toolchain metadata file differs: ' + name)

    for archive in lock['toolchain']['archives']:
        path = tool_inputs / archive['name']
        if not path.is_file() or sha256(path) != archive['sha256']:
            raise ValueError('Toolchain archive differs: ' + archive['name'])

    original = (collections['pandoc'] / 'source/cabal.project').read_text()
    project = local_project(original, lock)
    output.mkdir(parents=True)
    shutil.copytree(collections['pandoc'] / 'source', output / 'source', symlinks=True)
    (output / 'source/cabal.project').write_text(project)
    for entry in lock['sources'][1:]:
        target = output / 'vendor' / entry['name']
        shutil.copytree(collections[entry['name']] / 'source', target, symlinks=True)
        package = target if entry['localPackage'] == '.' else target / entry['localPackage']
        if len(list(package.glob('*.cabal'))) != 1:
            raise ValueError('Expected one local Cabal package: ' + entry['name'])
    shutil.copytree(metadata_collection / 'source', output / 'toolchain-metadata', symlinks=True)
    (output / 'inputs').mkdir()
    checksums = []
    for archive in lock['toolchain']['archives']:
        shutil.copy2(tool_inputs / archive['name'], output / 'inputs' / archive['name'])
        checksums.append(archive['sha256'] + '  inputs/' + archive['name'] + '\n')
    (output / 'toolchain.sha256').write_text(''.join(checksums))

    for name in ['desktop-web-pandoc-toolchain.sh', 'desktop-web-pandoc-build.sh']:
        script = Path(__file__).with_name(name)
        shutil.copy2(script, output / name)

    config = (metadata_collection / 'source/cabal.th.config').read_text()
    if 'http-transport:' in config:
        raise ValueError('Historical Cabal transport boundary changed')
    (output / 'cabal.config').write_text(config + '\nhttp-transport: curl\n')
    (output / 'source-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
    result = {
        'schema': 1,
        'status': 'context-prepared',
        'checkedGitBlobs': checked,
        'sourceTrees': len(lock['sources']) + 1,
        'toolArchives': len(lock['toolchain']['archives']),
        'projectSha256': hashlib.sha256(project.encode()).hexdigest(),
        'scripts': {
            name: sha256(output / name) for name in
            ['desktop-web-pandoc-toolchain.sh', 'desktop-web-pandoc-build.sh']
        },
        'build': 'not-run',
        'binaryBinding': 'unverified',
    }
    (output / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collection-root', type=Path, required=True)
    parser.add_argument('--metadata-collection', type=Path, required=True)
    parser.add_argument('--tool-inputs', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--lock', type=Path,
                        default=Path('packaging/desktop-web/pandoc-source-build.json'))
    args = parser.parse_args()
    print(json.dumps(prepare(args.collection_root, args.metadata_collection,
                             args.tool_inputs, args.output,
                             json.loads(args.lock.read_text()))))
