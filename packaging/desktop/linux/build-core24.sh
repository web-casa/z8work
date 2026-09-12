#!/bin/sh
# Run only in the isolated Ubuntu 24.04 builder, with a fresh source copy.
set -eu
. /etc/os-release
[ "$ID" = ubuntu ] && [ "$VERSION_ID" = 24.04 ]
case "$(uname -m)" in x86_64) z8_arch=x86_64;; aarch64) z8_arch=aarch64;; *) exit 1;; esac
z8_multiarch=$(gcc -print-multiarch)
# The caller builds the frontend before copying sources into this native builder.
# Keep its module receipt and package notices; host Rollup binaries cannot run here.
[ -f desktop/dist/index.html ] && [ -f .desktop-local/frontend-modules.json ]
[ -n "${Z8_MAGICK_SOURCE:-}" ] && [ -n "${Z8_MAGICK_PATCHES:-}" ] && [ -n "${Z8_BUILD_OUTPUT:-}" ]
[ -n "${Z8_MUPDF_SOURCE:-}" ] && [ -n "${Z8_MUPDF_PATCHES:-}" ] && [ -n "${Z8_MUPDF_UPSTREAM:-}" ]
[ ! -e "$Z8_BUILD_OUTPUT" ]
mkdir -p "$Z8_BUILD_OUTPUT"
# Fail before extracting or executing source that differs from the reviewed inputs.
printf '%s  %s\n' bcb4f3c78a930a608fa4889f889edbcb384974246ad9407fce1858f2c0607bfe "$Z8_MAGICK_SOURCE" | sha256sum --check --strict
printf '%s  %s\n' d96f2576d7e7f2d03819d680a01c9382eae036472026b54b6b6194bec96327c5 "$Z8_MAGICK_PATCHES" | sha256sum --check --strict
# Input source hash and configure flags are recorded with the candidate.
sha256sum "$Z8_MAGICK_SOURCE" "$Z8_MAGICK_PATCHES" > "$Z8_BUILD_OUTPUT/imagemagick-source.sha256"
mkdir "$Z8_BUILD_OUTPUT/imagemagick-build"
tar -xJf "$Z8_MAGICK_SOURCE" -C "$Z8_BUILD_OUTPUT/imagemagick-build" --strip-components=1
tar -xJf "$Z8_MAGICK_PATCHES" -C "$Z8_BUILD_OUTPUT/imagemagick-build"
(
    cd "$Z8_BUILD_OUTPUT/imagemagick-build"
    while IFS= read -r item; do
        case "$item" in ''|\#*) continue ;; esac
        # The hash-pinned series contains plain relative patch names only.
        case "$item" in *[!A-Za-z0-9_.-]*) exit 1 ;; esac
        patch --batch --forward -p1 < "debian/patches/$item"
    done < debian/patches/series
    autoreconf -fi
    ./configure --prefix=/opt/z8-im --with-modules --disable-openmp \
        --without-perl --without-x --without-gslib --without-djvu \
        --without-openexr --without-lqr --without-raw --without-rsvg \
        --without-jxl --without-tiff --without-fontconfig --without-freetype \
        --with-heic=yes --with-webp=yes --with-jpeg=yes --with-png=yes --with-xml=yes --with-lcms=yes \
        LDFLAGS=-Wl,-rpath,/opt/z8-im/lib > "$Z8_BUILD_OUTPUT/imagemagick-configure.log"
    make -j4 > "$Z8_BUILD_OUTPUT/imagemagick-make.log" 2>&1
    make install > "$Z8_BUILD_OUTPUT/imagemagick-install.log" 2>&1
    /opt/z8-im/bin/magick -version > "$Z8_BUILD_OUTPUT/imagemagick-version.txt"
    # configure may silently disable an unavailable delegate even when requested.
    grep -Eq '^Delegates .*\blcms\b' "$Z8_BUILD_OUTPUT/imagemagick-version.txt"
)
mkdir "$Z8_BUILD_OUTPUT/source-licenses"
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
    --ffmpeg /usr/bin/ffmpeg --ffprobe /usr/bin/ffprobe \
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
    --extra-license-dir "$Z8_BUILD_OUTPUT/application-notices/licenses" \
    --verifier "$PWD/src-tauri/target/release/bundle-check"
cp src-tauri/target/release/z8-desktop "$Z8_BUILD_OUTPUT/z8-desktop"
"$Z8_BUILD_OUTPUT/z8-desktop" --build-info > "$Z8_BUILD_OUTPUT/build-info.json"
"$Z8_BUILD_OUTPUT/engines/$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).loader" "$Z8_BUILD_OUTPUT/engines/engines.json")" --library-path "$Z8_BUILD_OUTPUT/engines/lib" \
    "$Z8_BUILD_OUTPUT/engines/validation/bundle-check" "$Z8_BUILD_OUTPUT/engines" --quality > "$Z8_BUILD_OUTPUT/conversions.json"
