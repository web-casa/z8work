"""Offline adversarial tests; no network, compilation or remote code execution."""
import importlib.util
import io
import json
import hashlib
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import base64
from pathlib import Path

spec = importlib.util.spec_from_file_location('sources', Path(__file__).resolve().parents[1] / 'scripts/desktop-web-git-sources.py')
sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sources)


class SourceTests(unittest.TestCase):
    def test_recovery_verifies_blob_and_preserves_safe_symlink_target(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'source/dir').mkdir(parents=True)
            (root / 'source/link').symlink_to('dir')
            data = b'dir/'
            digest = hashlib.sha1(b'blob 4\0' + data).hexdigest()
            tree = {'truncated': False, 'tree': [{'path': 'link', 'type': 'blob', 'mode': '120000', 'sha': digest}]}
            raw = json.dumps(tree).encode()
            (root / 'tree.json').write_bytes(raw)
            (root / 'report.json').write_text(json.dumps({'sources': [{'repository': 'Fixture/Repo', 'tree': 'tree.json', 'treeSha256': hashlib.sha256(raw).hexdigest(), 'path': 'source'}]}))
            response = {'encoding': 'base64', 'content': base64.b64encode(data).decode(), 'size': len(data)}
            with patch.object(sources.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(response).encode())):
                self.assertEqual(sources.audit_sources(root, repair=True)['status'], 'passed')
            self.assertTrue((root / 'source/dir').is_dir())
            self.assertEqual(sources.audit_sources(root)['status'], 'passed')

    def test_blob_audit_rejects_tampering_and_detects_export_omissions(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'source').mkdir()
            data = b'original source'
            (root / 'source/code').write_bytes(data)
            tree = {'truncated': False, 'tree': [{'path': 'code', 'type': 'blob', 'mode': '100644', 'sha': hashlib.sha1(b'blob 15\0' + data).hexdigest()}]}
            raw = json.dumps(tree).encode()
            (root / 'tree.json').write_bytes(raw)
            (root / 'report.json').write_text(json.dumps({'sources': [{'tree': 'tree.json', 'treeSha256': hashlib.sha256(raw).hexdigest(), 'path': 'source'}]}))
            self.assertEqual(sources.audit_sources(root)['status'], 'passed')
            (root / 'source/injected.mk').write_text('unexpected build input')
            self.assertEqual(sources.audit_sources(root)['issues'], ['untracked: source/injected.mk'])
            (root / 'source/injected.mk').unlink()
            (root / 'source/code').write_bytes(b'changed')
            self.assertEqual(sources.audit_sources(root)['issues'], ['source/code'])
            (root / 'source/code').unlink()
            self.assertEqual(sources.audit_sources(root)['issues'], ['source/code'])
            (root / 'tree.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'Changed Git tree'):
                sources.audit_sources(root)

    def test_repository_resolution_keeps_pinned_origin(self):
        self.assertEqual(sources.github_repository('ArtifexSoftware/mupdf', '../thirdparty-zlib.git'), 'ArtifexSoftware/thirdparty-zlib')
        self.assertEqual(sources.github_repository('A/B', 'https://github.com/C/D.git'), 'C/D')
        for url in ['../../other/repo.git', 'https://evil.example/a/b', 'git@github.com:a/b', '../..', '../repo?query']:
            with self.assertRaises(ValueError):
                sources.github_repository('A/B', url)

    def test_gitlink_uses_commit_not_floating_branch(self):
        tree = {'truncated': False, 'tree': [{'path': 'thirdparty/zlib', 'type': 'commit', 'mode': '160000', 'sha': 'a' * 40}]}
        self.assertEqual(sources.gitlinks(tree)[0]['sha'], 'a' * 40)
        tree['truncated'] = True
        with self.assertRaises(ValueError):
            sources.gitlinks(tree)
        tree['truncated'] = False
        tree['tree'][0]['sha'] = 'main'
        with self.assertRaises(ValueError):
            sources.gitlinks(tree)

    def test_gitmodules_rejects_duplicate_and_escaping_paths(self):
        text = '[submodule "zlib"]\npath = thirdparty/zlib\nurl = ../thirdparty-zlib.git\nbranch = main\n'
        self.assertEqual(sources.submodule_origins(text), {'thirdparty/zlib': '../thirdparty-zlib.git'})
        for bad in [text.replace('thirdparty/zlib', '../outside'), text + text.replace('"zlib"', '"other"')]:
            with self.assertRaises(ValueError):
                sources.submodule_origins(bad)

    def archive(self, root, entries):
        p = root / 'source.tar.gz'
        with tarfile.open(p, 'w:gz') as archive:
            for name, link in entries:
                info = tarfile.TarInfo(name)
                if link:
                    info.type = tarfile.SYMTYPE
                    info.linkname = link
                    archive.addfile(info)
                else:
                    data = b'source fixture'
                    info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
        return p

    def test_archive_extraction_preserves_source_and_rejects_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = self.archive(root, [('repo/src/lib.rs', None)])
            result = sources.unpack_snapshot(archive, root / 'stage')
            self.assertEqual((result / 'src/lib.rs').read_bytes(), b'source fixture')
            with self.assertRaises(FileExistsError):
                sources.unpack_snapshot(archive, root / 'stage')

    def test_archive_rejects_traversal_links_multiple_roots_and_duplicates(self):
        for entries in [[('repo/../../outside', None)], [('repo/link', '../../outside')], [('one/file', None), ('two/file', None)], [('repo/file', None), ('repo/file', None)]]:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                archive = self.archive(root, entries)
                with self.assertRaises((ValueError, tarfile.FilterError)):
                    sources.unpack_snapshot(archive, root / 'stage')
                self.assertFalse((root / 'outside').exists())


if __name__ == '__main__':
    unittest.main()
