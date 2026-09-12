#!/usr/bin/env python3
"""Package a verified local ARM64 candidate; never install on the build host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess


def run(args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--candidate", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
repo = Path(__file__).resolve().parent.parent
candidate = args.candidate.resolve()
output = args.output.resolve()
report = json.loads((candidate / "candidate.json").read_text())
if report["artifact"] != "linux-arm64-validation":
    raise ValueError("An ARM64 Linux validation candidate is required")
if any(report["checks"][key]["status"] != "passed" for key in ("integrity", "conversion")):
    raise ValueError("Candidate integrity and conversion checks must have passed")
if run(["dpkg", "--print-architecture"]) != "arm64":
    raise ValueError("Dependency scanning requires the native ARM64 Debian builder")
if digest(candidate / report["filename"]) != report["sha256"]:
    raise ValueError("Candidate archive checksum mismatch")
output.mkdir()  # Refuse overwriting an earlier package or its evidence.
stage = output / "root"
shutil.copytree(candidate / "z8-work" / "usr", stage / "usr")
binary = stage / "usr/bin/z8-desktop"
resource_name = report["buildInfo"]["resourceDirectoryName"]
engines = stage / "usr/lib" / resource_name / "engines"
if digest(binary) != report["applicationSha256"] or digest(engines / "engines.json") != report["engineManifestSha256"]:
    raise ValueError("Staged application or engine manifest differs from the candidate")
manifest = json.loads((engines / "engines.json").read_text())
for name, entry in manifest["files"].items():
    if digest(engines / name) != entry["sha256"]:
        raise ValueError(f"Engine resource changed: {name}")
# The preview UI accepts at most 1024 notices. Preserve every byte of the
# verbose MuPDF builder notices in bounded, labelled volumes instead of
# dropping notices or changing the application solely for packaging.
license_volumes = []
if sum(name.startswith("licenses/") for name in manifest["files"]) > 1024:
    names = sorted(name for name in manifest["files"] if name.startswith("licenses/source-build/mupdf-icc-build/"))
    volumes = []
    body = bytearray()
    for name in names:
        data = (engines / name).read_bytes()
        data.decode("utf-8")  # Fail rather than corrupt a non-text notice.
        section = f"\n===== {name} =====\n".encode() + data + b"\n"
        if len(section) > 1024 * 1024:
            raise ValueError("Notice exceeds the volume budget")
        if len(body) + len(section) > 1024 * 1024:
            volumes.append(bytes(body))
            body.clear()
        body.extend(section)
    if body:
        volumes.append(bytes(body))
    for index, data in enumerate(volumes, 1):
        name = f"licenses/source-build/mupdf-build-notices-{index}.txt"
        if (engines / name).exists():
            raise ValueError("Refusing to overwrite a notice volume")
        (engines / name).write_bytes(data)
        manifest["files"][name] = {"sha256": digest(engines / name), "bytes": len(data)}
        license_volumes.append(name)
    for name in names:
        (engines / name).unlink()
        del manifest["files"][name]
    provenance_path = engines / "provenance.json"
    provenance = json.loads(provenance_path.read_text())
    provenance["debNoticeVolumes"] = {"originalFiles": names, "volumes": license_volumes, "transformation": "Concatenate original UTF-8 bytes with filename headings; no notice omitted"}
    provenance_path.write_text(json.dumps(provenance, indent=2) + "\n")
    manifest["files"]["provenance.json"] = {"sha256": digest(provenance_path), "bytes": provenance_path.stat().st_size}
    (engines / "engines.json").write_text(json.dumps(manifest, indent=2) + "\n")
if sum(name.startswith("licenses/") for name in manifest["files"]) > 1024:
    raise ValueError("Too many notices for the preview UI")
version = report["buildInfo"]["version"] + "~preview1"
desktop = stage / "usr/share/applications/work.z8.desktop.m0.desktop"
desktop.parent.mkdir(parents=True)
desktop.write_text("""[Desktop Entry]
Type=Application
Name=Z8.Work
Comment=Local image, PDF, audio and document conversion
Comment[zh_CN]=本地图片、PDF、音频和文档转换
Exec=z8-desktop
Icon=z8-work
Terminal=false
Categories=Utility;Graphics;
StartupWMClass=Z8.Work Desktop Dev
""")
run(["desktop-file-validate", str(desktop)])
icon = stage / "usr/share/icons/hicolor/192x192/apps/z8-work.png"
icon.parent.mkdir(parents=True)
shutil.copyfile(repo / "src-tauri/icons/icon.png", icon)
doc = stage / "usr/share/doc/z8-work"
doc.mkdir(parents=True)
shutil.copyfile(repo / "LICENSE", doc / "copyright")
(doc / "README").write_text(
    "Z8.Work local preview for Debian 13 ARM64. Start from the application menu or z8-desktop.\n"
    "Conversion engines are bundled. GTK/WebKit are system dependencies.\n"
    "Engine notices: /usr/lib/" + resource_name + "/engines/licenses\n"
    "This preview has not completed store, upgrade or redistribution acceptance.\n"
    "Support: contact@web.casa | https://github.com/web-casa/z8work\n"
)
# Scan only the host-loaded application. Engine subprocesses use their own
# bundled loader/library inventory, whose bytes were checked above.
scan = output / "dependency-scan/debian"
scan.mkdir(parents=True)
(scan / "control").write_text(
    "Source: z8-work\nSection: utils\nPriority: optional\n"
    "Maintainer: Z8.Work <contact@web.casa>\n\n"
    "Package: z8-work\nArchitecture: arm64\nDescription: Local file conversion\n"
)
with (output / "dependency-scan.log").open("w") as log:
    substvars = run(["dpkg-shlibdeps", "-O", f"-e{binary}"], cwd=scan.parent, stderr=log)
dependencies = next(line.removeprefix("shlibs:Depends=") for line in substvars.splitlines() if line.startswith("shlibs:Depends="))
control = stage / "DEBIAN"
control.mkdir()
size = sum(p.stat().st_size for p in (stage / "usr").rglob("*") if p.is_file())
(control / "control").write_text(
    f"Package: z8-work\nVersion: {version}\nArchitecture: arm64\n"
    "Section: utils\nPriority: optional\nMaintainer: Z8.Work <contact@web.casa>\n"
    f"Installed-Size: {(size + 1023) // 1024}\nDepends: {dependencies}\n"
    "Homepage: https://z8.work/\nDescription: Local multi-file conversion tool (preview)\n"
    " Convert images, PDF pages, audio and plain-text documents locally.\n"
    " Includes native conversion engines; requires a graphical desktop.\n"
)
deb = output / f"z8-work_{version}_arm64.deb"
run(["dpkg-deb", "--root-owner-group", "-Zxz", "-z6", "--build", str(stage), str(deb)], env={**os.environ, "SOURCE_DATE_EPOCH": "0"})
extracted = output / "extracted"
run(["dpkg-deb", "--extract", str(deb), str(extracted)])
for original in (stage / "usr").rglob("*"):
    if original.is_file() and digest(original) != digest(extracted / original.relative_to(stage)):
        raise ValueError(f"Deb extraction changed {original}")
(output / "SHA256SUMS").write_text(f"{digest(deb)}  {deb.name}\n")
(output / "package.json").write_text(json.dumps({
    "file": deb.name, "sha256": digest(deb), "bytes": deb.stat().st_size,
    "architecture": "arm64", "testedDistribution": "Debian 13",
    "sourceCandidateSha256": report["sha256"],
    "applicationSha256": report["applicationSha256"],
    "sourceEngineManifestSha256": report["engineManifestSha256"],
    "engineManifestSha256": digest(engines / "engines.json"),
    "licenseVolumes": license_volumes,
    "dependencies": dependencies, "extractedFilesMatch": True,
    "redistributionApproved": False,
}, indent=2) + "\n")
print(deb)
