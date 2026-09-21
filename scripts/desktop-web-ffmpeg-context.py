"""Prepare a pinned FFmpeg reconstruction context. Does not build or replace assets.
Docker still needs network for apt and Emscripten ports: this is not a hermetic build.
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


def render_dockerfile(original, lock):
    if hashlib.sha256(original.encode()).hexdigest() != lock['dockerfileSha256']:
        raise ValueError('Upstream Dockerfile digest mismatch')
    image = lock['emsdkImage']
    if not re.fullmatch(r'emscripten/emsdk@sha256:[0-9a-f]{64}', image):
        raise ValueError('Expected immutable emsdk image digest')
    deps = lock['dependencies']
    repos = [d['repository'] for d in deps]
    if len(set(repos)) != len(repos):
        raise ValueError('Duplicate dependency')
    for dep in deps:
        git_sources.github_repository(dep['repository'], 'https://github.com/' + dep['repository'] + '.git')
        if not re.fullmatch('[0-9a-f]{40}', dep['commit']):
            raise ValueError('Expected full Git commit')
    text = original.replace('# syntax=docker/dockerfile-upstream:master-labs\n', '')
    text = text.replace('FROM emscripten/emsdk:3.1.40 AS emsdk-base', f'FROM {image} AS emsdk-base')
    replaced = []
    def replace(match):
        repo = match.group(1)
        if repo not in repos:
            raise ValueError('Unpinned upstream source: ' + repo)
        replaced.append(repo)
        return 'COPY sources/' + repo.replace('/', '__') + '/ /src/'
    text = re.sub(r'ADD https://github.com/([^ ]+)\.git#\$\w+ /src', replace, text)
    zimg = 'RUN git clone --recursive -b $ZIMG_BRANCH https://github.com/sekrit-twc/zimg.git /src'
    if zimg not in text or 'sekrit-twc/zimg' not in repos:
        raise ValueError('Missing zimg source instruction')
    text = text.replace(zimg, 'COPY sources/sekrit-twc__zimg/ /src/')
    replaced.append('sekrit-twc/zimg')
    if sorted(replaced) != sorted(repos) or re.search(r'(ADD https?://|git clone)', text):
        raise ValueError('Source lock does not cover Dockerfile')
    return text


def prepare(collection, output, lock):
    collection, output = Path(collection).resolve(), Path(output).resolve()
    if output.exists():
        raise ValueError('Output must be a new directory')
    wrapper = {'repository': 'ffmpegwasm/ffmpeg.wasm', 'commit': lock['wrapperCommit']}
    inputs = [wrapper] + lock['dependencies']
    # Verify every source before creating any build context.
    for entry in inputs:
        directory = collection / entry['repository'].replace('/', '__')
        report = json.loads((directory / 'report.json').read_text())
        main = report['sources'][0]
        if main['repository'] != entry['repository'] or main['commit'] != entry['commit']:
            raise ValueError('Collected source does not match dependency lock')
        if git_sources.audit_sources(directory)['status'] != 'passed':
            raise ValueError('Collected Git blobs differ: ' + entry['repository'])
    src = collection / 'ffmpegwasm__ffmpeg.wasm/source'
    dockerfile = render_dockerfile((src / 'Dockerfile').read_text(), lock)
    output.mkdir(parents=True)
    for name in ['build', 'src']:
        shutil.copytree(src / name, output / name, symlinks=True)
    # Upstream bare `make -j` is unbounded and can exhaust an emulated builder.
    capped = []
    for script in sorted((output / 'build').glob('*.sh')):
        original = script.read_text()
        bounded = re.sub(r'(?<!\S)-j(?=\s|$)', '-j2', original)
        if bounded != original:
            script.write_text(bounded)
            capped.append(script.name)
    for entry in lock['dependencies']:
        name = entry['repository'].replace('/', '__')
        shutil.copytree(collection / name / 'source', output / 'sources' / name, symlinks=True)
    (output / 'Dockerfile').write_text(dockerfile)
    (output / 'source-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
    report = {'schema': 1, 'status': 'context-prepared', 'sources': len(inputs), 'historicalBinaryBinding': 'unverified', 'build': 'not-run', 'remainingNetworkInputs': ['apt packages', 'Emscripten ports'], 'buildScriptPatch': {'purpose': 'bound compilation parallelism', 'makeJobs': 2, 'files': capped}, 'dockerfileSha256': hashlib.sha256(dockerfile.encode()).hexdigest()}
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collection', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--lock', type=Path, default=Path('packaging/desktop-web/ffmpeg-source-dependencies.json'))
    args = parser.parse_args()
    print(json.dumps(prepare(args.collection, args.output, json.loads(args.lock.read_text()))))
