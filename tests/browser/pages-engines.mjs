import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.IIPE_TEST_BASE || "http://localhost:5196";
const routes = JSON.parse(await readFile("build-pages/_routes.json", "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const path of routes.include) {
	const response = await fetch(new URL(path, base));
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("content-type"), "application/wasm");
	assert.equal(
		hash(Buffer.from(await response.arrayBuffer())),
		hash(await readFile("build" + path)),
	);
	const head = await fetch(new URL(path, base), { method: "HEAD" });
	assert.equal(head.status, 200);
	assert.equal(await head.text(), "");
	const cached = await fetch(new URL(path, base), {
		headers: { "If-None-Match": response.headers.get("etag") },
	});
	assert.equal(cached.status, 304);
	console.log(`Engine bytes, HEAD and revalidation passed: ${path}`);
}

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
try {
	const context = await browser.newContext({ acceptDownloads: true });
	// Keep the document conversion cold in the HTTP cache. Service Worker
	// Cache Storage remains enabled and is independently checked offline below.
	await context.route("**/*", (route) => route.continue());
	await context.addInitScript(() => localStorage.setItem("locale", "en"));
	const page = await context.newPage();
	const errors = [],
		writes = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("requestfailed", (request) =>
		console.error("Request failed:", request.url(), request.failure()),
	);
	context.on("request", (request) => {
		if (!["GET", "HEAD"].includes(request.method()))
			writes.push(request.url());
	});
	await page.goto(base);
	const input = page.locator("input[type=file]:enabled").first();
	await input.waitFor();
	await input.setInputFiles({
		name: "local-document.md",
		mimeType: "text/markdown",
		buffer: Buffer.from("# Local document\n\nPages engine verification.\n"),
	});
	const row = page.locator(".compact-file");
	await row.locator(".pixel-file-format button").first().click();
	const dialog = page.locator("dialog[open]");
	await dialog.locator("input").fill(".html");
	await dialog.getByRole("button", { name: ".html", exact: true }).click();
	await row.locator(".pixel-square").click();
	await page.waitForFunction(
		() =>
			["complete", "failed"].includes(
				document.querySelector(".compact-file")?.dataset.state,
			),
		{},
		{ timeout: 120000 },
	);
	assert.equal(
		await row.getAttribute("data-state"),
		"complete",
		await row.innerText(),
	);
	const downloaded = page.waitForEvent("download");
	await row.locator(".pixel-square").click();
	const download = await downloaded;
	assert.match(
		await readFile(await download.path(), "utf8"),
		/<h1[^>]*>Local document<\/h1>/,
	);
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller)
			await new Promise((resolve) =>
				navigator.serviceWorker.addEventListener(
					"controllerchange",
					resolve,
					{ once: true },
				),
			);
		await fetch("/pandoc.wasm");
	});
	await page.waitForFunction(
		async () => !!(await caches.match("/pandoc.wasm")),
		{},
		{ timeout: 60000 },
	);
	await context.setOffline(true);
	const offline = await page.evaluate(async () => {
		const response = await fetch("/pandoc.wasm");
		const bytes = await response.arrayBuffer();
		return {
			status: response.status,
			size: bytes.byteLength,
			magic: [...new Uint8Array(bytes, 0, 4)],
		};
	});
	assert.equal(offline.status, 200);
	assert.equal(offline.size, (await readFile("build/pandoc.wasm")).length);
	assert.deepEqual(offline.magic, [0, 97, 115, 109]);
	assert.deepEqual(errors, []);
	assert.deepEqual(writes, []);
	console.log(
		JSON.stringify({
			base,
			documentConversion: "passed",
			offlineEngineCache: "passed",
			pageErrors: errors,
			nonReadRequests: writes,
		}),
	);
} finally {
	await browser.close();
}
