import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { unzipSync, zipSync } from "fflate";
import { moduleUrl } from "../helpers-load-ts.mjs";
const { PDF_FORMATS } = await import(
	await moduleUrl(
		new URL("../../src/lib/util/pdf-options.ts", import.meta.url),
	)
);
import { pdfFixture } from "../helpers-pdf-fixture.mjs";
const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE || "playwright",
);
const base = process.env.IIPE_TEST_BASE || "http://localhost:5174";
const output = process.env.IIPE_TEST_OUTPUT || "/tmp/iipe-pdf-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
const report = {
	base,
	downloads: [],
	failures: [],
	viewports: [],
	pageErrors: [],
	nonReadRequests: [],
	pdfRequests: [],
};
try {
	const context = await browser.newContext({
		viewport: { width: 1100, height: 900 },
		acceptDownloads: true,
	});
	context.on("request", (request) => {
		if (!["GET", "HEAD"].includes(request.method()))
			report.nonReadRequests.push(request.url());
		if (/mupdf|\/workers\/pdf|\/workers\/assets\/pdf/.test(request.url()))
			report.pdfRequests.push(request.url());
	});
	const page = await context.newPage();
	page.on("pageerror", (error) => report.pageErrors.push(error.message));
	await page.addInitScript(() => localStorage.setItem("locale", "zh-Hans"));
	await page.goto(base.replace(/\/$/, "") + "/zh-Hans/", {
		waitUntil: "load",
	});
	await page
		.locator("input[type=file]:enabled")
		.first()
		.waitFor({ state: "attached" });
	assert.equal(
		report.pdfRequests.filter((url) => url.includes("mupdf")).length,
		0,
		"PDF engine should load only on conversion",
	);
	const add = async (name, bytes, mimeType = "application/pdf") => {
		await page
			.locator("input[type=file]:enabled")
			.first()
			.setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) });
		const row = page.getByRole("article", {
			name: name.replace(/\.PDF$/, ".pdf"),
			exact: true,
		});
		await row.waitFor();
		return row;
	};
	const target = async (row, format) => {
		await row.locator(".pixel-file-format button").first().press("Enter");
		const dialog = page.locator("dialog[open]");
		await dialog.locator("input").fill(format);
		await dialog
			.getByRole("button", { name: format, exact: true })
			.press("Enter");
	};
	const convert = async (row) => {
		await row.locator(".pixel-square").press("Enter");
		await page.waitForFunction(
			(name) =>
				document.querySelector(`article[aria-label="${name}"]`)?.dataset
					.state === "complete",
			await row.getAttribute("aria-label"),
			{ timeout: 60000 },
		);
	};
	const download = async (row) => {
		const event = page.waitForEvent("download");
		await row.locator(".pixel-square").press("Enter");
		const file = await event;
		const bytes = await readFile(await file.path());
		report.downloads.push({
			name: file.suggestedFilename(),
			bytes: bytes.length,
		});
		return { name: file.suggestedFilename(), bytes };
	};
	await add("单页.PDF", pdfFixture());
	// Extension normalization is visible in the actual accessible row name.
	const first = page.getByRole("article", { name: "单页.pdf", exact: true });
	await first.waitFor();
	await first.locator(".pixel-file-format button").first().press("Enter");
	await page.locator("dialog[open] .format-expand").click();
	assert.deepEqual(
		(
			await page
				.locator("dialog[open] .format-options button")
				.evaluateAll((elements) =>
					elements.map((element) =>
						element.getAttribute("aria-label"),
					),
				)
		)
			.map((text) => text.trim())
			.sort(),
		[...PDF_FORMATS].sort(),
	);
	await page.keyboard.press("Escape");
	for (const format of [".png", ".jpeg", ".jpg", ".webp"]) {
		if (format !== ".png") await target(first, format);
		await convert(first);
		const result = await download(first);
		assert.equal(result.name, `Z8.Work_单页${format}`);
		const signature =
			format === ".png"
				? [137, 80, 78, 71]
				: format === ".webp"
					? [82, 73, 70, 70]
					: [255, 216, 255];
		assert.deepEqual(
			[...result.bytes.subarray(0, signature.length)],
			signature,
		);
		if (format === ".webp")
			assert.equal(result.bytes.subarray(8, 12).toString(), "WEBP");
		const dimensions = await page.evaluate(
			async ({ bytes, type }) => {
				const bitmap = await createImageBitmap(
					new Blob([new Uint8Array(bytes)], { type }),
				);
				const result = [bitmap.width, bitmap.height];
				bitmap.close();
				return result;
			},
			{
				bytes: [...result.bytes],
				type:
					format === ".png"
						? "image/png"
						: format === ".webp"
							? "image/webp"
							: "image/jpeg",
			},
		);
		assert.deepEqual(dimensions, [144, 96]);
	}
	const multi = await add("多页.pdf", pdfFixture({ pages: 3 }));
	for (const format of [".png", ".jpeg", ".webp"]) {
		await target(multi, format);
		await convert(multi);
		const result = await download(multi);
		assert.equal(result.name, "Z8.Work_多页.zip");
		const entries = unzipSync(result.bytes);
		assert.deepEqual(
			Object.keys(entries),
			[1, 2, 3].map((i) => `page-00${i}${format}`),
		);
		for (const bytes of Object.values(entries)) {
			const header =
				format === ".png"
					? [137, 80, 78, 71]
					: format === ".webp"
						? [82, 73, 70, 70]
						: [255, 216, 255];
			assert.deepEqual([...bytes.subarray(0, header.length)], header);
		}
	}
	const noSuffix = await add("无后缀", pdfFixture());
	await convert(noSuffix);
	assert.equal((await download(noSuffix)).name, "Z8.Work_无后缀.png");
	for (const [name, bytes, pattern] of [
		["加密.pdf", pdfFixture({ password: true }), /需要密码/],
		["损坏.pdf", Buffer.from("broken PDF"), /无法读取/],
		["空白文档.pdf", pdfFixture({ pages: 0 }), /没有可转换的页面/],
		[
			"大页面.pdf",
			pdfFixture({ bounds: [0, 0, 10000, 10000] }),
			/1600 万像素/,
		],
		["页数超限.pdf", pdfFixture({ pages: 201 }), /200 页/],
	]) {
		const row = await add(name, bytes);
		await row.locator(".pixel-square").press("Enter");
		await page.waitForFunction(
			(name) =>
				document.querySelector(`article[aria-label="${name}"]`)?.dataset
					.state === "failed",
			name,
			{ timeout: 30000 },
		);
		assert.match(
			await row.locator(".pixel-conversion-error").textContent(),
			pattern,
		);
		report.failures.push(name);
		await row.locator(".file-remove").press("Enter");
	}
	// Cancel a real, deliberately expensive render and ensure a subsequent PDF
	// acquires the queue slot. Page pixels still stay under the per-page limit.
	const slow = await add(
		"取消.pdf",
		pdfFixture({ pages: 80, bounds: [0, 0, 1000, 1000] }),
	);
	await target(slow, ".avif");
	await slow.locator(".pixel-square").press("Enter");
	await page.waitForFunction(
		() => {
			const row = document.querySelector(
				'article[aria-label="取消.pdf"]',
			);
			return (
				row?.dataset.state === "processing" &&
				/已处理 [1-9]\d* \/ 80 页/.test(row.textContent)
			);
		},
		{},
		{ timeout: 60000 },
	);
	const behind = await add("后续.pdf", pdfFixture());
	await behind.locator(".pixel-square").press("Enter");
	await slow.locator(".pixel-square").press("Enter");
	await page.waitForFunction(
		() =>
			document.querySelector('article[aria-label="取消.pdf"]')?.dataset
				.state === "cancelled",
	);
	await page.waitForFunction(
		() =>
			document.querySelector('article[aria-label="后续.pdf"]')?.dataset
				.state === "complete",
		{},
		{ timeout: 30000 },
	);
	await slow.locator(".file-remove").press("Enter");
	const retry = await add(
		"重试.pdf",
		pdfFixture({ pages: 20, bounds: [0, 0, 1000, 1000] }),
	);
	await retry.locator(".pixel-square").press("Enter");
	await retry.locator(".pixel-square").press("Enter");
	await page.waitForFunction(
		() =>
			document.querySelector('article[aria-label="重试.pdf"]')?.dataset
				.state === "cancelled",
	);
	await convert(retry);
	await download(retry);
	// PDF-only archives expand to individual PDFs instead of nested ZIP outputs.
	await page
		.locator("input[type=file]:enabled")
		.first()
		.setInputFiles({
			name: "PDF合集.zip",
			mimeType: "application/zip",
			buffer: Buffer.from(
				zipSync({
					"归档一.pdf": pdfFixture(),
					"归档二.pdf": pdfFixture({ pages: 2 }),
				}),
			),
		});
	const archived = page.getByRole("article", {
		name: "归档二.pdf",
		exact: true,
	});
	await archived.waitFor();
	await convert(archived);
	await download(archived);
	// Ordinary PNGs retain the image converter and its full list of output formats.
	const png = await page.evaluate(() => {
		const c = document.createElement("canvas");
		c.width = c.height = 8;
		return c.toDataURL().split(",")[1];
	});
	const image = await add(
		"正常图片.png",
		Buffer.from(png, "base64"),
		"image/png",
	);
	await target(image, ".avif");
	await convert(image);
	await page
		.locator(".toast-close")
		.evaluateAll((buttons) => buttons.forEach((button) => button.click()));
	await page.waitForFunction(
		() => document.querySelectorAll(".toast-close").length === 0,
	);
	for (const width of [320, 390, 1100]) {
		await page.setViewportSize({ width, height: 900 });
		await page.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(resolve)),
				),
		);
		await page.evaluate(() => {
			document.activeElement?.blur();
			window.scrollTo({ top: 0, behavior: "instant" });
		});
		assert.ok(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth + 1,
			),
		);
		report.viewports.push(width);
		await page.screenshot({
			path: `${output}/pdf-${width}.png`,
			fullPage: true,
		});
	}
	await page.screenshot({
		path: `${output}/pdf-workspace.png`,
		fullPage: true,
	});
	assert.deepEqual(report.pageErrors, []);
	assert.deepEqual(report.nonReadRequests, []);
	assert.ok(report.pdfRequests.some((url) => url.includes(".wasm")));
	assert.ok(
		report.pdfRequests.every(
			(url) => new URL(url).origin === new URL(base).origin,
		),
	);
	await writeFile(
		`${output}/results.json`,
		JSON.stringify(report, null, 2) + "\n",
	);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser.close();
}
