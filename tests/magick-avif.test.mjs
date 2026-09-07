import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import {
	initializeImageMagick,
	MagickImage,
	MagickFormat,
	MagickReadSettings,
} from "@imagemagick/magick-wasm";

const source = await readFile(
	new URL("../src/lib/util/magick-avif.ts", import.meta.url),
	"utf8",
);
const { outputText } = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.ESNext,
		target: ts.ScriptTarget.ES2022,
	},
});
const { configureAvifOutput } = await import(
	`data:text/javascript;base64,${Buffer.from(
		outputText.replace(
			'"@imagemagick/magick-wasm"',
			JSON.stringify(import.meta.resolve("@imagemagick/magick-wasm")),
		),
	).toString("base64")}`
);
await initializeImageMagick(
	await readFile(
		new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
	),
);

const width = 17;
const height = 13;
function fixture(alpha = false) {
	const pixels = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		pixels.set(
			[
				(i * 37) % 256,
				(i * 59) % 256,
				(i * 83) % 256,
				alpha ? (i * 19) % 256 : 255,
			],
			i * 4,
		);
	}
	return MagickImage.create(
		pixels,
		new MagickReadSettings({ format: MagickFormat.Rgba, width, height }),
	);
}
function bytes(image, format) {
	return image.write(format, (output) => new Uint8Array(output));
}

for (const from of [MagickFormat.Png, MagickFormat.WebP]) {
	for (const alpha of [false, true]) {
		test(`${from} ${alpha ? "RGBA" : "RGB"} converts to AVIF at quality 100 without pixel loss`, () => {
			const original = fixture(alpha);
			let input;
			let decoded;
			try {
				original.quality = 100;
				input = MagickImage.create(bytes(original, from));
				const expected = input.getPixels((pixels) =>
					pixels.toByteArray(0, 0, width, height, "RGBA"),
				);
				input.quality = 100;
				configureAvifOutput(input);
				decoded = MagickImage.create(bytes(input, MagickFormat.Avif));
				assert.equal(input.quality, 100);
				assert.equal(decoded.width, width);
				assert.equal(decoded.height, height);
				assert.deepEqual(
					decoded.getPixels((pixels) =>
						pixels.toByteArray(0, 0, width, height, "RGBA"),
					),
					expected,
				);
			} finally {
				decoded?.dispose();
				input?.dispose();
				original.dispose();
			}
		});
	}
}

test("lossy AVIF quality stays unchanged and does not get identity-matrix overrides", () => {
	const image = fixture();
	try {
		image.quality = 80;
		configureAvifOutput(image);
		assert.equal(image.quality, 80);
		assert.equal(image.settings.getDefine("heic:cicp"), null);
		assert.ok(bytes(image, MagickFormat.Avif).length > 0);
	} finally {
		image.dispose();
	}
});

test("source CICP primaries and transfer are preserved in lossless AVIF", () => {
	const image = fixture();
	let decoded;
	try {
		image.setAttribute("heic:cicp", "9/16/9/0");
		image.quality = 100;
		configureAvifOutput(image);
		decoded = MagickImage.create(bytes(image, MagickFormat.Avif));
		assert.equal(decoded.getAttribute("heic:cicp"), "9/16/0/1");
	} finally {
		decoded?.dispose();
		image.dispose();
	}
});

test("an embedded ICC profile is preserved without imposing sRGB primaries", async () => {
	const image = MagickImage.create(
		await readFile(
			new URL("../src/lib/assets/avatars/liam.jpg", import.meta.url),
		),
	);
	let decoded;
	try {
		image.resize(24, 24);
		const profile = image.getColorProfile();
		assert.ok(profile);
		const expected = new Uint8Array(profile.data);
		image.quality = 100;
		configureAvifOutput(image);
		decoded = MagickImage.create(bytes(image, MagickFormat.Avif));
		assert.deepEqual(decoded.getColorProfile()?.data, expected);
	} finally {
		decoded?.dispose();
		image.dispose();
	}
});

test("metadata stripping remains effective for quality 100 AVIF", async () => {
	const image = MagickImage.create(
		await readFile(
			new URL("../src/lib/assets/avatars/liam.jpg", import.meta.url),
		),
	);
	let decoded;
	try {
		image.resize(24, 24);
		image.strip();
		image.quality = 100;
		configureAvifOutput(image);
		decoded = MagickImage.create(bytes(image, MagickFormat.Avif));
		assert.equal(decoded.getColorProfile(), null);
	} finally {
		decoded?.dispose();
		image.dispose();
	}
});

for (const quality of [60, 100]) {
	test(`16-bit source tags do not inflate Q8 AVIF output depth at quality ${quality}`, () => {
		const original = fixture();
		let source;
		let decoded;
		try {
			original.depth = 16;
			source = MagickImage.create(bytes(original, MagickFormat.Png48));
			assert.equal(source.depth, 16);
			const expected = source.getPixels((pixels) =>
				pixels.toByteArray(0, 0, width, height, "RGBA"),
			);
			source.quality = quality;
			configureAvifOutput(source);
			assert.equal(source.depth, 8);
			decoded = MagickImage.create(bytes(source, MagickFormat.Avif));
			assert.equal(decoded.depth, 8);
			if (quality === 100)
				assert.deepEqual(
					decoded.getPixels((pixels) =>
						pixels.toByteArray(0, 0, width, height, "RGBA"),
					),
					expected,
				);
		} finally {
			decoded?.dispose();
			source?.dispose();
			original.dispose();
		}
	});
}
