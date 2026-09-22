"""Run only inside the disposable container created by desktop-deb-installed.mjs."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def run(args, timeout=120):
    return subprocess.check_output(args, text=True, timeout=timeout)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def user(args, timeout=1800):
    return run(['runuser', '-u', 'z8check', '--', 'env', '-i',
                'HOME=/home/z8check', 'PATH=/usr/bin:/bin', 'LANG=C.UTF-8',
                *args], timeout)


def main():
    require(Path('/.dockerenv').exists() and os.getuid() == 0
            and os.environ.get('Z8_DISPOSABLE_CHECK') == '1',
            'Only the disposable Docker test container is supported')
    require(len(sys.argv) == 2 and sys.argv[1] in ('prepare', 'verify'), 'Invalid phase')
    machine = os.environ['Z8_MACHINE']
    require(machine in ('aarch64', 'x86_64') and platform.machine() == machine,
            'Native architecture required')
    candidate = Path('/candidate.deb')
    require(digest(candidate) == os.environ['Z8_PACKAGE_SHA256'], 'Candidate SHA-256 mismatch')
    require(run(['dpkg-deb', '-f', str(candidate), 'Package']).strip() == 'z8-work',
            'Unexpected package identity')
    architecture = 'arm64' if machine == 'aarch64' else 'amd64'
    require(run(['dpkg-deb', '-f', str(candidate), 'Architecture']).strip() == architecture,
            'Package architecture mismatch')
    if sys.argv[1] == 'prepare':
        # The minimal Ubuntu container drops /usr/share/doc by default. Include
        # only this package's documentation, as a normal desktop install does.
        Path('/etc/dpkg/dpkg.cfg.d/z8-check-documents').write_text(
            'path-include=/usr/share/doc/z8-work\n'
            'path-include=/usr/share/doc/z8-work/*\n')
        subprocess.run(['apt-get', '-o', 'Acquire::Retries=1', '-o',
                        'Acquire::http::Timeout=30', 'update'], check=True, timeout=180)
        subprocess.run(['apt-get', '-o', 'Acquire::Retries=1', '-o',
                        'Acquire::http::Timeout=30', 'install', '--no-install-recommends',
                        '-y', str(candidate)], check=True, timeout=600)
        subprocess.run(['useradd', '-m', '-s', '/bin/bash', 'z8check'], check=True)
        return

    require(sorted(p.name for p in Path('/sys/class/net').iterdir()) == ['lo'],
            'Conversion must run without a network interface')
    require(run(['dpkg-query', '-W', '-f=${Status}', 'z8-work']) == 'install ok installed',
            'Package not installed')
    expected = Path('/expected')
    subprocess.run(['dpkg-deb', '-x', str(candidate), str(expected)], check=True, timeout=120)
    checked = 0
    installed_files = []
    for item in expected.rglob('*'):
        installed = Path('/') / item.relative_to(expected)
        if item.is_symlink():
            require(installed.is_symlink() and os.readlink(item) == os.readlink(installed),
                    f'Installed symlink mismatch: {installed}')
            installed_files.append(installed)
            checked += 1
        elif item.is_file():
            require(installed.is_file() and not installed.is_symlink()
                    and digest(item) == digest(installed)
                    and item.stat().st_mode & 0o7777 == installed.stat().st_mode & 0o7777,
                    f'Installed file mismatch: {installed}')
            installed_files.append(installed)
            checked += 1
    require(checked > 0, 'No installed files checked')
    shutil.rmtree(expected)
    app = Path('/usr/bin/z8-desktop')
    app_hash = digest(app)
    info = json.loads(user([str(app), '--build-info'], 30))
    require(info['arch'] == machine and info['engines'] == 'bundled'
            and info['customProtocol'] is True and info['os'] == 'linux', 'Wrong build')
    Path('/build-info.json').write_text(json.dumps(info, indent=2) + '\n')
    root = Path('/usr/lib/Z8.Work Desktop Dev/engines')
    manifest = json.loads((root / 'engines.json').read_text())
    loader = root / manifest['loader']
    require(loader.resolve().is_relative_to(root.resolve()), 'Loader escapes engine directory')
    uid = int(user(['id', '-u'], 30).strip())
    require(uid > 0, 'Conversion user must not be root')
    quality = user([str(loader), '--library-path', str(root / 'lib'),
                    str(root / 'validation/bundle-check'), str(root), '--quality'])
    json.loads(quality)
    Path('/quality.json').write_text(quality)
    sentinel = Path('/home/z8check/user-owned-output.txt')
    user(['sh', '-c', 'printf preserved > /home/z8check/user-owned-output.txt'], 30)
    paths = [app, root, Path('/usr/share/applications/work.z8.desktop.m0.desktop'),
             Path('/usr/share/icons/hicolor/192x192/apps/z8-work.png')]
    require(all(p.exists() for p in paths), 'Missing installed integration')
    subprocess.run(['apt-get', 'purge', '-y', 'z8-work'], check=True, timeout=120)
    require(all(not os.path.lexists(p) for p in installed_files),
            'Package files retained after purge')
    require(sentinel.read_text() == 'preserved' and sentinel.stat().st_uid == uid,
            'User-owned file changed during purge')
    remaining = subprocess.run(['dpkg-query', '-W', '-f=${Status}', 'z8-work'],
                               text=True, capture_output=True, timeout=30)
    require(remaining.returncode == 1 or remaining.stdout.strip() == 'unknown ok not-installed',
            'Package still installed')
    Path('/check.json').write_text(json.dumps({
        'status': 'passed', 'machine': machine, 'ordinaryUserUid': uid,
        'installedFilesChecked': checked, 'installedApplicationHash': app_hash,
        'installation': 'passed', 'networkInterfaces': ['lo'],
        'containerDocumentationFilter': 'include-z8-work-only',
        'removal': 'passed', 'unownedFileRetained': True,
        'gui': 'not-run', 'upgrade': 'not-run',
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
