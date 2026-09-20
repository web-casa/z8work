#!/bin/sh
# Run only in the isolated Ubuntu 24.04 builder, with a fresh source copy.
set -eu
# The release builder starts with an empty Cargo cache. The registry is an
# audited, lockfile-pinned input, but some ARM runners receive it below
# Cargo's default 30-second low-speed threshold. Keep the timeout bounded
# while allowing the normal retry policy to finish a clean build.
export CARGO_HTTP_TIMEOUT=600
export CARGO_HTTP_LOW_SPEED_LIMIT=1
export CARGO_NET_RETRY=5
. /etc/os-release
[ "$ID" = ubuntu ] && [ "$VERSION_ID" = 24.04 ]
case "$(uname -m)" in x86_64) z8_arch=x86_64;; aarch64) z8_arch=aarch64;; *) exit 1;; esac
z8_multiarch=$(gcc -print-multiarch)
# The caller builds the frontend before copying sources into this native builder.
# Keep its module receipt and package notices; host Rollup binaries cannot run here.
[ -f desktop/dist/index.html ] && [ -f .desktop-local/frontend-modules.json ]
[ -n "${Z8_MAGICK_SOURCE:-}" ] && [ -n "${Z8_MAGICK_PATCHES:-}" ] && [ -n "${Z8_JXL_SOURCE:-}" ] && [ -n "${Z8_FFMPEG_SOURCE:-}" ] && [ -n "${Z8_BUILD_OUTPUT:-}" ]
[ -n "${Z8_MUPDF_SOURCE:-}" ] && [ -n "${Z8_MUPDF_PATCHES:-}" ] && [ -n "${Z8_MUPDF_UPSTREAM:-}" ]
[ ! -e "$Z8_BUILD_OUTPUT" ]
mkdir -p "$Z8_BUILD_OUTPUT"
# Fail before extracting or executing source that differs from the reviewed inputs.
printf '%s  %s\n' bcb4f3c78a930a608fa4889f889edbcb384974246ad9407fce1858f2c0607bfe "$Z8_MAGICK_SOURCE" | sha256sum --check --strict
printf '%s  %s\n' d96f2576d7e7f2d03819d680a01c9382eae036472026b54b6b6194bec96327c5 "$Z8_MAGICK_PATCHES" | sha256sum --check --strict
printf '%s  %s\n' 818398895831069902e3677d285054a7d1255b11b221e94c6aaa1cb83b0a3f29 "$Z8_JXL_SOURCE" | sha256sum --check --strict
printf '%s  %s\n' cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635 "$Z8_FFMPEG_SOURCE" | sha256sum --check --strict
# Input source hash and configure flags are recorded with the candidate.
sha256sum "$Z8_MAGICK_SOURCE" "$Z8_MAGICK_PATCHES" > "$Z8_BUILD_OUTPUT/imagemagick-source.sha256"
sha256sum "$Z8_JXL_SOURCE" > "$Z8_BUILD_OUTPUT/libjxl-source.sha256"
sha256sum "$Z8_FFMPEG_SOURCE" > "$Z8_BUILD_OUTPUT/ffmpeg-source.sha256"
mkdir "$Z8_BUILD_OUTPUT/libjxl-source" "$Z8_BUILD_OUTPUT/libjxl-build"
# Source ownership is not part of the reviewed artifact. Keeping the current
# builder owner makes this work in rootless/minimum-capability containers too.
tar --no-same-owner -xzf "$Z8_JXL_SOURCE" -C "$Z8_BUILD_OUTPUT/libjxl-source" --strip-components=1
# The upstream archive deliberately omits git submodules. Build only the
# runtime library against explicit Ubuntu dependencies; do not allow CMake to
# fetch a moving dependency tree during a candidate build.
cmake -S "$Z8_BUILD_OUTPUT/libjxl-source" -B "$Z8_BUILD_OUTPUT/libjxl-build" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/opt/z8-jxl \
    -DBUILD_SHARED_LIBS=ON \
    -DBUILD_TESTING=OFF \
    -DJPEGXL_ENABLE_FUZZERS=OFF \
    -DJPEGXL_ENABLE_TOOLS=OFF \
    -DJPEGXL_ENABLE_DEVTOOLS=OFF \
    -DJPEGXL_ENABLE_DOXYGEN=OFF \
    -DJPEGXL_ENABLE_MANPAGES=OFF \
    -DJPEGXL_ENABLE_BENCHMARK=OFF \
    -DJPEGXL_ENABLE_EXAMPLES=OFF \
    -DJPEGXL_ENABLE_JNI=OFF \
    -DJPEGXL_ENABLE_SJPEG=OFF \
    -DJPEGXL_ENABLE_OPENEXR=OFF \
    -DJPEGXL_ENABLE_SKCMS=OFF \
    -DJPEGXL_ENABLE_TCMALLOC=OFF \
    -DJPEGXL_FORCE_SYSTEM_BROTLI=ON \
    -DJPEGXL_FORCE_SYSTEM_HWY=ON \
    -DJPEGXL_FORCE_SYSTEM_LCMS2=ON \
    -DJPEGXL_DEP_LICENSE_DIR=/usr/share/doc \
    > "$Z8_BUILD_OUTPUT/libjxl-configure.log"
