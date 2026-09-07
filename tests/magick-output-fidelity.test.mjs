import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	initializeImageMagick,
	MagickImage,
	MagickReadSettings,
	MagickFormat,
	ColorProfile,
	CompressionMethod,
	Orientation,
	AlphaAction,
	ColorSpace,
} from "@imagemagick/magick-wasm";
import { moduleUrl } from "./helpers-load-ts.mjs";

const { convertImage } = await import(
	await moduleUrl(new URL("../src/lib/util/magick-image.ts", import.meta.url))
);
const { srgbProfileBytes } = await import(
	await moduleUrl(
		new URL("../src/lib/assets/profiles/srgb.ts", import.meta.url),
	)
);
await initializeImageMagick(
	await readFile(
		new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
	),
);
const write = (image, format) => image.write(format, (b) => new Uint8Array(b));
const rgba = (image) =>
	image.getPixels(
		(p) =>
			new Uint8Array(
				p.toByteArray(0, 0, image.width, image.height, "RGBA"),
			),
	);
function fixture(alpha = false) {
	const width = 48,
		height = 32,
		pixels = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			pixels.set(
				alpha
					? [255, 0, 0, x < 16 ? 0 : x < 32 ? 128 : 255]
					: [x * 5, y * 7, (x * 13 + y * 3) % 256, 255],
				(y * width + x) * 4,
			);
	return MagickImage.create(
		pixels,
		new MagickReadSettings({ format: MagickFormat.Rgba, width, height }),
	);
}
const source = fixture();
const png16 = write(source, MagickFormat.Png48);
source.dispose();

for (const to of [
	".png",
	".tiff",
	".tif",
	".jxl",
	".jp2",
	".psd",
	".ppm",
	".avif",
	".webp",
])
	test(`16-bit PNG → ${to} uses actual Q8 precision and preserves decoded pixels`, () => {
		const input = MagickImage.create(png16);
		const output = MagickImage.create(
			convertImage(png16, ".png", to, true, 100),
		);
		try {
			assert.equal(input.depth, 16);
			assert.equal(output.depth, 8);
			assert.deepEqual(rgba(output), rgba(input));
		} finally {
			input.dispose();
			output.dispose();
		}
	});

for (const to of [".tiff", ".tif", ".psd", ".png", ".jxl", ".avif", ".webp"])
	test(`palette PNG → ${to} preserves semi-transparent alpha instead of using palette index depth`, () => {
		const src = fixture(true);
		const png = write(src, MagickFormat.Png);
		src.dispose();
		const input = MagickImage.create(png);
		const output = MagickImage.create(
			convertImage(png, ".png", to, false, 100),
		);
		try {
			assert.ok(
				input.depth < 8,
				"Fixture must have a low-bit palette index",
			);
			assert.deepEqual(rgba(output), rgba(input));
		} finally {
			input.dispose();
			output.dispose();
		}
	});

for (const to of [".tiff", ".psd", ".ppm", ".jp2"])
	test(`palette PNG → ${to} preserves 8-bit RGB values that are not palette indices`, () => {
		const colors = [
			[28, 99, 157, 255],
			[121, 188, 33, 255],
			[94, 77, 14, 255],
		];
		const pixels = Uint8Array.from(
			Array.from({ length: 48 * 32 }, (_, i) => colors[i % 3]).flat(),
		);
		const src = MagickImage.create(
			pixels,
			new MagickReadSettings({
				format: MagickFormat.Rgba,
				width: 48,
				height: 32,
			}),
		);
		const png = write(src, MagickFormat.Png);
		src.dispose();
		const input = MagickImage.create(png);
		const output = MagickImage.create(
			convertImage(png, ".png", to, true, 100),
		);
		try {
			assert.ok(input.depth < 8);
			assert.deepEqual(rgba(output), pixels);
		} finally {
			input.dispose();
			output.dispose();
		}
	});

for (const from of [MagickFormat.Jpeg, MagickFormat.Bmp, MagickFormat.Png])
	test(`${from} → TIFF uses lossless compression without another JPEG encoding`, () => {
		const src = fixture();
		const bytes = write(src, from);
		src.dispose();
		const input = MagickImage.create(bytes);
		const outputBytes = convertImage(
			bytes,
			"." + from.toLowerCase(),
			".tiff",
			false,
			80,
		);
		const output = MagickImage.create(outputBytes);
		try {
			assert.equal(output.compression, CompressionMethod.Zip);
			assert.ok(outputBytes.length < input.width * input.height * 3);
			assert.deepEqual(rgba(output), rgba(input));
		} finally {
			input.dispose();
			output.dispose();
		}
	});

