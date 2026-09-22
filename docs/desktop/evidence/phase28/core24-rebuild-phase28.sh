#!/bin/sh
set -eu
export RUSTUP_TOOLCHAIN=1.96.0-x86_64-unknown-linux-gnu
cd /work
git config --global --add safe.directory /work
git init -q
git -c user.name='Z8 local validation' -c user.email='contact@web.casa' add .
git -c user.name='Z8 local validation' -c user.email='contact@web.casa' commit -qm 'Phase 28 isolated source snapshot'
node scripts/desktop-windows-inputs.mjs --output .desktop-local/build-inputs-offline.json
make -C /work/build-reviewed/imagemagick-build -j4 install > .desktop-local/magick-install.log 2>&1
cargo build --locked --offline --release --manifest-path src-tauri/Cargo.toml -p z8-desktop --no-default-features --features packaged-engines,custom-protocol,linux-portal > .desktop-local/app-build.log 2>&1
cargo build --locked --offline --release --manifest-path src-tauri/Cargo.toml -p z8-native --features engine-validation --bin bundle-check > .desktop-local/verifier-build.log 2>&1
node scripts/desktop-prepare.mjs --magick /opt/z8-im/bin/magick --ffmpeg /usr/bin/ffmpeg --ffprobe /usr/bin/ffprobe --pandoc /usr/bin/pandoc --pandoc-data-dir /usr/share/pandoc/data --mutool /usr/bin/mutool > .desktop-local/prepare.log 2>&1
node scripts/desktop-notices.mjs --target x86_64-unknown-linux-gnu --portal --output /work/.desktop-local/notices > .desktop-local/notices.log 2>&1
cp build-reviewed/source-licenses/* .desktop-local/notices/licenses/
node scripts/desktop-bundle-linux.mjs --manifest /work/.desktop-local/engines.json --output /work/.desktop-local/bundled --magick-modules /opt/z8-im/lib/ImageMagick-7.1.1/modules-Q16HDRI/coders --magick-config /opt/z8-im/etc/ImageMagick-7 --heif-plugins /usr/lib/x86_64-linux-gnu/libheif/plugins --extra-license-dir /work/.desktop-local/notices/licenses --verifier /work/src-tauri/target/release/bundle-check > .desktop-local/bundle.log 2>&1
node scripts/desktop-snap-prepare.mjs --binary src-tauri/target/release/z8-desktop --engines .desktop-local/bundled --output .desktop-local/snap-prepared > .desktop-local/snap-prepare.log 2>&1
node scripts/desktop-windows-inputs.mjs --verify .desktop-local/build-inputs-offline.json > .desktop-local/inputs-verified.log
