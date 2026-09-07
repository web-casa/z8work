import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { pdfFixture } from "../helpers-pdf-fixture.mjs";
const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
try {
	const context = await browser.newContext({ serviceWorkers: "block" });
	const imageEncoder = process.env.IIPE_PDF_ENGINE === "magick";
	let blocked = !imageEncoder,
		attempts = 0;
	await context.route(
		imageEncoder ? "**/*magick*.wasm*" : "**/*mupdf*.wasm",
		(route) => {
			attempts++;
			return blocked ? route.abort() : route.continue();
		},
	);
	const page = await context.newPage();
	await page.addInitScript(() => localStorage.setItem("locale", "zh-Hans"));
	await page.goto(
		new URL(
			"/zh-Hans/",
			process.env.IIPE_TEST_BASE || "http://localhost:5174/",
		).href,
		{
			waitUntil: "load",
		},
	);
	blocked = true;
	await page
		.locator("input[type=file]:enabled")
		.first()
		.setInputFiles({
			name: "load-retry.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from(pdfFixture()),
		});
	const row = page.getByRole("article", {
		name: "load-retry.pdf",
		exact: true,
	});
	if (imageEncoder) {
		await row.locator(".pixel-file-format button").first().click();
		const dialog = page.locator("dialog[open]");
		await dialog.locator("input").fill(".avif");
		await dialog
			.getByRole("button", { name: ".avif", exact: true })
			.click();
	}
	await row.locator(".pixel-square").click();
	await page.waitForFunction(
		() => document.querySelector("article")?.dataset.state === "failed",
		{},
		{ timeout: 30000 },
	);
	assert.ok(
		(await row.locator(".pixel-conversion-error").textContent()).length > 0,
	);
	if (imageEncoder)
		assert.match(
			await row.locator(".pixel-conversion-error").textContent(),
			/图片编码器加载失败/,
		);
	blocked = false;
	await row.locator(".pixel-square").click();
	await page.waitForFunction(
		() => document.querySelector("article")?.dataset.state === "complete",
		{},
		{ timeout: 30000 },
	);
	console.log(
		JSON.stringify({
			engine: imageEncoder ? "magick" : "mupdf",
			initialWasmFetchFailed: true,
			retryComplete: true,
			wasmFetchAttempts: attempts,
		}),
	);
} finally {
	await browser.close();
}
