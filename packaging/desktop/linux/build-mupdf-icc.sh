#!/bin/sh
# Run in Dockerfile.mupdf-icc with hash-pinned archives and a fresh writable output.
# No downloads, system installation or redistribution approval occur here.
set -eu
[ "$#" -eq 4 ] || { echo 'Usage: build-mupdf-icc.sh DEBIAN_ORIG DEBIAN_PATCHES UPSTREAM OUTPUT' >&2; exit 1; }
orig=$(realpath "$1")
patches=$(realpath "$2")
upstream=$(realpath "$3")
output=$4
[ ! -e "$output" ]
printf '%s  %s\n' \
    0c2fb34812a8f470ba4f8581bf1c8fd6de0c31feb64020edd4e541400fce1dc9 "$orig" \
    9dcaeec03493204b647e3d030874cce55f0f69db95235de2cf1405e5d194eeef "$patches" \
    81aa1361252418cc45347b4ac075532096957a7ab772e20e046f3bb418d7263c "$upstream" \
    | sha256sum --check --strict
mkdir -p "$output"
output=$(realpath "$output")
mkdir "$output/source" "$output/upstream"
tar -xJf "$orig" -C "$output/source" --strip-components=1
tar -xJf "$patches" -C "$output/source"
# Only restore the patched LCMS fork and original fonts from the matching release.
# All other C/C++ dependencies use the builder's distribution libraries.
tar -xzf "$upstream" -C "$output/upstream" --strip-components=1 \
    mupdf-1.25.1-source/thirdparty/lcms2 mupdf-1.25.1-source/resources/fonts
cp -a "$output/upstream/thirdparty/lcms2" "$output/source/thirdparty/"
cp -a "$output/upstream/resources/fonts/." "$output/source/resources/fonts/"
cd "$output/source"
while IFS= read -r item; do
    case "$item" in ''|\#*) continue ;; esac
    case "$item" in *[!A-Za-z0-9_.-]*) exit 1 ;; esac
    # This packaging-only patch expects replacement distro TTFs. We retain the
    # release's original CFF fonts, so keep the matching upstream font table.
    if [ "$item" = 0009-Use-Charis-SIL-ttf-font-directly.patch ]; then
        printf 'omitted (upstream fonts): %s\n' "$item" >> "$output/patches.txt"
        continue
    fi
    patch --batch --forward -p1 < "debian/patches/$item"
    printf 'applied: %s\n' "$item" >> "$output/patches.txt"
done < debian/patches/series
mkdir -p source/pdf/cmaps
sh scripts/runcmapdump.sh > "$output/cmaps.txt"
dpkg-query -W -f='${binary:Package}\t${Version}\t${source:Package}\t${source:Version}\n' > "$output/packages.tsv"
sha256sum "$orig" "$patches" "$upstream" > "$output/sources.sha256"
cc --version > "$output/compiler.txt"
# Explicitly enable ICC and the upstream thread-safe LCMS fork. Build only the
# CLI, with no optional viewer/network/OCR dependencies and normal hardening.
make -j4 build=release USE_SYSTEM_LIBS=yes USE_SYSTEM_MUJS=yes \
    USE_SYSTEM_LCMS2=no HAVE_X11=no HAVE_GLUT=no HAVE_CURL=no \
    HAVE_LIBCRYPTO=no HAVE_TESSERACT=no HAVE_LEPTONICA=no \
    XCFLAGS='-DFZ_ENABLE_ICC=1 -D_FORTIFY_SOURCE=2 -fstack-protector-strong -fPIE' \
    XLDFLAGS='-Wl,-z,relro,-z,now -pie' verbose=yes build/release/mutool
mkdir -p "$output/runtime/bin" "$output/runtime/lib" "$output/runtime/usr/share/doc/mupdf-icc"
cp build/release/mutool "$output/runtime/bin/mutool"
ldd build/release/mutool > "$output/ldd.txt"
if grep -q 'not found' "$output/ldd.txt"; then
    echo 'Unresolved MuPDF runtime dependency' >&2
    exit 1
fi
awk '/=> \// { print $3 } /^[[:space:]]*\// { print $1 }' "$output/ldd.txt" | while IFS= read -r lib; do
    cp -L "$lib" "$output/runtime/lib/"
done
# Distinct names avoid silently overwriting the engine license with LCMS's MIT text.
cp COPYING "$output/runtime/usr/share/doc/mupdf-icc/MuPDF-COPYING"
cp thirdparty/lcms2/COPYING "$output/runtime/usr/share/doc/mupdf-icc/LCMS-COPYING"
cp debian/copyright "$output/runtime/usr/share/doc/mupdf-icc/copyright"
for notice in droid/NOTICE urw/OFL.txt sil/README.txt sil/OFL.txt han/README.txt han/LICENSE.txt noto/COPYING; do
    mkdir -p "$output/runtime/usr/share/doc/mupdf-icc/fonts/$(dirname "$notice")"
    cp "resources/fonts/$notice" "$output/runtime/usr/share/doc/mupdf-icc/fonts/$notice"
done
# Preserve distro dependency notices together with the complete version inventory.
for doc in /usr/share/doc/*; do
    if [ -f "$doc/copyright" ]; then
        mkdir -p "$output/runtime/usr/share/doc/$(basename "$doc")"
        cp -L "$doc/copyright" "$output/runtime/usr/share/doc/$(basename "$doc")/copyright"
    fi
done
sha256sum build/release/mutool > "$output/binary.sha256"
build/release/mutool -v > "$output/version.txt" 2>&1
