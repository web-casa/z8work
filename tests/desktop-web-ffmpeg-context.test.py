"""Offline tests for fail-closed source lock to Dockerfile conversion."""
import hashlib
import importlib.util
from pathlib import Path
import unittest
import tempfile
import json

spec = importlib.util.spec_from_file_location('context', Path(__file__).resolve().parents[1] / 'scripts/desktop-web-ffmpeg-context.py')
context = importlib.util.module_from_spec(spec)
spec.loader.exec_module(context)

class ContextTests(unittest.TestCase):
    def setUp(self):
        self.original = ('# syntax=docker/dockerfile-upstream:master-labs\n'
                         'FROM emscripten/emsdk:3.1.40 AS emsdk-base\n'
                         'ADD https://github.com/ffmpegwasm/x264.git#$X264_BRANCH /src\n'
                         'RUN git clone --recursive -b $ZIMG_BRANCH https://github.com/sekrit-twc/zimg.git /src\n')
        self.lock = {'dockerfileSha256': hashlib.sha256(self.original.encode()).hexdigest(),
                     'emsdkImage': 'emscripten/emsdk@sha256:' + 'a' * 64,
                     'dependencies': [{'repository': repo, 'commit': 'a' * 40} for repo in ['ffmpegwasm/x264', 'sekrit-twc/zimg']]}

    def collection_fixture(self, root):
        self.lock['wrapperCommit'] = 'b' * 40
        for entry in [{'repository': 'ffmpegwasm/ffmpeg.wasm', 'commit': 'b' * 40}] + self.lock['dependencies']:
            directory = root / entry['repository'].replace('/', '__')
            files = {'code.c': 'source'}
            if entry['repository'] == 'ffmpegwasm/ffmpeg.wasm':
                files = {'Dockerfile': self.original, 'build/compile.sh': 'emmake make -j\n', 'src/bind.c': 'source'}
            tree = {'truncated': False, 'tree': []}
            for name, text in files.items():
                path = directory / 'source' / name
                path.parent.mkdir(parents=True, exist_ok=True)
                data = text.encode()
                path.write_bytes(data)
                tree['tree'].append({'type': 'blob', 'mode': '100644', 'path': name, 'sha': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()})
            raw = json.dumps(tree).encode()
            (directory / 'tree.json').write_bytes(raw)
            report = {'sources': [dict(entry, path='source', tree='tree.json', treeSha256=hashlib.sha256(raw).hexdigest())]}
            (directory / 'report.json').write_text(json.dumps(report))

    def test_prepare_verifies_and_bounds_compilation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.collection_fixture(root / 'collection')
            result = context.prepare(root / 'collection', root / 'output', self.lock)
            self.assertEqual(result['sources'], 3)
            self.assertEqual((root / 'output/build/compile.sh').read_text(), 'emmake make -j2\n')
            self.assertEqual((root / 'output/sources/ffmpegwasm__x264/code.c').read_text(), 'source')
            with self.assertRaisesRegex(ValueError, 'new directory'):
                context.prepare(root / 'collection', root / 'output', self.lock)

    def test_prepare_rejects_extra_build_input_before_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.collection_fixture(root / 'collection')
            (root / 'collection/ffmpegwasm__x264/source/injected.mk').write_text('injected')
            with self.assertRaisesRegex(ValueError, 'Git blobs differ'):
                context.prepare(root / 'collection', root / 'output', self.lock)
            self.assertFalse((root / 'output').exists())

    def test_all_remote_source_fetches_become_local_copies(self):
        result = context.render_dockerfile(self.original, self.lock)
        self.assertNotIn('ADD https', result)
        self.assertNotIn('git clone', result)
        self.assertNotIn('master-labs', result)
        self.assertIn('COPY sources/ffmpegwasm__x264/ /src/', result)
        self.assertIn(self.lock['emsdkImage'], result)

    def test_upstream_change_requires_review(self):
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            context.render_dockerfile(self.original + 'RUN echo changed\n', self.lock)

    def test_missing_dependency_fails(self):
        self.lock['dependencies'].pop(0)
        with self.assertRaisesRegex(ValueError, 'Unpinned'):
            context.render_dockerfile(self.original, self.lock)

    def test_duplicate_dependency_fails(self):
        self.lock['dependencies'].append(self.lock['dependencies'][0])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            context.render_dockerfile(self.original, self.lock)

    def test_floating_commit_fails(self):
        self.lock['dependencies'][0]['commit'] = 'main'
        with self.assertRaisesRegex(ValueError, 'full Git commit'):
            context.render_dockerfile(self.original, self.lock)

    def test_floating_image_fails(self):
        self.lock['emsdkImage'] = 'emscripten/emsdk:3.1.40'
        with self.assertRaisesRegex(ValueError, 'immutable'):
            context.render_dockerfile(self.original, self.lock)

if __name__ == '__main__':
    unittest.main()
