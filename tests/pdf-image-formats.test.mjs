import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as mupdf from "mupdf";
import {
	initializeImageMagick,
	MagickImage,
	MagickReadSettings,
} from "@imagemagick/magick-wasm";
import { unzipSync } from "fflate";
import { moduleUrl } from "./helpers-load-ts.mjs";
import { pdfFixture } from "./helpers-pdf-fixture.mjs";
const { renderPdf } = await import(
	await moduleUrl(new URL("../src/lib/util/pdf-images.ts", import.meta.url))
);
const { encodePdfImage } = await import(
	await moduleUrl(
		new URL("../src/lib/util/pdf-image-encoder.ts", import.meta.url),
	)
);
const { PDF_FORMATS, PDF_OUTPUT_TYPES } = await import(
	await moduleUrl(new URL("../src/lib/util/pdf-options.ts", import.meta.url))
);
await initializeImageMagick(
	await readFile(
		new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
	),
);
const render = (bytes, to, quality = to === ".avif" ? 60 : 80) =>
	renderPdf(mupdf, bytes, to, quality, () => {}, encodePdfImage);
const decode = (bytes, format, fn) => {
	const image = MagickImage.create(
		bytes,
		new MagickReadSettings({ format: format.slice(1).toUpperCase() }),
	);
	try {
		return fn(image);
	} finally {
		image.dispose();
	}
};
for (const to of PDF_FORMATS) {
	test(`PDF → ${to}: single image and every page of a ZIP decode correctly`, async () => {
		const single = await render(pdfFixture(), to);
		assert.equal(single.zip, false);
		assert.equal(single.output.type, PDF_OUTPUT_TYPES[to]);
		const bytes = new Uint8Array(await single.output.arrayBuffer());
		decode(bytes, to, (img) => {
			assert.equal(img.width, 144);
			assert.equal(img.height, 96);
		});
		const multi = await render(pdfFixture({ pages: 2 }), to);
		assert.equal(multi.zip, true);
		const entries = unzipSync(
			new Uint8Array(await multi.output.arrayBuffer()),
		);
		assert.deepEqual(Object.keys(entries), [
			`page-001${to}`,
			`page-002${to}`,
		]);
		const redBlue = Object.values(entries).map((bytes) =>
			decode(bytes, to, (img) =>
				img.getPixels((p) => [...p.toByteArray(24, 60, 1, 1, "RGB")]),
			),
		);
		// Monochrome formats deliberately discard color. Other codecs must retain
		// the red/blue page identity, not duplicate or swap pages in the archive.
		if (![".pgm", ".pbm"].includes(to)) {
			assert.ok(redBlue[0][0] > redBlue[0][2], `${to} first page is red`);
			assert.ok(
				redBlue[1][2] > redBlue[1][0],
				`${to} second page is blue`,
			);
		}
	});
}
for (const to of [".avif", ".webp"])
	test(`PDF → ${to} quality 100 preserves rendered RGB pixels`, async () => {
		const png = await render(pdfFixture(), ".png");
		const result = await render(pdfFixture(), to, 100);
		const rgb = async (blob, ext) =>
			decode(new Uint8Array(await blob.arrayBuffer()), ext, (img) =>
				img.getPixels((p) =>
					p.toByteArray(0, 0, img.width, img.height, "RGB"),
				),
			);
		assert.deepEqual(
			await rgb(result.output, to),
			await rgb(png.output, ".png"),
		);
	});
test("PDF → ICO scales large pages proportionally to the 256 px icon limit", async () => {
	const result = await render(
		pdfFixture({ bounds: [0, 0, 720, 360] }),
		".ico",
	);
	decode(new Uint8Array(await result.output.arrayBuffer()), ".ico", (img) => {
		assert.equal(img.width, 256);
		assert.equal(img.height, 128);
	});
});
