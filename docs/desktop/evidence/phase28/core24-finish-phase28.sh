#!/bin/sh
set -eu
cd /work
export RUSTUP_TOOLCHAIN=1.96.0-x86_64-unknown-linux-gnu
git config --global --add safe.directory /work
git add scripts/desktop-bundle-linux.mjs
git -c user.name="Z8 local validation" -c user.email="contact@web.casa" commit --allow-empty -qm "Preserve offline pinned Rust toolchain in bundle record"
node scripts/desktop-windows-inputs.mjs --output .desktop-local/build-inputs-final.json
make -C /work/build-reviewed/imagemagick-build -j4 install > .desktop-local/magick-install.log 2>&1
cp -a /opt/z8-im .desktop-local/magick-prefix
node scripts/desktop-bundle-linux.mjs --manifest /work/.desktop-local/engines.json --output /work/.desktop-local/bundled-final --magick-modules /opt/z8-im/lib/ImageMagick-7.1.1/modules-Q16HDRI/coders --magick-config /opt/z8-im/etc/ImageMagick-7 --heif-plugins /usr/lib/x86_64-linux-gnu/libheif/plugins --extra-license-dir /work/.desktop-local/notices/licenses --verifier /work/src-tauri/target/release/bundle-check > .desktop-local/bundle.log 2>&1
node scripts/desktop-snap-prepare.mjs --binary src-tauri/target/release/z8-desktop --engines .desktop-local/bundled-final --output .desktop-local/snap-prepared > .desktop-local/snap-prepare.log 2>&1
node scripts/desktop-windows-inputs.mjs --verify .desktop-local/build-inputs-final.json > .desktop-local/inputs-verified.log