for (const keep of [true, false])
	test(`all eight EXIF orientations normalize pixels for PNG/WebP/AVIF (metadata ${keep})`, () => {
		for (const orientation of Object.values(Orientation).filter(
			(n) => n > 0,
		)) {
			const src = fixture();
			src.orientation = orientation;
			src.setAttribute("comment", "orientation-fixture");
			const tiff = write(src, MagickFormat.Tiff);
			src.autoOrient();
			try {
				for (const to of [".png", ".webp", ".avif"]) {
					const output = MagickImage.create(
						convertImage(tiff, ".tiff", to, keep, 100),
					);
					try {
						assert.deepEqual(
							[output.width, output.height],
							[src.width, src.height],
							`${orientation} → ${to}`,
						);
						assert.deepEqual(
							rgba(output),
							rgba(src),
							`${orientation} → ${to}`,
						);
						output.autoOrient();
						assert.deepEqual(
							rgba(output),
							rgba(src),
							"Viewer must not rotate normalized pixels twice",
						);
					} finally {
						output.dispose();
					}
				}
			} finally {
				src.dispose();
			}
		}
	});

for (const to of [".jpeg", ".jpg", ".jpe", ".jfif"])
	test(`transparent PNG → ${to} composites on white rather than exposing hidden RGB`, () => {
		const src = fixture(true);
		const png = write(src, MagickFormat.Png);
		src.dispose();
		const output = MagickImage.create(
			convertImage(png, ".png", to, false, 100),
		);
		try {
			for (const [x, expected] of [
				[8, [255, 255, 255]],
				[24, [255, 127, 127]],
				[40, [255, 0, 0]],
			]) {
				const actual = output.getPixels((p) =>
					p.toByteArray(x, 16, 1, 1, "RGB"),
				);
				assert.ok(
					actual.every((v, i) => Math.abs(v - expected[i]) <= 2),
					`${actual} ≠ ${expected}`,
				);
			}
		} finally {
			output.dispose();
		}
	});

const p3 = new ColorProfile(
	new Uint8Array(
		await readFile(new URL("./fixtures/display-p3.icc", import.meta.url)),
	),
);
test("JPEG EXIF orientation is applied before EXIF/XMP/comment removal", () => {
	// Minimal little-endian EXIF IFD: Orientation (SHORT) = RightTop.
	const exif = new Uint8Array(32);
	exif.set([69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0]);
	const view = new DataView(exif.buffer);
	view.setUint16(14, 1, true);
	view.setUint16(16, 0x112, true);
	view.setUint16(18, 3, true);
	view.setUint32(20, 1, true);
	view.setUint16(24, Orientation.RightTop, true);
	const src = fixture();
	src.setProfile("exif", exif);
	src.orientation = Orientation.RightTop;
	src.setProfile(
		"xmp",
		new TextEncoder().encode(
			'<x:xmpmeta xmlns:x="adobe:ns:meta/">private-fixture</x:xmpmeta>',
		),
	);
	src.setAttribute("comment", "private-fixture");
	const jpeg = write(src, MagickFormat.Jpeg);
	src.dispose();
	const input = MagickImage.create(jpeg);
	const output = MagickImage.create(
		convertImage(jpeg, ".jpeg", ".png", false, 100),
	);
	try {
		assert.equal(input.orientation, Orientation.RightTop);
		assert.ok(input.getProfile("exif"));
		assert.ok(input.getProfile("xmp"));
		input.autoOrient();
		assert.deepEqual([output.width, output.height], [32, 48]);
		assert.deepEqual(rgba(output), rgba(input));
		assert.equal(output.getProfile("exif"), null);
		assert.equal(output.getProfile("xmp"), null);
		assert.equal(output.getAttribute("comment"), null);
	} finally {
		input.dispose();
		output.dispose();
	}
});
for (const to of [".png", ".webp", ".avif", ".jxl", ".tiff"])
	test(`Display P3 → ${to}: retaining metadata keeps the source ICC and pixels`, () => {
		const src = fixture();
		src.setProfile(p3);
		const png = write(src, MagickFormat.Png);
		const output = MagickImage.create(
			convertImage(png, ".png", to, true, 100),
		);
		try {
			assert.deepEqual(rgba(output), rgba(src));
			assert.deepEqual(output.getColorProfile()?.data, p3.data);
		} finally {
			src.dispose();
			output.dispose();
		}
	});
for (const to of [".png", ".webp", ".avif", ".jxl", ".tiff"])
	test(`Display P3 → ${to}: metadata removal converts colors before discarding ICC`, () => {
		const src = fixture();
		src.setProfile(p3);
		src.setAttribute("comment", "private-comment");
		const png = write(src, MagickFormat.Png);
		const raw = rgba(src);
		src.transformColorSpace(new ColorProfile(srgbProfileBytes));
		const expected = rgba(src);
		src.dispose();
		assert.notDeepEqual(
			raw,
			expected,
			"Fixture must require a real color transform",
		);
		const output = MagickImage.create(
			convertImage(png, ".png", to, false, 100),
		);
		try {
			assert.deepEqual(rgba(output), expected);
			assert.equal(output.getAttribute("comment"), null);
			// JXL may synthesize a standard output profile. Never retain the source profile.
			assert.notDeepEqual(output.getColorProfile()?.data, p3.data);
		} finally {
			output.dispose();
		}
	});

