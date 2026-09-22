"""Offline regressions for source tampering and reconstruction boundaries."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('context', Path(__file__).resolve().parents[1] / 'scripts/desktop-web-mupdf-context.py')
context = importlib.util.module_from_spec(spec)
spec.loader.exec_module(context)


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.original = ('#!/bin/bash\n'
                         'emsdk install 4.0.8 >/dev/null || exit\n'
                         'emsdk activate 4.0.8 >/dev/null || exit\n'
                         'make --no-print-directory -j $(nproc) libs\n'
                         'emcc -Os -g2 lib/mupdf.c\n'
                         'echo "TYPESCRIPT"\n'
                         'npx tsc -p .\n')
        self.lock = {'repository': 'ArtifexSoftware/mupdf', 'commit': 'a' * 40,
                     'emsdkVersion': '4.0.8', 'emsdkImage': 'emscripten/emsdk@sha256:' + 'b' * 64,
                     'buildScriptSha256': hashlib.sha256(self.original.encode()).hexdigest()}

    def fixture(self, directory):
        path = directory / 'source/platform/wasm/tools/build.sh'
        path.parent.mkdir(parents=True)
        path.write_text(self.original)
        data = self.original.encode()
        tree = {'truncated': False, 'tree': [{'type': 'blob', 'mode': '100644',
                'path': 'platform/wasm/tools/build.sh',
                'sha': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()}]}
        raw = json.dumps(tree).encode()
        (directory / 'tree.json').write_bytes(raw)
        (directory / 'report.json').write_text(json.dumps({'sources': [{
            'repository': self.lock['repository'], 'commit': self.lock['commit'],
            'path': 'source', 'tree': 'tree.json', 'treeSha256': hashlib.sha256(raw).hexdigest()}]}))

    def test_preserves_compiler_flags_and_stops_before_unpinned_npm(self):
        result = context.build_script(self.original, self.lock)
        self.assertIn('set -eo pipefail', result)
        self.assertIn('make --no-print-directory -j2 libs', result)
        self.assertIn('emcc -Os -g2 lib/mupdf.c', result)
        self.assertNotIn('emsdk install', result)
        self.assertNotIn('emsdk activate', result)
        self.assertNotIn('npx', result)

    def test_modified_upstream_script_fails(self):
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            context.build_script(self.original + 'echo injected', self.lock)

    def test_changed_build_boundary_fails_even_with_updated_hash(self):
        original = self.original.replace('echo "TYPESCRIPT"', 'echo changed')
        self.lock['buildScriptSha256'] = hashlib.sha256(original.encode()).hexdigest()
        with self.assertRaisesRegex(ValueError, 'boundary changed'):
            context.build_script(original, self.lock)

    def test_audited_copy_does_not_modify_source_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root / 'collection')
            result = context.prepare(root / 'collection', root / 'output', self.lock)
            self.assertEqual(result['checkedBlobs'], 1)
            self.assertEqual((root / 'output/source/platform/wasm/tools/build.sh').read_text(), self.original)
            self.assertEqual(context.git_sources.audit_sources(root / 'collection')['status'], 'passed')
            with self.assertRaisesRegex(ValueError, 'new directory'):
                context.prepare(root / 'collection', root / 'output', self.lock)

    def test_untracked_build_input_rejected_before_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root / 'collection')
            (root / 'collection/source/injected.mk').write_text('injected')
            with self.assertRaisesRegex(ValueError, 'Git blob verification failed'):
                context.prepare(root / 'collection', root / 'output', self.lock)
            self.assertFalse((root / 'output').exists())

    def test_mutable_image_rejected(self):
        self.lock['emsdkImage'] = 'emscripten/emsdk:4.0.8'
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, 'immutable SDK image'):
                context.prepare(Path(temp) / 'collection', Path(temp) / 'output', self.lock)


if __name__ == '__main__':
    unittest.main()
