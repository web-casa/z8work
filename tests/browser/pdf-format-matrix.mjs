import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import {
	initializeImageMagick,
	MagickImage,
	MagickReadSettings,
} from "@imagemagick/magick-wasm";
import { pdfFixture } from "../helpers-pdf-fixture.mjs";
import { moduleUrl } from "../helpers-load-ts.mjs";
const { PDF_FORMATS } = await import(
	await moduleUrl(
		new URL("../../src/lib/util/pdf-options.ts", import.meta.url),
	)
);
const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE || "playwright",
);
const base = process.env.IIPE_TEST_BASE || "http://localhost:5174";
const output = process.env.IIPE_TEST_OUTPUT || "/tmp/iipe-pdf-format-matrix";
await mkdir(output, { recursive: true });
await initializeImageMagick(
	await readFile(
		new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
	),
);
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
const report = {
	base,
	formats: [],
	pageErrors: [],
	nonReadRequests: [],
	encoderRequests: [],
};
try {
	const context = await browser.newContext({
		viewport: { width: 1100, height: 900 },
		acceptDownloads: true,
	});
	context.on("request", (r) => {
		if (!["GET", "HEAD"].includes(r.method()))
			report.nonReadRequests.push(r.url());
		if (/\.wasm(?:\?|$)/.test(r.url()))
			report.encoderRequests.push(r.url());
	});
	const page = await context.newPage();
	page.on("pageerror", (e) => report.pageErrors.push(e.message));
	await page.addInitScript(() => localStorage.setItem("locale", "zh-Hans"));
	await page.goto(base.replace(/\/$/, "") + "/zh-Hans/", {
		waitUntil: "load",
	});
	await page
		.locator("input[type=file]:enabled")
		.first()
		.setInputFiles([
			{
				name: "单页.pdf",
				mimeType: "application/pdf",
				buffer: Buffer.from(pdfFixture()),
			},
			{
				name: "多页.pdf",
				mimeType: "application/pdf",
				buffer: Buffer.from(pdfFixture({ pages: 2 })),
			},
		]);
	await page.locator(".compact-file").first().waitFor();
	const choose = async (format) => {
		await page.locator(".pixel-batch-format button").first().press("Enter");
		const dialog = page.locator("dialog[open]");
		await dialog.locator("input").fill(format);
		await dialog
			.getByRole("button", { name: format, exact: true })
			.press("Enter");
	};
	const download = async (row) => {
		const event = page.waitForEvent("download");
		await row.locator(".pixel-square").press("Enter");
		const file = await event;
		return {
			name: file.suggestedFilename(),
			bytes: await readFile(await file.path()),
		};
	};
	function inspect(bytes, to) {
		const image = MagickImage.create(
			bytes,
			new MagickReadSettings({ format: to.slice(1).toUpperCase() }),
		);
		try {
			assert.equal(image.width, 144);
			assert.equal(image.height, 96);
			return image.getPixels((p) => [
				...p.toByteArray(24, 60, 1, 1, "RGB"),
			]);
		} finally {
			image.dispose();
		}
	}
	for (const format of PDF_FORMATS) {
		console.log("Converting PDF pages to", format);
		await choose(format);
		await page.waitForFunction(
			() => !document.querySelector(".pixel-convert")?.disabled,
		);
		await page.locator(".pixel-convert").click();
		await page.waitForFunction(
			() =>
				document.querySelectorAll("[data-state=complete]").length ===
					2 ||
				document.querySelectorAll("[data-state=failed]").length > 0,
			{},
			{ timeout: 60000 },
		);
		assert.equal(
			await page.locator("[data-state=complete]").count(),
			2,
			await page.locator(".compact-file").allTextContents(),
		);
		const single = await download(
			page.getByRole("article", { name: "单页.pdf", exact: true }),
		);
		assert.equal(single.name, `Z8.Work_单页${format}`);
		inspect(single.bytes, format);
		const multi = await download(
			page.getByRole("article", { name: "多页.pdf", exact: true }),
		);
		assert.equal(multi.name, "Z8.Work_多页.zip");
		const entries = unzipSync(multi.bytes);
		assert.deepEqual(Object.keys(entries), [
			`page-001${format}`,
			`page-002${format}`,
		]);
		const colors = Object.values(entries).map((bytes) =>
			inspect(bytes, format),
		);
		if (![".pgm", ".pbm"].includes(format)) {
			assert.ok(colors[0][0] > colors[0][2]);
			assert.ok(colors[1][2] > colors[1][0]);
		}
		report.formats.push({
			format,
			singleBytes: single.bytes.length,
			zipBytes: multi.bytes.length,
			pages: Object.keys(entries),
		});
	}
	await choose(".avif");
	await page.waitForFunction(
		() => !document.querySelector(".pixel-convert")?.disabled,
	);
	await page.locator(".pixel-convert").click();
	await page.waitForFunction(
		() =>
			document.querySelectorAll("[data-state=complete]").length === 2 ||
			document.querySelectorAll("[data-state=failed]").length > 0,
		{},
		{ timeout: 60000 },
	);
	await page.evaluate(() => {
		document.activeElement?.blur();
		window.scrollTo({ top: 0, behavior: "instant" });
	});
	await page.screenshot({
		path: `${output}/pdf-avif.png`,
		animations: "disabled",
	});
	await page.locator(".pixel-batch-format button").first().press("Enter");
	await page.locator("dialog[open] .format-expand").click();
	const choices = await page
		.locator("dialog[open] .format-options button")
		.evaluateAll((elements) =>
			elements.map((element) => element.getAttribute("aria-label")),
		);
	assert.deepEqual(
		choices.map((s) => s.trim()).sort(),
		[...PDF_FORMATS].sort(),
	);
	await page.screenshot({
		path: `${output}/pdf-formats.png`,
		animations: "disabled",
	});
	assert.deepEqual(report.pageErrors, []);
	assert.deepEqual(report.nonReadRequests, []);
	assert.ok(
		report.encoderRequests
			.filter((url) => /mupdf|magick/.test(url))
			.every((url) => new URL(url).origin === new URL(base).origin),
	);
	await writeFile(
		`${output}/results.json`,
		JSON.stringify(report, null, 2) + "\n",
	);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser.close();
}