cmake --build "$Z8_BUILD_OUTPUT/libjxl-build" --parallel 4 > "$Z8_BUILD_OUTPUT/libjxl-make.log" 2>&1
cmake --install "$Z8_BUILD_OUTPUT/libjxl-build" > "$Z8_BUILD_OUTPUT/libjxl-install.log" 2>&1
test "$(PKG_CONFIG_PATH=/opt/z8-jxl/lib/pkgconfig pkg-config --modversion libjxl)" = 0.12.0
test "$(PKG_CONFIG_PATH=/opt/z8-jxl/lib/pkgconfig pkg-config --variable=pcfiledir libjxl)" = /opt/z8-jxl/lib/pkgconfig
mkdir "$Z8_BUILD_OUTPUT/ffmpeg-source" "$Z8_BUILD_OUTPUT/ffmpeg-build"
tar --no-same-owner -xJf "$Z8_FFMPEG_SOURCE" -C "$Z8_BUILD_OUTPUT/ffmpeg-source" --strip-components=1
# Do not use Ubuntu's FFmpeg here: it links libjxl 0.7, which would smuggle the
# obsolete decoder into a package that otherwise pins libjxl 0.12 for imaging.
# These external audio encoders are LGPL/BSD-compatible; do not enable GPL,
# nonfree, JXL, hardware or network components.
(
    cd "$Z8_BUILD_OUTPUT/ffmpeg-source"
    ./configure --prefix=/opt/z8-ffmpeg \
        --enable-shared --disable-static \
        --disable-doc --disable-debug --disable-ffplay --disable-network \
        --disable-gpl --disable-nonfree --disable-libjxl \
        --enable-libmp3lame --enable-libopus --enable-libvorbis --enable-libvpx --enable-libdav1d \
        --extra-ldflags='-Wl,-rpath,/opt/z8-ffmpeg/lib' \
        > "$Z8_BUILD_OUTPUT/ffmpeg-configure.log"
    make -j4 > "$Z8_BUILD_OUTPUT/ffmpeg-make.log" 2>&1
    make install > "$Z8_BUILD_OUTPUT/ffmpeg-install.log" 2>&1
    /opt/z8-ffmpeg/bin/ffmpeg -version > "$Z8_BUILD_OUTPUT/ffmpeg-version.txt"
    /opt/z8-ffmpeg/bin/ffmpeg -buildconf > "$Z8_BUILD_OUTPUT/ffmpeg-buildconf.txt"
    grep -Fq -- '--disable-libjxl' "$Z8_BUILD_OUTPUT/ffmpeg-buildconf.txt"
    grep -Fq -- '--enable-libdav1d' "$Z8_BUILD_OUTPUT/ffmpeg-buildconf.txt"
    ! grep -Eq -- '--enable-(gpl|nonfree)' "$Z8_BUILD_OUTPUT/ffmpeg-buildconf.txt"
    ! ldd /opt/z8-ffmpeg/bin/ffmpeg | grep -q 'libjxl\.so'
    ! ldd /opt/z8-ffmpeg/bin/ffprobe | grep -q 'libjxl\.so'
    /opt/z8-ffmpeg/bin/ffmpeg -decoders | grep -Eq 'libdav1d.*AV1'
)
mkdir "$Z8_BUILD_OUTPUT/imagemagick-build"
tar --no-same-owner -xJf "$Z8_MAGICK_SOURCE" -C "$Z8_BUILD_OUTPUT/imagemagick-build" --strip-components=1
tar --no-same-owner -xJf "$Z8_MAGICK_PATCHES" -C "$Z8_BUILD_OUTPUT/imagemagick-build"
(
    cd "$Z8_BUILD_OUTPUT/imagemagick-build"
    while IFS= read -r item; do
        case "$item" in ''|\#*) continue ;; esac
        # The hash-pinned series contains plain relative patch names only.
        case "$item" in *[!A-Za-z0-9_.-]*) exit 1 ;; esac
        patch --batch --forward -p1 < "debian/patches/$item"
    done < debian/patches/series
    autoreconf -fi
    PKG_CONFIG_PATH=/opt/z8-jxl/lib/pkgconfig \
        CPPFLAGS=-I/opt/z8-jxl/include \
        LDFLAGS="-L/opt/z8-jxl/lib -Wl,-rpath,/opt/z8-im/lib:/opt/z8-jxl/lib" \
        ./configure --prefix=/opt/z8-im --with-modules --disable-openmp \
        --without-perl --without-x --without-gslib --without-djvu \
        --with-openexr=yes --without-lqr --without-raw --without-rsvg \
        --with-jxl=yes --with-tiff=yes --without-fontconfig --without-freetype \
        --with-heic=yes --with-webp=yes --with-jpeg=yes --with-png=yes --with-xml=yes --with-lcms=yes \
        > "$Z8_BUILD_OUTPUT/imagemagick-configure.log"
    make -j4 > "$Z8_BUILD_OUTPUT/imagemagick-make.log" 2>&1
    make install > "$Z8_BUILD_OUTPUT/imagemagick-install.log" 2>&1
    /opt/z8-im/bin/magick -version > "$Z8_BUILD_OUTPUT/imagemagick-version.txt"
    # configure may silently disable an unavailable delegate even when requested.
    grep -Eq '^Delegates .*\blcms\b' "$Z8_BUILD_OUTPUT/imagemagick-version.txt"
    grep -Eq '^Delegates .*\bopenexr\b' "$Z8_BUILD_OUTPUT/imagemagick-version.txt"
    grep -Eq '^Delegates .*\btiff\b' "$Z8_BUILD_OUTPUT/imagemagick-version.txt"
    grep -Eq '^Delegates .*\bjxl\b' "$Z8_BUILD_OUTPUT/imagemagick-version.txt"
    for coder in gif tiff icon pcx xbm xpm dpx exr hdr jxl; do
        test -f "/opt/z8-im/lib/ImageMagick-7.1.1/modules-Q16HDRI/coders/$coder.so"
    done
    jxl_coder=/opt/z8-im/lib/ImageMagick-7.1.1/modules-Q16HDRI/coders/jxl.so
    readelf -d "$jxl_coder" | grep -Fq 'Shared library: [libjxl.so.0.12]'
    ldd "$jxl_coder" | grep -Fq '/opt/z8-jxl/lib/libjxl.so.0.12'
    # The quality suite uses FFmpeg as an independent AVIF reader. ARM64's
    # default native AV1 path can select an unavailable hardware accelerator,
    # so prove the bundled software decoder opens a real ImageMagick AVIF.
    z8_avif_check=$(mktemp -d)
    /opt/z8-im/bin/magick -size 96x64 gradient:red-blue "AVIF:$z8_avif_check/readback.avif"
    /opt/z8-ffmpeg/bin/ffmpeg -nostdin -v error -xerror -i "$z8_avif_check/readback.avif" -f null -
)
mkdir "$Z8_BUILD_OUTPUT/source-licenses"
mkdir "$Z8_BUILD_OUTPUT/source-licenses/ffmpeg"
cp "$Z8_BUILD_OUTPUT/ffmpeg-source/COPYING.LGPLv2.1" "$Z8_BUILD_OUTPUT/source-licenses/ffmpeg/LICENSE"
cp "$Z8_BUILD_OUTPUT/ffmpeg-source.sha256" "$Z8_BUILD_OUTPUT/source-licenses/ffmpeg/sources.sha256"
cp "$Z8_BUILD_OUTPUT/ffmpeg-buildconf.txt" "$Z8_BUILD_OUTPUT/source-licenses/ffmpeg/buildconf.txt"
printf '%s\n' \
    'FFmpeg 9.0.1; official tarball signature verified against FCF986EA15E6E293A5644F10B4322F04D67658D8 during source review.' \
    'https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz' \
    > "$Z8_BUILD_OUTPUT/source-licenses/ffmpeg/BUILD-RECORD.txt"
