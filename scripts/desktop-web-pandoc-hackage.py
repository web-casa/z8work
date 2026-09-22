"""Bind a Cabal plan to the exact cached Hackage source archives."""
import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def create_lock(plan_file, cache, project_file):
    plan_file, cache = Path(plan_file), Path(cache)
    plan = json.loads(plan_file.read_text())
    if (plan.get('compiler-id') != 'ghc-9.12.0.20241115' or
            plan.get('os') != 'wasi' or plan.get('arch') != 'wasm32'):
        raise ValueError('Unexpected Cabal plan target')
    if 'index-state: 2024-11-15T08:25:42Z' not in Path(project_file).read_text():
        raise ValueError('Unexpected Hackage index state')
    units = {unit['id']: unit for unit in plan['install-plan']}
    targets = [unit for unit in plan['install-plan']
               if unit.get('pkg-name') == 'pandoc-cli' and
               unit.get('component-name') == 'exe:pandoc']
    if len(targets) != 1:
        raise ValueError('Expected one Pandoc executable plan target')
    closure = set()
    pending = [targets[0]['id']]
    while pending:
        unit_id = pending.pop()
        if unit_id in closure:
            continue
        if unit_id not in units:
            raise ValueError('Plan dependency is missing: ' + unit_id)
        closure.add(unit_id)
        unit = units[unit_id]
        pending.extend(unit.get('depends', []))
        pending.extend(unit.get('exe-depends', []))

    packages = {}
    for unit_id in closure:
        unit = units[unit_id]
        source = unit.get('pkg-src', {})
        if unit.get('type') != 'configured' or source.get('type') != 'repo-tar':
            continue
        key = (unit['pkg-name'], unit['pkg-version'])
        identity = (unit['pkg-cabal-sha256'], unit['pkg-src-sha256'])
        if key in packages and packages[key] != identity:
            raise ValueError('Inconsistent package hashes: ' + '-'.join(key))
        packages[key] = identity
    result = []
    expected_files = set()
    for (name, version), (cabal_hash, source_hash) in sorted(packages.items()):
        relative = Path(name) / version / f'{name}-{version}.tar.gz'
        archive = cache / relative
        if not archive.is_file() or sha256(archive) != source_hash:
            raise ValueError('Hackage archive differs: ' + relative.as_posix())
        expected_files.add(archive.resolve())
        result.append({
            'name': name, 'version': version,
            'cabalSha256': cabal_hash, 'sourceSha256': source_hash,
            'file': relative.as_posix(),
        })
    actual_files = {p.resolve() for p in cache.glob('*/*/*.tar.gz')}
    if actual_files != expected_files:
        raise ValueError('Hackage cache contains unplanned source archives')
    index = []
    for path in sorted(cache.iterdir()):
        if path.is_file() and path.name != 'hackage-security-lock':
            index.append({'file': path.name, 'sha256': sha256(path),
                          'bytes': path.stat().st_size})
    return {
        'schema': 1,
        'compiler': plan['compiler-id'],
        'target': f"{plan['arch']}-{plan['os']}",
        'indexState': '2024-11-15T08:25:42Z',
        'planSha256': sha256(plan_file),
        'targetUnit': targets[0]['id'],
        'unitCount': len(closure),
        'packageCount': len(result),
        'packages': result,
        'repositoryIndex': index,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    lock = create_lock(args.plan, args.cache, args.project)
    args.output.write_text(json.dumps(lock, indent=2) + '\n')
    print(json.dumps({'packages': lock['packageCount'],
                      'planSha256': lock['planSha256']}))
