"""Offline regressions for the Pandoc source-context trust boundary."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    'context', Path(__file__).resolve().parents[1] / 'scripts/desktop-web-pandoc-context.py')
context = importlib.util.module_from_spec(spec)
spec.loader.exec_module(context)


class PandocContextTests(unittest.TestCase):
    def setUp(self):
        self.original = (
            'packages: .\n'
            '          pandoc-cli\n\n'
            'index-state: 2024-11-15T08:25:42Z\n\n'
            'source-repository-package\n'
            '  type: git\n'
            '  location: https://github.com/example/one.git\n'
            '  tag: ' + '1' * 40 + '\n'
            '  subdir: package-one\n\n'
            'source-repository-package\n'
            '  type: git\n'
            '  location: https://github.com/example/two\n'
            '  tag: ' + '2' * 40 + '\n')
        self.lock = {
            'projectSha256': hashlib.sha256(self.original.encode()).hexdigest(),
            'sources': [
                {'name': 'pandoc', 'repository': 'example/pandoc',
                 'commit': '0' * 40, 'archiveSha256': 'a' * 64},
                {'name': 'one', 'repository': 'example/one',
                 'commit': '1' * 40, 'localPackage': 'package-one',
                 'upstreamSubdir': 'package-one', 'archiveSha256': 'b' * 64},
                {'name': 'two', 'repository': 'example/two',
                 'commit': '2' * 40, 'localPackage': '.',
                 'archiveSha256': 'c' * 64},
            ],
        }

    def test_replaces_all_remote_packages_with_audited_local_paths(self):
        result = context.local_project(self.original, self.lock)
        self.assertNotIn('source-repository-package', result)
        self.assertIn('../vendor/one/package-one', result)
        self.assertIn('../vendor/two\n', result)
        self.assertIn('index-state: 2024-11-15T08:25:42Z', result)

    def test_changed_project_fails_before_rewrite(self):
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            context.local_project(self.original + '-- injected\n', self.lock)

    def test_build_fixes_object_order_and_timestamp_inputs(self):
        script = (Path(__file__).resolve().parents[1] /
                  'scripts/desktop-web-pandoc-build.sh').read_text()
        self.assertIn('--ghc-options=-fobject-determinism', script)
        self.assertIn('SOURCE_DATE_EPOCH=1731659142', script)
        self.assertIn('TZ=UTC', script)

    def test_missing_or_unlocked_repository_fails(self):
        changed = self.original.replace('example/two', 'example/unlocked')
        self.lock['projectSha256'] = hashlib.sha256(changed.encode()).hexdigest()
        with self.assertRaisesRegex(ValueError, 'boundary changed'):
            context.local_project(changed, self.lock)

    def fixture_collection(self, root):
        source = root / 'source'
        metadata = root / 'metadata'
        archives = root / 'archives'
        source.mkdir(parents=True)
        metadata.mkdir()
        archives.mkdir()
        data = b'pinned source\n'
        (source / 'source.txt').write_bytes(data)
        tree = {'truncated': False, 'tree': [{
            'type': 'blob', 'mode': '100644', 'path': 'source.txt',
            'sha': hashlib.sha1(
                b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest(),
        }]}
        raw_tree = json.dumps(tree).encode()
        (metadata / 'tree.json').write_bytes(raw_tree)
        archive = b'fixed archive'
        (archives / 'source.tar.gz').write_bytes(archive)
        digest = hashlib.sha256(archive).hexdigest()
        (root / 'report.json').write_text(json.dumps({'sources': [{
            'repository': 'example/source', 'commit': '3' * 40,
            'path': 'source', 'archive': 'archives/source.tar.gz',
            'archiveSha256': digest, 'tree': 'metadata/tree.json',
            'treeSha256': hashlib.sha256(raw_tree).hexdigest(),
        }]}))
        return {'repository': 'example/source', 'commit': '3' * 40,
                'archiveSha256': digest}

    def test_collection_requires_archive_and_git_blob_integrity(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            entry = self.fixture_collection(root)
            self.assertEqual(context.verify_collection(root, entry), 1)
            (root / 'source/untracked').write_text('injected')
            with self.assertRaisesRegex(ValueError, 'Git blob verification failed'):
                context.verify_collection(root, entry)
            (root / 'source/untracked').unlink()
            (root / 'archives/source.tar.gz').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'archive digest differs'):
                context.verify_collection(root, entry)


if __name__ == '__main__':
    unittest.main()
