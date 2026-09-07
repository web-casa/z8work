import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	initializeImageMagick,
	MagickImage,
	MagickImageCollection,
	MagickReadSettings,
	MagickFormat,
} from "@imagemagick/magick-wasm";
import { moduleUrl } from "./helpers-load-ts.mjs";
const { convertImage, readImageCollection, writeImage } = await import(
	await moduleUrl(new URL("../src/lib/util/magick-image.ts", import.meta.url))
);
await initializeImageMagick(
	await readFile(
		new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
	),
);
const width = 80,
	height = 64,
	pixels = new Uint8Array(width * height * 4);
for (let i = 0; i < width * height; i++)
	pixels.set(
		[i % 256, Math.floor(i / width) * 3, Math.floor(i / 4) % 256, 255],
		i * 4,
	);
const source = MagickImage.create(
	pixels,
	new MagickReadSettings({ format: MagickFormat.Rgba, width, height }),
);
const png = source.write(MagickFormat.Png, (b) => new Uint8Array(b));
source.dispose();
const formats = ["png", "jpeg", "webp", "avif", "gif", "bmp", "tiff", "jxl"];
const encoded = new Map(
	formats.map((ext) => [
		ext,
		convertImage(png, ".png", "." + ext, true, ext === "avif" ? 60 : 80),
	]),
);
for (const from of formats) {
	test(`${from.toUpperCase()} converts to each of 8 image formats and decodes at original dimensions`, () => {
		for (const to of formats) {
			const out = convertImage(
				encoded.get(from),
				"." + from,
				"." + to,
				true,
				to === "avif" ? 60 : 80,
			);
			assert.ok(out.length > 0);
			const decoded = MagickImage.create(out);
			try {
				assert.equal(
					decoded.format,
					to.toUpperCase(),
					`${from}->${to} output format`,
				);
				assert.equal(decoded.width, width, `${from}->${to}`);
				assert.equal(decoded.height, height, `${from}->${to}`);
			} finally {
				decoded.dispose();
			}
		}
	});
}
for (const depth of [8, 10]) {
	test(`${depth}-bit HEIC and HEIF alias decode to PNG without changing decoded pixels`, async () => {
		const heic = new Uint8Array(
			await readFile(
				new URL(
					`./fixtures/gradient-${depth}bit.heic`,
					import.meta.url,
				),
			),
		);
		const input = MagickImage.create(heic);
		const expected = input.getPixels((p) =>
			p.toByteArray(0, 0, 48, 32, "RGBA"),
		);
		input.dispose();
		for (const from of [".heic", ".heif"])
			for (const quality of [1, 80, 100]) {
				let phase = false;
				const out = convertImage(
					heic,
					from,
					".png",
					true,
					quality,
					() => (phase = true),
				);
				assert.ok(phase);
				const img = MagickImage.create(out);
				try {
					assert.equal(img.width, 48);
					assert.equal(img.height, 32);
					assert.deepEqual(
						img.getPixels((p) =>
							p.toByteArray(0, 0, 48, 32, "RGBA"),
						),
						expected,
					);
				} finally {
					img.dispose();
				}
			}
	});
}
test("AVIF compression is smaller than lossless on a deterministic detailed image, while lossless stays exact", () => {
	const lossy = convertImage(png, ".png", ".avif", true, 60),
		lossless = convertImage(png, ".png", ".avif", true, 100);
	assert.ok(lossy.length < lossless.length);
	const img = MagickImage.create(lossless);
	try {
		assert.deepEqual(
			img.write(MagickFormat.Rgba, (b) => new Uint8Array(b)),
			pixels,
		);
	} finally {
		img.dispose();
	}
});
test("animated GIF -> WebP preserves rendered frames and timing; metadata toggle applies to every frame", async () => {
	const input = new Uint8Array(
		await readFile(new URL("./fixtures/partial.gif", import.meta.url)),
	);
	const source = MagickImageCollection.create(input);
	source.coalesce();
	try {
		const out = convertImage(input, ".gif", ".webp", false, 100);
		const result = MagickImageCollection.create(out);
		result.coalesce();
		try {
			assert.equal(result.length, 2);
			for (let i = 0; i < 2; i++) {
				assert.equal(
					result[i].animationDelay,
					source[i].animationDelay,
				);
				assert.equal(result[i].width, 80);
				assert.equal(result[i].height, 64);
				assert.deepEqual(
					result[i].write(
						MagickFormat.Rgba,
						(b) => new Uint8Array(b),
					),
					source[i].write(
						MagickFormat.Rgba,
						(b) => new Uint8Array(b),
					),
				);
				assert.equal(result[i].getAttribute("comment"), null);
			}
		} finally {
			result.dispose();
		}
		const retained = MagickImageCollection.create(
			convertImage(input, ".gif", ".gif", true, 80),
		);
		try {
			assert.equal(
				retained[0].getAttribute("comment"),
				"animation-metadata",
			);
		} finally {
			retained.dispose();
		}
		const stripped = MagickImageCollection.create(
			convertImage(input, ".gif", ".gif", false, 80),
		);
		try {
			for (const f of stripped)
				assert.equal(f.getAttribute("comment"), null);
		} finally {
			stripped.dispose();
		}
	} finally {
		source.dispose();
	}
});
test("WebP -> WebP quality is applied rather than bypassing settings", () => {
	const webp = encoded.get("webp");
	const low = convertImage(webp, ".webp", ".webp", true, 25),
		high = convertImage(webp, ".webp", ".webp", true, 95);
	assert.ok(low.length < high.length);
});
test("corrupt HEIC fails with an error and the engine can process a valid image afterwards", () => {
	assert.throws(() =>
		convertImage(new Uint8Array([0, 1, 2, 3]), ".heic", ".png", true, 80),
	);
	assert.ok(convertImage(png, ".png", ".jpeg", true, 80).length > 0);
});

test("ICO collection uses its explicit decoder and preserves every size", async () => {
	const bytes = new Uint8Array(
		await readFile(new URL("./fixtures/multi.ico", import.meta.url)),
	);
	const icons = readImageCollection(bytes, ".ico");
	try {
		assert.equal(icons.length, 2);
		for (let i = 0; i < 2; i++) {
			const image = MagickImage.create(
				writeImage(icons[i], ".png", true, 80),
			);
			try {
				assert.equal(image.width, [32, 64][i]);
				assert.equal(image.height, [32, 64][i]);
			} finally {
				image.dispose();
			}
		}
	} finally {
		icons.dispose();
	}
});