mkdir "$Z8_BUILD_OUTPUT/source-licenses/libjxl"
cp "$Z8_BUILD_OUTPUT/libjxl-source/LICENSE" "$Z8_BUILD_OUTPUT/source-licenses/libjxl/LICENSE"
cp "$Z8_BUILD_OUTPUT/libjxl-source.sha256" "$Z8_BUILD_OUTPUT/source-licenses/libjxl/sources.sha256"
for license in "$Z8_BUILD_OUTPUT"/libjxl-build/LICENSE.*; do
    test -f "$license"
    cp "$license" "$Z8_BUILD_OUTPUT/source-licenses/libjxl/"
done
printf '%s\n' \
    'libjxl v0.12.0 commit a7a9c787341cf703dede03c2009fa460cae5e5df' \
    'https://github.com/libjxl/libjxl/releases/tag/v0.12.0' \
    > "$Z8_BUILD_OUTPUT/source-licenses/libjxl/BUILD-RECORD.txt"
cp "$Z8_BUILD_OUTPUT/imagemagick-build/LICENSE" "$Z8_BUILD_OUTPUT/source-licenses/ImageMagick-LICENSE"
cp "$Z8_BUILD_OUTPUT/imagemagick-build/NOTICE" "$Z8_BUILD_OUTPUT/source-licenses/ImageMagick-NOTICE"
cp "$Z8_BUILD_OUTPUT/imagemagick-build/debian/copyright" "$Z8_BUILD_OUTPUT/source-licenses/ImageMagick-Debian-copyright"
cp "$Z8_BUILD_OUTPUT/imagemagick-source.sha256" "$Z8_BUILD_OUTPUT/source-licenses/ImageMagick-sources.sha256"
cp packaging/desktop/linux/build-core24.sh "$Z8_BUILD_OUTPUT/source-licenses/build-core24.sh"
sh packaging/desktop/linux/build-mupdf-icc.sh "$Z8_MUPDF_SOURCE" \
    "$Z8_MUPDF_PATCHES" "$Z8_MUPDF_UPSTREAM" "$Z8_BUILD_OUTPUT/mupdf-icc" \
    > "$Z8_BUILD_OUTPUT/mupdf-build.log" 2>&1
