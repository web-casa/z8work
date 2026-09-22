#!/bin/sh
set -eu
cd /work
git config --global --add safe.directory /work
export RUSTUP_TOOLCHAIN=1.96.0-x86_64-unknown-linux-gnu
export CARGO_NET_OFFLINE=true
node scripts/desktop-windows-inputs.mjs --verify .desktop-local/core24-icc-inputs.json
# Restore the installation prefix from the successfully compiled source tree.
(cd "$Z8_BUILD_OUTPUT/imagemagick-build" && make install > "$Z8_BUILD_OUTPUT/imagemagick-reinstall.log" 2>&1)
cargo build --locked --release --no-default-features \
    --features packaged-engines,custom-protocol,linux-portal --manifest-path src-tauri/Cargo.toml
cargo build --locked --release --manifest-path src-tauri/Cargo.toml \
    -p z8-native --features engine-validation --bin bundle-check
node scripts/desktop-notices.mjs --target x86_64-unknown-linux-gnu --portal \
    --output "$Z8_BUILD_OUTPUT/application-notices"
cp -a "$Z8_BUILD_OUTPUT/source-licenses/." "$Z8_BUILD_OUTPUT/application-notices/licenses/"
node scripts/desktop-bundle-linux.mjs --manifest "$PWD/.desktop-local/engines.json" \
    --output "$Z8_BUILD_OUTPUT/engines" \
    --magick-modules /opt/z8-im/lib/ImageMagick-7.1.1/modules-Q16HDRI/coders \
    --magick-config /opt/z8-im/etc/ImageMagick-7 \
    --heif-plugins /usr/lib/x86_64-linux-gnu/libheif/plugins \
    --extra-license-dir "$Z8_BUILD_OUTPUT/application-notices/licenses" \
    --verifier "$PWD/src-tauri/target/release/bundle-check"
cp src-tauri/target/release/z8-desktop "$Z8_BUILD_OUTPUT/z8-desktop"
"$Z8_BUILD_OUTPUT/z8-desktop" --build-info > "$Z8_BUILD_OUTPUT/build-info.json"
"$Z8_BUILD_OUTPUT/engines/lib/ld-linux-x86-64.so.2" --library-path "$Z8_BUILD_OUTPUT/engines/lib" \
    "$Z8_BUILD_OUTPUT/engines/validation/bundle-check" "$Z8_BUILD_OUTPUT/engines" --quality > "$Z8_BUILD_OUTPUT/conversions.json"

node scripts/desktop-windows-inputs.mjs --verify .desktop-local/core24-icc-inputs.json
node scripts/desktop-snap-prepare.mjs --binary "$Z8_BUILD_OUTPUT/z8-desktop" --engines "$Z8_BUILD_OUTPUT/engines" --output /work/.desktop-local/snap-prepared-icc
