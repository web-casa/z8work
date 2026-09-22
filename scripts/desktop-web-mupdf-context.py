"""Prepare an audited MuPDF WASM rebuild; never modify the collected source.

The immutable SDK image supplies the compiler and runtime libraries. The build
runs without network. This stage builds WASM, the unminified loader and type
declarations. desktop-web-mupdf-js.mjs runs the pinned JavaScript tools afterward.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil

spec = importlib.util.spec_from_file_location('git_sources', Path(__file__).with_name('desktop-web-git-sources.py'))
git_sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(git_sources)


def build_script(original, lock):
    if hashlib.sha256(original.encode()).hexdigest() != lock['buildScriptSha256']:
        raise ValueError('Upstream build script digest mismatch')
    if lock['emsdkVersion'] != '4.0.8':
        raise ValueError('Unexpected SDK version')
    for instruction in ['emsdk install 4.0.8 >/dev/null || exit\n', 'emsdk activate 4.0.8 >/dev/null || exit\n', 'make --no-print-directory -j $(nproc)', 'echo "TYPESCRIPT"', 'npx tsc -p .']:
        if original.count(instruction) != 1:
            raise ValueError('Upstream build boundary changed')
    result = original.split('npx tsc -p .')[0]
    result = result.replace('#!/bin/bash\n', '#!/bin/bash\nset -eo pipefail\n')
    result = result.replace('emsdk install 4.0.8 >/dev/null || exit\n', '')
    result = result.replace('emsdk activate 4.0.8 >/dev/null || exit\n', 'emcc --version | head -1 | grep -F "4.0.8"\n')
    return result.replace('make --no-print-directory -j $(nproc)', 'make --no-print-directory -j2')


def prepare(collection, output, lock):
    collection, output = Path(collection).resolve(), Path(output).resolve()
    if output.exists() or collection == output or collection in output.parents:
        raise ValueError('Output must be a new directory outside collection')
    if not re.fullmatch(r'emscripten/emsdk@sha256:[0-9a-f]{64}', lock['emsdkImage']):
        raise ValueError('Expected immutable SDK image')
    report = json.loads((collection / 'report.json').read_text())
    main = report['sources'][0]
    if main['repository'] != lock['repository'] or main['commit'] != lock['commit']:
        raise ValueError('Source identity differs from lock')
    audit = git_sources.audit_sources(collection)
    if audit['status'] != 'passed':
        raise ValueError('Source Git blob verification failed')
    original = (collection / 'source/platform/wasm/tools/build.sh').read_text()
    script = build_script(original, lock)
    output.mkdir(parents=True)
    shutil.copytree(collection / 'source', output / 'source', symlinks=True)
    (output / 'build-wasm.sh').write_text(script)
    (output / 'source-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
    result = {
        'schema': 1, 'status': 'context-prepared',
        'sourceTrees': len(report['sources']), 'checkedBlobs': audit['checkedBlobs'],
        'buildScriptSha256': hashlib.sha256(script.encode()).hexdigest(),
        'patches': ['fail on command/pipeline errors', 'use preinstalled locked SDK', 'limit make to two jobs', 'run TypeScript/minifier separately with pinned tools'],
        'build': 'not-run', 'binaryBinding': 'unverified',
    }
    (output / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collection', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--lock', type=Path, default=Path('packaging/desktop-web/mupdf-source-build.json'))
    args = parser.parse_args()
    print(json.dumps(prepare(args.collection, args.output, json.loads(args.lock.read_text()))))
