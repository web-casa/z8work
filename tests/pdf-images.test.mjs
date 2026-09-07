import test from "node:test";
import assert from "node:assert/strict";
import * as mupdf from "mupdf";
import { unzipSync } from "fflate";
import { moduleUrl } from "./helpers-load-ts.mjs";
import { pdfFixture } from "./helpers-pdf-fixture.mjs";
const { renderPdf } = await import(
	await moduleUrl(new URL("../src/lib/util/pdf-images.ts", import.meta.url))
);
const { inputFormat } = await import(
	await moduleUrl(new URL("../src/lib/util/input-format.ts", import.meta.url))
);
const noEncoder = () => {
	throw new Error("Unexpected image encoder call");
};
const render = (bytes, to = ".png", progress = () => {}, encoder = noEncoder) =>
	renderPdf(mupdf, bytes, to, 80, progress, encoder);
function decoded(bytes, fn) {
	const image = new mupdf.Image(bytes);
	const pixels = image.toPixmap();
	try {
		return fn(pixels);
	} finally {
		pixels.destroy();
		image.destroy();
	}
}
for (const to of [".png", ".jpeg", ".jpg"]) {
	test(`single-page PDF → ${to} produces a real image at 144 DPI`, async () => {
		const progress = [];
		const result = await render(pdfFixture(), to, (...args) =>
			progress.push(args),
		);
		assert.equal(result.zip, false);
		assert.equal(result.pages, 1);
		assert.equal(
			result.output.type,
			to === ".png" ? "image/png" : "image/jpeg",
		);
		const bytes = new Uint8Array(await result.output.arrayBuffer());
		assert.deepEqual(
			[...bytes.slice(0, to === ".png" ? 4 : 3)],
			to === ".png" ? [137, 80, 78, 71] : [255, 216, 255],
		);
		decoded(bytes, (pixels) => {
			assert.equal(pixels.getWidth(), 144);
			assert.equal(pixels.getHeight(), 96);
			// PDF's unpainted paper must be white, never transparent/black.
			assert.deepEqual(
				[...pixels.getPixels().slice(0, 3)],
				[255, 255, 255],
			);
		});
		assert.deepEqual(progress, [
			[0, 1],
			[1, 1],
		]);
	});
}
test("all PDF pages appear in ordered ZIP entries, with different rendered pixels", async () => {
	const progress = [];
	const result = await render(pdfFixture({ pages: 3 }), ".png", (...args) =>
		progress.push(args),
	);
	assert.equal(result.zip, true);
	const entries = unzipSync(
		new Uint8Array(await result.output.arrayBuffer()),
	);
	assert.deepEqual(Object.keys(entries), [
		"page-001.png",
		"page-002.png",
		"page-003.png",
	]);
	const colors = Object.values(entries).map((bytes) =>
		decoded(bytes, (pixels) => [
			...pixels
				.getPixels()
				.slice((60 * 144 + 24) * 3, (60 * 144 + 24) * 3 + 3),
		]),
	);
	assert.deepEqual(colors, [
		[255, 0, 0],
		[0, 0, 255],
		[255, 0, 0],
	]);
	assert.deepEqual(progress, [
		[0, 3],
		[1, 3],
		[2, 3],
		[3, 3],
	]);
});
test("rotation and CropBox are reflected in image dimensions", async () => {
	const result = await render(pdfFixture({ rotate: 90, crop: true }));
	decoded(new Uint8Array(await result.output.arrayBuffer()), (pixels) => {
		assert.equal(pixels.getWidth(), 80);
		assert.equal(pixels.getHeight(), 128);
	});
});
for (const [name, fixture, code] of [
	["encrypted", () => pdfFixture({ password: true }), "password"],
	["empty", () => pdfFixture({ pages: 0 }), "empty"],
	["damaged", () => new TextEncoder().encode("not a PDF"), "invalid"],
	["too many pages", () => pdfFixture({ pages: 201 }), "page_limit"],
	[
		"oversized page",
		() => pdfFixture({ bounds: [0, 0, 10000, 10000] }),
		"page_size",
	],
])
	test(`${name} PDF fails explicitly and a subsequent valid PDF still converts`, async () => {
		await assert.rejects(render(fixture()), (error) => error.code === code);
		assert.equal((await render(pdfFixture())).pages, 1);
	});
test("unsupported WebP export cannot silently download PNG with a WebP suffix", async () => {
	await assert.rejects(
		render(
			pdfFixture(),
			".webp",
			() => {},
			async (png) => png,
		),
		(error) => error.code === "encoder_format",
	);
});
test("PDF extension and extensionless PDF MIME are recognized without overriding other suffixes", () => {
	assert.equal(inputFormat({ name: "报告.PDF " }), ".pdf");
	assert.equal(
		inputFormat({ name: "报告", type: "application/pdf" }),
		".pdf",
	);
	assert.equal(
		inputFormat({ name: "report.xlsx", type: "application/pdf" }),
		".xlsx",
	);
});
