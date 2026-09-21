"""Collect a fixed GitHub source tree and exact recursive gitlinks; never execute it.

Archives and Git tree responses remain in the output as independent review inputs.
This proves acquired source membership, not binary reproducibility or license approval.
"""
import argparse
import base64
import configparser
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
import time
from pathlib import Path, PurePosixPath
from urllib.request import urlopen


def safe_relative(value):
    if (not isinstance(value, str) or not value or '\\' in value or ':' in value
            or any(ord(c) < 32 for c in value)
            or any(p in ('', '.', '..') for p in value.split('/'))
            or PurePosixPath(value).is_absolute()):
        raise ValueError('Unsafe source path')
    return value


def github_repository(parent, url):
    if url.startswith('../') and '/' not in url[3:]:
        repo = parent.split('/')[0] + '/' + url[3:]
    elif url.startswith('https://github.com/'):
        repo = url[len('https://github.com/'):]
    else:
        raise ValueError('Submodule origin requires explicit review: ' + url)
    repo = repo.removesuffix('.git')
    if (not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo)
            or any(part in ('.', '..') for part in repo.split('/'))):
        raise ValueError('Invalid GitHub repository')
    return repo


def submodule_origins(text):
    config = configparser.ConfigParser(interpolation=None, strict=True)
    config.read_string(text)
    result = {}
    for section in config.sections():
        path = safe_relative(config[section]['path'])
        if path in result:
            raise ValueError('Duplicate submodule path')
        result[path] = config[section]['url']
    return result


def unpack_snapshot(archive, destination):
    destination = Path(destination)
    destination.mkdir()
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        roots = {m.name.split('/')[0] for m in members}
        if len(roots) != 1 or len(members) > 200000 or sum(m.size for m in members) > 2 * 1024**3:
            raise ValueError('Unexpected source archive size or roots')
        seen = set()
        for member in members:
            safe_relative(member.name.rstrip('/'))
            if member.name.rstrip('/') in seen:
                raise ValueError('Duplicate source archive member')
            seen.add(member.name.rstrip('/'))
            if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
                raise ValueError('Special file in source archive')
        # Python's data filter rejects absolute/out-of-tree links and devices.
        source.extractall(destination, members=members, filter='data')
    root = destination / next(iter(roots))
    if not root.is_dir() or root.is_symlink():
        raise ValueError('Source root must be a real directory')
    return root


def gitlinks(tree):
    if tree.get('truncated') is not False or not isinstance(tree.get('tree'), list):
        raise ValueError('Incomplete Git tree response')
    result = []
    for entry in tree['tree']:
        if entry.get('mode') == '160000':
            safe_relative(entry['path'])
            if entry.get('type') != 'commit' or not re.fullmatch('[a-f0-9]{40}', entry.get('sha', '')):
                raise ValueError('Invalid gitlink')
            result.append(entry)
    return result