# Distribution runtime notices are collected by the bundle assembler's dpkg
# lookup. Do not ship every build-only package notice again (UI limit: 1024).
cp -a "$Z8_BUILD_OUTPUT/mupdf-icc/runtime/usr/share/doc/mupdf-icc" \
    "$Z8_BUILD_OUTPUT/source-licenses/mupdf-icc"
cp packaging/desktop/linux/build-mupdf-icc.sh "$Z8_BUILD_OUTPUT/source-licenses/mupdf-icc/"
cp "$Z8_BUILD_OUTPUT/mupdf-icc/sources.sha256" "$Z8_BUILD_OUTPUT/source-licenses/mupdf-icc/"
cp "$Z8_BUILD_OUTPUT/mupdf-icc/packages.tsv" "$Z8_BUILD_OUTPUT/source-licenses/mupdf-icc/"
node scripts/desktop-prepare.mjs --magick /opt/z8-im/bin/magick \
    --ffmpeg /opt/z8-ffmpeg/bin/ffmpeg --ffprobe /opt/z8-ffmpeg/bin/ffprobe \
    --pandoc /usr/bin/pandoc --pandoc-data-dir /usr/share/pandoc/data \
    --mutool "$Z8_BUILD_OUTPUT/mupdf-icc/runtime/bin/mutool"
