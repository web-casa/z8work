import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the Core24 JXL path is pinned to libjxl 0.12 instead of Noble's old package", async () => {
	const [dockerfile, ci, build, bundler] = await Promise.all([
		read("../../packaging/desktop/linux/Dockerfile.core24"),
		read("../../scripts/desktop-ci-linux-packages.sh"),
		read("../../packaging/desktop/linux/build-core24.sh"),
		read("../../scripts/desktop-bundle-linux.mjs"),
	]);

	assert.match(dockerfile, /\bcmake\b/);
	assert.match(dockerfile, /\bninja-build\b/);
	assert.match(dockerfile, /\blibhwy-dev\b/);
	assert.match(dockerfile, /\blibbrotli-dev\b/);
	assert.match(dockerfile, /\blibdav1d-dev\b/);
	assert.doesNotMatch(dockerfile, /\blibjxl-dev\b/);

	const commit = "a7a9c787341cf703dede03c2009fa460cae5e5df";
	const sha256 =
		"818398895831069902e3677d285054a7d1255b11b221e94c6aaa1cb83b0a3f29";
	assert.match(
		ci,
		new RegExp(
			`codeload\\.github\\.com/libjxl/libjxl/tar\\.gz/${commit}\\s+libjxl-v0\\.12\\.0\\.tar\\.gz\\s+${sha256}`,
		),
	);
	assert.match(ci, /export Z8_JXL_SOURCE=/);
	assert.match(ci, /Z8_SOURCE_CACHE/);
	assert.match(ci, /--retry-all-errors/);
	assert.match(ci, /ffmpeg-9\.0\.1\.tar\.xz/);
	assert.match(
		ci,
		/cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635/,
	);
	assert.match(build, /Z8_JXL_SOURCE/);
	assert.match(build, /Z8_FFMPEG_SOURCE/);
	assert.match(build, new RegExp(`printf '%s  %s\\\\n' ${sha256}`));
	assert.match(build, /tar --no-same-owner -xzf "\$Z8_JXL_SOURCE"/);
	assert.match(build, /tar --no-same-owner -xJf "\$Z8_MAGICK_SOURCE"/);
	assert.match(build, /tar --no-same-owner -xJf "\$Z8_MAGICK_PATCHES"/);
	assert.match(build, /-DCMAKE_INSTALL_PREFIX=\/opt\/z8-jxl/);
	for (const flag of [
		"-DBUILD_TESTING=OFF",
		"-DJPEGXL_ENABLE_TOOLS=OFF",
		"-DJPEGXL_ENABLE_OPENEXR=OFF",
		"-DJPEGXL_FORCE_SYSTEM_BROTLI=ON",
		"-DJPEGXL_FORCE_SYSTEM_HWY=ON",
		"-DJPEGXL_FORCE_SYSTEM_LCMS2=ON",
	])
		assert.ok(
			build.includes(flag),
			`missing locked libjxl CMake flag: ${flag}`,
		);
	assert.match(
		build,
		/PKG_CONFIG_PATH=\/opt\/z8-jxl\/lib\/pkgconfig pkg-config --modversion libjxl\)" = 0\.12\.0/,
	);
	assert.match(
		build,
		/pkg-config --variable=pcfiledir libjxl\)" = \/opt\/z8-jxl\/lib\/pkgconfig/,
	);
	assert.match(build, /PKG_CONFIG_PATH=\/opt\/z8-jxl\/lib\/pkgconfig/);
	assert.match(build, /CPPFLAGS=-I\/opt\/z8-jxl\/include/);
	assert.match(
		build,
		/-L\/opt\/z8-jxl\/lib -Wl,-rpath,\/opt\/z8-im\/lib:\/opt\/z8-jxl\/lib/,
	);
	assert.match(build, /--with-jxl=yes/);
	assert.match(build, /coders\/\$coder\.so/);
	assert.match(build, /gif tiff icon pcx xbm xpm dpx exr hdr jxl/);
	assert.match(build, /Shared library: \[libjxl\.so\.0\.12\]/);
	assert.match(build, /\/opt\/z8-jxl\/lib\/libjxl\.so\.0\.12/);
	assert.match(build, /source-licenses\/libjxl/);
	assert.match(build, /--disable-libjxl/);
	assert.match(build, /--enable-libdav1d/);
	assert.match(build, /libdav1d\.\*AV1/);
	assert.match(build, /--disable-gpl --disable-nonfree/);
	assert.match(build, /--disable-network/);
	assert.match(build, /CARGO_HTTP_TIMEOUT=600/);
	assert.match(build, /CARGO_HTTP_LOW_SPEED_LIMIT=1/);
	assert.match(build, /CARGO_NET_RETRY=5/);
	assert.match(build, /\/opt\/z8-ffmpeg\/bin\/ffmpeg/);
	assert.match(build, /--extra-library-dir \/opt\/z8-jxl\/lib/);
	assert.match(build, /--extra-library-dir \/opt\/z8-ffmpeg\/lib/);
	assert.match(build, /libjxl_cms\.so\.0\.12/);
	assert.match(build, /test ! -e .*libjxl\.so\.0\.7/);
	assert.match(build, /libjxl\*\.so\.0\.7/);
	assert.match(bundler, /extra-library-dir/);
	assert.match(bundler, /verifiedExtraLibraryDirs/);
	assert.match(
		bundler,
		/extraLibraryDirs\.map\(\(dir\) => realpath\(dir\)\)/,
	);
	assert.doesNotMatch(bundler, /\.map\(realpath\)/);
});
