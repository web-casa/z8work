#!/bin/bash
# Native Ubuntu 24.04 preview build. Called in an ephemeral GitHub runner.
set -euo pipefail
root="$PWD/.desktop-local/linux-preview"
mkdir "$root"
mkdir "$root/sources" "$root/downloads"
fetch_source() {
    curl --fail --location --retry 2 --max-time 300 "$1" -o "$root/sources/$2"
    printf '%s  %s\n' "$3" "$root/sources/$2" | sha256sum --check --strict
}
fetch_source https://snapshot.debian.org/file/103af0af388a733c043845b228cf3031c16d859b imagemagick.orig.tar.xz bcb4f3c78a930a608fa4889f889edbcb384974246ad9407fce1858f2c0607bfe
fetch_source https://snapshot.debian.org/file/535d099fdebf4a33686355bfca11817cded1af57 imagemagick.debian.tar.xz d96f2576d7e7f2d03819d680a01c9382eae036472026b54b6b6194bec96327c5
fetch_source 'https://deb.debian.org/debian/pool/main/m/mupdf/mupdf_1.25.1+ds1.orig.tar.xz' mupdf.orig.tar.xz 0c2fb34812a8f470ba4f8581bf1c8fd6de0c31feb64020edd4e541400fce1dc9
fetch_source 'https://deb.debian.org/debian/pool/main/m/mupdf/mupdf_1.25.1+ds1-6+deb13u1.debian.tar.xz' mupdf.debian.tar.xz 9dcaeec03493204b647e3d030874cce55f0f69db95235de2cf1405e5d194eeef
fetch_source https://mupdf.com/downloads/archive/mupdf-1.25.1-source.tar.gz mupdf.upstream.tar.gz 81aa1361252418cc45347b4ac075532096957a7ab772e20e046f3bb418d7263c
export Z8_MAGICK_SOURCE="$root/sources/imagemagick.orig.tar.xz"
export Z8_MAGICK_PATCHES="$root/sources/imagemagick.debian.tar.xz"
export Z8_MUPDF_SOURCE="$root/sources/mupdf.orig.tar.xz"
export Z8_MUPDF_PATCHES="$root/sources/mupdf.debian.tar.xz"
export Z8_MUPDF_UPSTREAM="$root/sources/mupdf.upstream.tar.gz"
export Z8_BUILD_OUTPUT="$root/build"
node scripts/desktop-windows-inputs.mjs --output "$root/build-inputs.json"
sh packaging/desktop/linux/build-core24.sh > "$root/build.log" 2>&1
node scripts/desktop-windows-inputs.mjs --verify "$root/build-inputs.json"
node scripts/desktop-candidate-linux.mjs --binary "$root/build/z8-desktop" --engines "$root/build/engines" --output "$root/candidate" > "$root/candidate.log" 2>&1
python3 scripts/desktop-deb.py --candidate "$root/candidate" --output "$root/deb" > "$root/deb.log" 2>&1
cp "$root/deb/"*.deb "$root/downloads/"
# Snap uses the same byte-verified native build with portal dialogs.
if [ "$(uname -m)" = x86_64 ]; then
    node scripts/desktop-snap-prepare.mjs --binary "$root/build/z8-desktop" --engines "$root/build/engines" --output "$root/snap-prepared" > "$root/snap-prepare.log" 2>&1
    node scripts/desktop-snap-pack.mjs --prepared "$root/snap-prepared" --output "$root/snap" --snapcraft-root /snap/snapcraft/current > "$root/snap.log" 2>&1
    snap_packages=("$root/snap/"*.snap)
    [ "${#snap_packages[@]}" -eq 1 ]
    node scripts/desktop-snap-check.mjs --artifact "${snap_packages[0]}" --prepared "$root/snap-prepared/prepared.json" --output "$root/snap-final-check.json" > "$root/snap-check.log" 2>&1
    cp "$root/snap/"*.snap "$root/downloads/"
fi
(cd "$root/downloads" && sha256sum ./* > SHA256SUMS)
