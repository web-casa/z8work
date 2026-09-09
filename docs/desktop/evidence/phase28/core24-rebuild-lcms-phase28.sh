#!/bin/sh
set -eu
cd /work
export RUSTUP_TOOLCHAIN=1.96.0-x86_64-unknown-linux-gnu
git config --global --add safe.directory /work
git add packaging/desktop/linux
git -c user.name='Z8 local validation' -c user.email='contact@web.casa' commit -qm 'Require LCMS and collect application notices in core24 recipe'
node scripts/desktop-windows-inputs.mjs --output .desktop-local/build-inputs-lcms.json
cp .desktop-local/engines.json .desktop-local/engines-before-lcms.json
cd build-reviewed/imagemagick-build
./configure --prefix=/opt/z8-im --with-modules --disable-openmp \
 --without-perl --without-x --without-gslib --without-djvu \
 --without-openexr --without-lqr --without-raw --without-rsvg \
 --without-jxl --without-tiff --without-fontconfig --without-freetype \
 --with-heic=yes --with-webp=yes --with-jpeg=yes --with-png=yes --with-xml=yes --with-lcms=yes \
 LDFLAGS=-Wl,-rpath,/opt/z8-im/lib > /work/.desktop-local/lcms-configure.log
make -j8 > /work/.desktop-local/lcms-make.log 2>&1
make install > /work/.desktop-local/lcms-install.log 2>&1
/opt/z8-im/bin/magick -version > /work/.desktop-local/lcms-version.txt
grep -Eq '^Delegates .*\blcms\b' /work/.desktop-local/lcms-version.txt
cd /work
cp -a /opt/z8-im .desktop-local/magick-prefix-lcms
node scripts/desktop-prepare.mjs --magick /opt/z8-im/bin/magick --ffmpeg /usr/bin/ffmpeg --ffprobe /usr/bin/ffprobe --pandoc /usr/bin/pandoc --pandoc-data-dir /usr/share/pandoc/data --mutool /usr/bin/mutool > .desktop-local/lcms-prepare.log
node scripts/desktop-bundle-linux.mjs --manifest /work/.desktop-local/engines.json --output /work/.desktop-local/bundled-lcms --magick-modules /opt/z8-im/lib/ImageMagick-7.1.1/modules-Q16HDRI/coders --magick-config /opt/z8-im/etc/ImageMagick-7 --heif-plugins /usr/lib/x86_64-linux-gnu/libheif/plugins --extra-license-dir /work/.desktop-local/notices/licenses --verifier /work/src-tauri/target/release/bundle-check > .desktop-local/lcms-bundle.log 2>&1
node scripts/desktop-snap-prepare.mjs --binary src-tauri/target/release/z8-desktop --engines .desktop-local/bundled-lcms --output .desktop-local/snap-prepared-lcms > .desktop-local/lcms-snap-prepare.log
node scripts/desktop-windows-inputs.mjs --verify .desktop-local/build-inputs-lcms.json > .desktop-local/lcms-inputs-verified.log