def collect(repository, commit, output):
    github_repository(repository, 'https://github.com/' + repository)
    if not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('Full immutable commit required')
    output = Path(output).resolve()
    output.mkdir()
    (output / 'archives').mkdir()
    (output / 'metadata').mkdir()
    (output / 'staging').mkdir()
    report = {'schema': 1, 'status': 'incomplete', 'binaryBinding': 'not-verified',
              'licenseReview': 'not-complete', 'sources': []}
    active = set()

    def visit(repo, sha, target, depth=0):
        if depth > 5 or len(report['sources']) >= 100 or (repo, sha) in active:
            raise ValueError('Excessive or cyclic submodule tree')
        active.add((repo, sha))
        index = len(report['sources'])
        name = f'{index:03d}-{repo.replace("/", "_")}-{sha}'
        archive = output / 'archives' / (name + '.tar.gz')
        tree_file = output / 'metadata' / (name + '.json')
        entry = {'repository': repo, 'commit': sha, 'path': target.relative_to(output).as_posix(),
                 'status': 'incomplete', 'url': f'https://codeload.github.com/{repo}/tar.gz/{sha}'}
        report['sources'].append(entry)
        raw = subprocess.run(['gh', 'api', f'repos/{repo}/git/trees/{sha}?recursive=1'],
                             check=True, capture_output=True, timeout=60).stdout
        tree_file.write_bytes(raw)
        children = gitlinks(json.loads(raw))
        deadline = time.monotonic() + 120
        with urlopen(entry['url'], timeout=30) as response, archive.open('xb') as stream:
            total = 0
            digest = hashlib.sha256()
            while chunk := response.read(1024**2):
                if time.monotonic() > deadline:
                    raise TimeoutError('Source download exceeded deadline')
                total += len(chunk)
                if total > 256 * 1024**2:
                    raise ValueError('Source download exceeds limit')
                digest.update(chunk)
                stream.write(chunk)
        entry.update(archive=archive.relative_to(output).as_posix(), archiveSha256=digest.hexdigest(),
                     bytes=total, tree=tree_file.relative_to(output).as_posix(),
                     treeSha256=hashlib.sha256(raw).hexdigest())
        extracted = unpack_snapshot(archive, output / 'staging' / str(index))
        modules_file = extracted / '.gitmodules'
        origins = submodule_origins(modules_file.read_text()) if children else {}
        if target.exists():
            target.rmdir()  # Only an empty gitlink placeholder may be replaced.
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(extracted), target)
        for child in children:
            if child['path'] not in origins:
                raise ValueError('Gitlink missing from .gitmodules')
            destination = target / child['path']
            if not destination.resolve().is_relative_to(target.resolve()):
                raise ValueError('Submodule target escapes tree')
            visit(github_repository(repo, origins[child['path']]), child['sha'], destination, depth + 1)
        entry['status'] = 'collected'
        active.remove((repo, sha))
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f'{repo}@{sha}: collected', flush=True)

    try:
        visit(repository, commit, output / 'source')
        report['status'] = 'git-tree-and-submodules-collected'
    except Exception as error:
        report['error'] = str(error)
        raise
    finally:
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def audit_sources(output, repair=False):
    """Check Git blob IDs, recovering export-ignore / line-ending changes when asked.

    GitHub tar archives can omit export-ignore files and normalize line endings.
    Recovery uses immutable Git blob objects, not a moving branch or working tree.
    """
    output = Path(output).resolve()
    report = json.loads((output / 'report.json').read_text())
    result = {'schema': 1, 'status': 'failed', 'checkedBlobs': 0, 'restored': [], 'issues': []}
    def blob_hash(data):
        return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    expected_files = set()
    source_directories = []
    for source in report['sources']:
        tree_path = output / safe_relative(source['tree'])
        if not tree_path.resolve().is_relative_to(output):
            raise ValueError('Git metadata escapes collection directory')
        raw_tree = tree_path.read_bytes()
        if hashlib.sha256(raw_tree).hexdigest() != source['treeSha256']:
            raise ValueError('Changed Git tree metadata')
        tree = json.loads(raw_tree)
        gitlinks(tree)  # Reject truncated metadata even when no submodules exist.
        directory = output / safe_relative(source['path'])
        if not directory.resolve().is_relative_to(output):
            raise ValueError('Source directory escapes collection directory')
        source_directories.append(directory)
        for entry in tree['tree']:
            if entry['type'] != 'blob':
                continue
            path = directory / safe_relative(entry['path'])
            expected_files.add(path)
            if not path.parent.resolve().is_relative_to(directory.resolve()):
                raise ValueError('Blob path escapes source directory')
            if entry['mode'] == '120000':
                data = os.readlink(path).encode() if path.is_symlink() else None
            else:
                if path.is_symlink():
                    raise ValueError('Unexpected source symlink')
                data = path.read_bytes() if path.is_file() else None
            if data is None or blob_hash(data) != entry['sha']:
                name = path.relative_to(output).as_posix()
                if not repair:
                    result['issues'].append(name)
                    continue
                if entry['mode'] not in ('100644', '100755', '120000'):
                    raise ValueError('Non-regular Git blob requires manual recovery')
                response = subprocess.run(['gh', 'api', f'repos/{source["repository"]}/git/blobs/{entry["sha"]}'],
                                          check=True, capture_output=True, timeout=60).stdout
                blob = json.loads(response)
                if blob.get('encoding') != 'base64' or blob.get('size', 0) > 16 * 1024**2:
                    raise ValueError('Unexpected Git blob response')
                recovered = base64.b64decode(''.join(blob['content'].split()), validate=True)
                if blob_hash(recovered) != entry['sha']:
                    raise ValueError('Git blob response digest mismatch')
                result['restored'].append({'path': name, 'gitBlob': entry['sha'], 'reason': 'missing' if data is None else 'archive bytes differ'})
                path.parent.mkdir(parents=True, exist_ok=True)
                if entry['mode'] == '120000':
                    target = recovered.decode('utf8')
                    if (Path(target).is_absolute() or '\\' in target
                            or not (path.parent / target).resolve().is_relative_to(directory.resolve())):
                        raise ValueError('Git symlink escapes source directory')
                    # The tar exporter can normalize a trailing slash in a link.
                    # Replace only this link, never its target or a regular file.
                    if path.is_symlink():
                        result['restored'][-1]['previousLink'] = os.readlink(path)
                        path.unlink()
                    path.symlink_to(target)
                else:
                    path.write_bytes(recovered)
                    path.chmod(0o755 if entry['mode'] == '100755' else 0o644)
                (output / 'git-blob-recovery-progress.json').write_text(json.dumps(result, indent=2) + '\n')
            result['checkedBlobs'] += 1
    # A build context must not silently include files absent from the pinned Git trees.
    actual_files = set()
    for directory in source_directories:
        for parent, dirs, files in os.walk(directory, followlinks=False):
            actual_files.update(Path(parent) / name for name in files)
            actual_files.update(Path(parent) / name for name in dirs if (Path(parent) / name).is_symlink())
    result['issues'].extend('untracked: ' + path.relative_to(output).as_posix()
                            for path in sorted(actual_files - expected_files))
    result['status'] = 'passed' if not result['issues'] else 'failed'
    filename = 'git-blob-recovery.json' if repair else 'git-blob-audit.json'
    (output / filename).write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository')
    parser.add_argument('--commit')
    parser.add_argument('--output')
    parser.add_argument('--audit', help='Existing collection to verify against immutable Git blob IDs')
    parser.add_argument('--repair', action='store_true', help='Restore archive omissions from exact Git blobs, only with --audit')
    args = parser.parse_args()
    if args.audit:
        if args.repository or args.commit or args.output:
            parser.error('--audit cannot be combined with collection arguments')
        result = audit_sources(args.audit, args.repair)
        print(json.dumps({'status': result['status'], 'checkedBlobs': result['checkedBlobs'], 'restored': len(result['restored']), 'issues': len(result['issues'])}))
        if result['status'] != 'passed':
            raise SystemExit(1)
    else:
        if not args.repository or not args.commit or not args.output or args.repair:
            parser.error('Collection requires --repository, --commit and --output')
        collect(args.repository, args.commit, args.output)
