"""Read explicitly supplied Debian archives; never install packages or extract files."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import tarfile
import threading

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--provenance', required=True)
parser.add_argument('--debs', required=True)
parser.add_argument('--extracted-root', required=True)
args = parser.parse_args()
provenance = json.loads(pathlib.Path(args.provenance).read_text())
root = pathlib.PurePosixPath(args.extracted_root)
if not root.is_absolute() or '..' in root.parts:
    raise ValueError('An absolute extraction root is required')
wanted = {}
for name, resource in provenance['resources'].items():
    if resource.get('package') == 'extracted-deb-see-provenance':
        path = pathlib.PurePosixPath(resource['source'])
        relative = str(path.relative_to(root))
        if '..' in relative.split('/'):
            raise ValueError('Unsafe provenance path')
        wanted.setdefault(relative, []).append(name)


def digest_file(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


archives = sorted(pathlib.Path(args.debs).glob('*.deb'))
if len(archives) > 1000:
    raise ValueError('Too many Debian archives')
result = []
for archive in archives:
    if archive.is_symlink() or not archive.is_file() or archive.stat().st_size > 512 * 1024**2:
        raise ValueError('Invalid Debian archive')
    original_hash = digest_file(archive)
    control_process = subprocess.Popen(['dpkg-deb', '--field', str(archive.resolve())],
                                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    control_timer = threading.Timer(30, control_process.kill)
    control_timer.start()
    try:
        control_bytes = control_process.stdout.read(1024**2 + 1)
        if len(control_bytes) > 1024**2:
            raise ValueError('Oversized package control')
        if control_process.wait(timeout=5) != 0:
            raise ValueError('dpkg-deb could not read package control')
        control = control_bytes.decode()
    finally:
        control_timer.cancel()
        if control_process.poll() is None:
            control_process.kill()
        control_process.wait()
        control_process.stdout.close()
    process = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', str(archive.resolve())],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    timer = threading.Timer(30, process.kill)
    timer.start()
    resources = {}
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|') as members:
            size = 0
            seen = set()
            for member in members:
                path = pathlib.PurePosixPath(member.name)
                if path.is_absolute() or '..' in path.parts:
                    raise ValueError('Unsafe archive member')
                name = str(path)
                if name in seen:
                    raise ValueError('Duplicate archive member')
                seen.add(name)
                size += member.size
                if member.size < 0 or size > 1024**3 or len(seen) > 100000:
                    raise ValueError('Archive content limit exceeded')
                if name not in wanted:
                    continue
                if not member.isfile():
                    raise ValueError('Provenance target must be a regular archive member')
                with members.extractfile(member) as source:
                    sha = hashlib.file_digest(source, 'sha256').hexdigest()
                for destination in wanted[name]:
                    resources[destination] = {'member': name, 'bytes': member.size, 'sha256': sha}
        if process.wait(timeout=5) != 0:
            raise ValueError('dpkg-deb could not read archive')
    finally:
        timer.cancel()
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()
    if digest_file(archive) != original_hash:
        raise ValueError('Debian archive changed while reading')
    if resources:
        result.append({'file': archive.name, 'sha256': original_hash,
                       'control': control, 'resources': resources})
print(json.dumps({'schema': 1, 'debs': result}))
