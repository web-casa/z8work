#!/bin/bash
set -euo pipefail
trap 'chown -R "$Z8_EVIDENCE_UID:$Z8_EVIDENCE_GID" /evidence' EXIT
printf '%s  %s\n' 5ebb729b0a5813d4c21da7bb450c11229e80ac1a396637ed0e1521e9ae5f789f '/packages/z8-work_0.1.0~preview1_arm64.deb' | sha256sum --check --strict
apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=30 update
apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=30 install --no-install-recommends -y python3 '/packages/z8-work_0.1.0~preview1_arm64.deb'
useradd -m -s /bin/bash z8check
python3 - <<'PY'
import hashlib, json, os, platform, subprocess
from pathlib import Path

evidence = Path('/evidence')
def user(args, timeout=30):
    return subprocess.check_output(['runuser', '-u', 'z8check', '--', *args], text=True, timeout=timeout, cwd='/home/z8check')

assert platform.machine() == 'aarch64'
status = subprocess.check_output(['dpkg-query', '-W', '-f=${Status}', 'z8-work'], text=True)
assert status == 'install ok installed'
app = Path('/usr/bin/z8-desktop')
assert hashlib.sha256(app.read_bytes()).hexdigest() == 'e6c6d7317d2af5a0726c71f6198b4df83845a9fb2ba562c7830b2d03ba7ea7ae'
info = json.loads(user([str(app), '--build-info']))
assert info['arch'] == 'aarch64' and info['engines'] == 'bundled' and info['customProtocol'] is True
(evidence / 'build-info.json').write_text(json.dumps(info, indent=2) + '\n')
root = Path('/usr/lib/Z8.Work Desktop Dev/engines')
manifest = json.loads((root / 'engines.json').read_text())
audio = user([str(root / manifest['loader']), '--library-path', str(root / 'lib'), str(root / 'validation/bundle-check'), str(root), '--audio-expansion'], timeout=600)
json.loads(audio)
(evidence / 'installed-audio.json').write_text(audio)
uid = int(user(['id', '-u']).strip())
assert uid != 0
sentinel = Path('/home/z8check/user-owned-output.txt')
user(['touch', str(sentinel)])
assert sentinel.stat().st_uid == uid
paths = [app, root, Path('/usr/share/applications/work.z8.desktop.m0.desktop'), Path('/usr/share/icons/hicolor/192x192/apps/z8-work.png')]
assert all(p.exists() for p in paths)
subprocess.run(['apt-get', 'purge', '-y', 'z8-work'], check=True, timeout=120)
assert all(not p.exists() for p in paths)
assert sentinel.exists() and sentinel.stat().st_uid == uid
remaining = subprocess.run(['dpkg-query', '-W', '-f=${Status}', 'z8-work'], text=True, capture_output=True, timeout=30)
assert remaining.returncode == 1 or remaining.stdout.strip() == 'unknown ok not-installed'
(evidence / 'check.json').write_text(json.dumps({
    'status': 'passed', 'scope': 'isolated native ARM64 Ubuntu deb installation and removal; no GUI session',
    'image': os.environ['Z8_CHECK_IMAGE'], 'machine': platform.machine(),
    'osRelease': Path('/etc/os-release').read_text(), 'ordinaryUserUid': uid,
    'installation': 'passed', 'installedApplicationHash': 'e6c6d7317d2af5a0726c71f6198b4df83845a9fb2ba562c7830b2d03ba7ea7ae',
    'installedAudioReport': 'installed-audio.json', 'removal': 'passed', 'unownedFileRetained': True,
    'gui': 'not-run', 'upgrade': 'not-run', 'hostInstallationModified': False
}, indent=2) + '\n')
PY