for (const keep of [true, false]) {
	for (const to of [".jpeg", ".jpg", ".jpe", ".jfif"]) {
		test(`CMYK transparency composites onto white for ${to} (metadata ${keep})`, () => {
			const source = fixture(true);
			let input, output;
			try {
				source.colorSpace = ColorSpace.CMYK;
				const tiff = write(source, MagickFormat.Tiff);
				input = MagickImage.create(tiff);
				assert.equal(input.colorSpace, ColorSpace.CMYK);
				assert.equal(input.hasAlpha, true);
				output = MagickImage.create(
					convertImage(tiff, ".tiff", to, keep, 100),
				);
				// Inspect displayed RGB values, not raw CMYK channel values.
				output.colorSpace = ColorSpace.sRGB;
				for (const [x, expected] of [
					[8, [255, 255, 255]],
					[24, [255, 127, 127]],
					[40, [255, 0, 0]],
				]) {
					const actual = output.getPixels((p) =>
						p.toByteArray(x, 16, 1, 1, "RGB"),
					);
					assert.ok(
						actual.every((v, i) => Math.abs(v - expected[i]) <= 2),
						`${actual} != ${expected}`,
					);
				}
			} finally {
				output?.dispose();
				input?.dispose();
				source.dispose();
			}
		});
	}
}

test("opaque CMYK keeps its color space and does not enter the alpha path", () => {
	const source = fixture();
	let output;
	try {
		source.colorSpace = ColorSpace.CMYK;
		source.alpha(AlphaAction.Off);
		assert.equal(source.hasAlpha, false);
		output = MagickImage.create(
			convertImage(
				write(source, MagickFormat.Tiff),
				".tiff",
				".jpeg",
				true,
				100,
			),
		);
		assert.equal(output.colorSpace, ColorSpace.CMYK);
	} finally {
		output?.dispose();
		source.dispose();
	}
});

for (const keep of [true, false]) {
	test(`Lab transparency composites onto white (metadata ${keep})`, () => {
		const source = fixture(true);
		let input, output;
		try {
			source.colorSpace = ColorSpace.Lab;
			const tiff = write(source, MagickFormat.Tiff);
			input = MagickImage.create(tiff);
			assert.equal(input.colorSpace, ColorSpace.Lab);
			assert.equal(input.hasAlpha, true);
			input.colorSpace = ColorSpace.sRGB;
			const opaque = input.getPixels(
				(p) => new Uint8Array(p.toByteArray(40, 16, 1, 1, "RGB")),
			);
			output = MagickImage.create(
				convertImage(tiff, ".tiff", ".jpeg", keep, 100),
			);
			output.colorSpace = ColorSpace.sRGB;
			for (const [x, expected] of [
				[8, [255, 255, 255]],
				[40, opaque],
			]) {
				const actual = output.getPixels((p) =>
					p.toByteArray(x, 16, 1, 1, "RGB"),
				);
				assert.ok(
					actual.every((v, i) => Math.abs(v - expected[i]) <= 2),
					`${actual} != ${expected}`,
				);
			}
		} finally {
			output?.dispose();
			input?.dispose();
			source.dispose();
		}
	});
}

for (const depth of [1, 2, 4]) {
	for (const to of [".tiff", ".tif"]) {
		test(`${depth}-bit grayscale keeps packed TIFF samples for ${to}`, () => {
			const width = 256,
				height = 128,
				levels = 2 ** depth;
			const pixels = new Uint8Array(width * height * 4);
			for (let i = 0; i < width * height; i++) {
				const value = ((i % levels) * 255) / (levels - 1);
				pixels.set([value, value, value, 255], i * 4);
			}
			const source = MagickImage.create(
				pixels,
				new MagickReadSettings({
					format: MagickFormat.Rgba,
					width,
					height,
				}),
			);
			let input, output;
			try {
				source.depth = depth;
				const png = write(source, MagickFormat.Png);
				input = MagickImage.create(png);
				assert.equal(input.depth, depth);
				output = MagickImage.create(
					convertImage(png, ".png", to, false, 100),
				);
				assert.equal(
					output.depth,
					depth,
					"Do not expand valid packed samples to 8 bits",
				);
				assert.deepEqual(rgba(output), rgba(input));
			} finally {
				output?.dispose();
				input?.dispose();
				source.dispose();
			}
		});
	}
}
