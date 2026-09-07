import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.IIPE_TEST_BASE || "http://127.0.0.1:5190";
const output = process.env.IIPE_TEST_OUTPUT || "/tmp/z8-seo-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
try {
	const context = await browser.newContext({
		acceptDownloads: true,
		viewport: { width: 1366, height: 900 },
	});
	await context.addInitScript(() => {
		window.__documentToken = Math.random();
		window.__shellRemounts = 0;
		new MutationObserver((records) => {
			for (const record of records)
				for (const node of record.removedNodes) {
					if (node instanceof Element && node.matches(".pixel-app"))
						window.__shellRemounts++;
				}
		}).observe(document, { childList: true, subtree: true });
		window.__holdConversion = false;
		const post = Worker.prototype.postMessage;
		Worker.prototype.postMessage = function (message, ...rest) {
			if (
				window.__holdConversion &&
				message.type === "convert" &&
				"compression" in message
			) {
				window.__resumeConversion = () =>
					post.call(this, message, ...rest);
				return;
			}
			return post.call(this, message, ...rest);
		};
	});
	const errors = [],
		engines = [],
		writes = [];
	let failEngine = true;
	await context.route("**/*", (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.endsWith(".wasm")) {
			engines.push(url.href);
			if (failEngine && url.pathname.includes("magick"))
				return route.abort();
		}
		return route.continue();
	});
	const page = await context.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	context.on("request", (request) => {
		if (!["GET", "HEAD"].includes(request.method()))
			writes.push(request.url());
	});
	for (const path of [
		"/",
		"/es/about/",
		"/zh-Hans/privacy/",
		"/zh-Hant/environment/",
	]) {
		await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
		assert.equal(await page.locator("h1").count(), 1);
		assert.equal(
			await page.evaluate(() => window.__shellRemounts),
			0,
			"Initial locale hydration must retain prerendered content",
		);
	}
	assert.deepEqual(
		engines,
		[],
		"Reading pages must not download conversion engines, including through the service worker",
	);
	await page.goto(new URL("/zh-Hans/tools/png-to-avif/", base).href);
	await page.locator("input[type=file]:enabled").first().waitFor();
	const token = await page.evaluate(() => window.__documentToken);
	const png = await readFile(
		new URL("../fixtures/cover.png", import.meta.url),
	);
	await page.locator("input[type=file]:enabled").first().setInputFiles({
		name: "preset.png",
		mimeType: "image/png",
		buffer: png,
	});
	await page.waitForURL("**/zh-Hans/convert/");
	const rows = page.locator(".compact-file");
	assert.match(
		await rows.first().locator(".pixel-file-format button").innerText(),
		/AVIF/i,
	);
	assert.deepEqual(
		engines,
		[],
		"Adding a file does not download the encoder before conversion",
	);
	await rows.first().locator(".pixel-square").click();
	await page.waitForFunction(
		() =>
			document.querySelector(".compact-file")?.dataset.state === "failed",
	);
	failEngine = false;
	await rows.first().locator(".pixel-square").click();
	await page.waitForFunction(
		() =>
			document.querySelector(".compact-file")?.dataset.state ===
			"complete",
		{},
		{ timeout: 60000 },
	);
	await page.locator("#header-language").selectOption("es");
	await page.waitForURL("**/es/convert/");
	assert.equal(await page.getAttribute("html", "lang"), "es");
	assert.equal(await rows.first().getAttribute("data-state"), "complete");
	assert.equal(
		await page.evaluate(() => window.__documentToken),
		token,
		"Locale changes preserve the document and results",
	);
	await page.locator(".pixel-wordmark").click();
	await page
		.getByRole("link", { name: "Convertir PNG a WebP", exact: true })
		.click();
	await page.waitForURL("**/es/tools/png-to-webp/");
	await page.locator("input[type=file]:enabled").first().setInputFiles({
		name: "second.png",
		mimeType: "image/png",
		buffer: png,
	});
	await page.waitForURL("**/es/convert/");
	assert.equal(await rows.count(), 2);
	assert.match(
		await rows.first().locator(".pixel-file-format button").innerText(),
		/AVIF/i,
	);
	assert.match(
		await rows.nth(1).locator(".pixel-file-format button").innerText(),
		/WebP/i,
	);
	await page.evaluate(() => {
		window.__holdConversion = true;
	});
	await rows.nth(1).locator(".pixel-square").click();
	await page.waitForFunction(() => !!window.__resumeConversion);
	await page.locator("#header-language").selectOption("zh-Hant");
	await page.waitForURL("**/zh-Hant/convert/");
	assert.equal(await rows.nth(1).getAttribute("data-state"), "processing");
	await page.evaluate(() => window.__resumeConversion());
	await page.waitForFunction(
		() => document.querySelectorAll('[data-state="complete"]').length === 2,
	);
	assert.equal(await page.evaluate(() => window.__documentToken), token);
	await page.goBack();
	await page.waitForFunction(() => document.documentElement.lang === "es");
	await page.goForward();
	await page.waitForFunction(
		() => document.documentElement.lang === "zh-Hant",
	);
	assert.equal(await rows.count(), 2);
	await page.locator(".pixel-wordmark").click();
	await page.getByRole("link", { name: "PNG 轉 AVIF", exact: true }).click();
	for (const width of [1366, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		await page.waitForTimeout(100);
		assert.ok(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth + 1,
			),
			`horizontal overflow at ${width}`,
		);
		await page.screenshot({
			path: `${output}/avif-${width}.png`,
			fullPage: true,
		});
	}
	assert.deepEqual(errors, []);
	assert.deepEqual(writes, []);
	console.log(
		JSON.stringify({
			lazyEngines: true,
			presets: true,
			engineRetry: true,
			languageSwitchPreservesResultsAndActiveConversion: true,
			history: true,
			layouts: [1366, 390, 320],
			pageErrors: errors,
			nonReadRequests: writes,
		}),
	);
} finally {
	await browser.close();
}
