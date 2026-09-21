"""Offline tests for Pandoc's resolved Hackage source lock."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    'hackage', Path(__file__).resolve().parents[1] / 'scripts/desktop-web-pandoc-hackage.py')
hackage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hackage)


class HackageLockTests(unittest.TestCase):
    def fixture(self, root):
        source = b'package source'
        archive = root / 'cache/demo/1.0/demo-1.0.tar.gz'
        archive.parent.mkdir(parents=True, exist_ok=True)
        archive.write_bytes(source)
        (root / 'cache/root.json').write_text('{}')
        plan = {
            'compiler-id': 'ghc-9.12.0.20241115', 'os': 'wasi', 'arch': 'wasm32',
            'install-plan': [{
                'type': 'configured', 'style': 'local', 'id': 'pandoc-target',
                'pkg-name': 'pandoc-cli', 'pkg-version': '3.5',
                'component-name': 'exe:pandoc', 'depends': ['demo-unit'],
                'exe-depends': [], 'pkg-src': {'type': 'local'},
            }, {
                'id': 'demo-unit',
                'type': 'configured', 'style': 'global', 'pkg-name': 'demo',
                'pkg-version': '1.0', 'pkg-cabal-sha256': 'c' * 64,
                'pkg-src-sha256': hashlib.sha256(source).hexdigest(),
                'pkg-src': {'type': 'repo-tar'}, 'depends': [], 'exe-depends': [],
            }],
        }
        (root / 'plan.json').write_text(json.dumps(plan))
        (root / 'cabal.project').write_text(
            'index-state: 2024-11-15T08:25:42Z\n')
        return root / 'plan.json', root / 'cache', root / 'cabal.project'

    def test_binds_plan_package_and_repository_index(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = hackage.create_lock(*self.fixture(Path(temp)))
            self.assertEqual(lock['packageCount'], 1)
            self.assertEqual(lock['packages'][0]['file'], 'demo/1.0/demo-1.0.tar.gz')
            self.assertEqual(lock['repositoryIndex'][0]['file'], 'root.json')

    def test_changed_or_unplanned_archive_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fixture = self.fixture(root)
            (root / 'cache/demo/1.0/demo-1.0.tar.gz').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'archive differs'):
                hackage.create_lock(*fixture)
            self.fixture(root)
            extra = root / 'cache/extra/1.0/extra-1.0.tar.gz'
            extra.parent.mkdir(parents=True)
            extra.write_text('extra')
            with self.assertRaisesRegex(ValueError, 'unplanned'):
                hackage.create_lock(*fixture)


if __name__ == '__main__':
    unittest.main()