cargo build --locked --release --no-default-features \
    --features packaged-engines,custom-protocol,linux-portal --manifest-path src-tauri/Cargo.toml
cargo build --locked --release --manifest-path src-tauri/Cargo.toml \
    -p z8-native --features engine-validation --bin bundle-check
node scripts/desktop-notices.mjs --target "$z8_arch-unknown-linux-gnu" --portal \
    --output "$Z8_BUILD_OUTPUT/application-notices"
cp -a "$Z8_BUILD_OUTPUT/source-licenses/." "$Z8_BUILD_OUTPUT/application-notices/licenses/"
node scripts/desktop-bundle-linux.mjs --manifest "$PWD/.desktop-local/engines.json" \
    --output "$Z8_BUILD_OUTPUT/engines" \
    --magick-modules /opt/z8-im/lib/ImageMagick-7.1.1/modules-Q16HDRI/coders \
    --magick-config /opt/z8-im/etc/ImageMagick-7 \
    --heif-plugins "/usr/lib/$z8_multiarch/libheif/plugins" \
    --extra-library-dir /opt/z8-jxl/lib \
    --extra-library-dir /opt/z8-ffmpeg/lib \
    --extra-license-dir "$Z8_BUILD_OUTPUT/application-notices/licenses" \
    --verifier "$PWD/src-tauri/target/release/bundle-check"
test -f "$Z8_BUILD_OUTPUT/engines/lib/libjxl.so.0.12"
test -f "$Z8_BUILD_OUTPUT/engines/lib/libjxl_cms.so.0.12"
test ! -e "$Z8_BUILD_OUTPUT/engines/lib/libjxl.so.0.7"
# `libjxl_threads` is a separate SONAME in the old Ubuntu 0.7 ABI. Reject the
# whole family, not only the main decoder, so an indirect optional plugin
# cannot leave a stale JXL runtime in an otherwise 0.12-only package.
if find "$Z8_BUILD_OUTPUT/engines/lib" -maxdepth 1 -type f -name 'libjxl*.so.0.7' -print -quit | grep -q .; then
    echo 'Unexpected obsolete libjxl 0.7 runtime in bundled engines' >&2
    exit 1
fi
cp src-tauri/target/release/z8-desktop "$Z8_BUILD_OUTPUT/z8-desktop"
"$Z8_BUILD_OUTPUT/z8-desktop" --build-info > "$Z8_BUILD_OUTPUT/build-info.json"
"$Z8_BUILD_OUTPUT/engines/$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).loader" "$Z8_BUILD_OUTPUT/engines/engines.json")" --library-path "$Z8_BUILD_OUTPUT/engines/lib" \
    "$Z8_BUILD_OUTPUT/engines/validation/bundle-check" "$Z8_BUILD_OUTPUT/engines" --quality > "$Z8_BUILD_OUTPUT/conversions.json"

# The ARM64 validation package is the first target with the expanded acceptance
# profile. Exercise every one of those signed routes before a candidate is
# archived; x86_64 and the other platforms keep their conservative profiles
# until their own package evidence exists.
if [ "$z8_arch" = aarch64 ]; then
    "$Z8_BUILD_OUTPUT/engines/$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).loader" "$Z8_BUILD_OUTPUT/engines/engines.json")" --library-path "$Z8_BUILD_OUTPUT/engines/lib" \
        "$Z8_BUILD_OUTPUT/engines/validation/bundle-check" "$Z8_BUILD_OUTPUT/engines" --format-matrix > "$Z8_BUILD_OUTPUT/format-matrix.json"
fi

node -e "const fs = require('fs'); const r = JSON.parse(fs.readFileSync(process.argv[1])); fs.writeFileSync(process.argv[2], JSON.stringify(r.imageExpansion, null, 2) + '\\n')" "$Z8_BUILD_OUTPUT/conversions.json" "$Z8_BUILD_OUTPUT/image-expansion.json"
