"""Verify the final portable archive against its staging tree, including every byte."""
import argparse
import hashlib
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--root", type=Path, required=True)
parser.add_argument("--zip", type=Path, required=True)
args = parser.parse_args()
files = {}
for path in args.root.rglob("*"):
    if path.is_symlink():
        raise ValueError("Symlink in portable payload")
    if path.is_file():
        files[path.relative_to(args.root).as_posix()] = path
with zipfile.ZipFile(args.zip) as archive:
    names = [item.filename for item in archive.infolist() if not item.is_dir()]
    if len(names) != len(set(names)) or set(names) != set(files):
        raise ValueError("Archive inventory differs from payload")
    if archive.testzip() is not None:
        raise ValueError("ZIP CRC failed")
    for name, path in files.items():
        with archive.open(name) as actual, path.open("rb") as expected:
            if hashlib.file_digest(actual, "sha256").digest() != hashlib.file_digest(expected, "sha256").digest():
                raise ValueError(f"Archive byte mismatch: {name}")
print(f"Verified {len(files)} portable ZIP files")
