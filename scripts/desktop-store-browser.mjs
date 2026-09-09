import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { loadStore, pagePath, renderPage } from "./lib/desktop-store.mjs";
const { content, matrix } = await loadStore();
const { values } = parseArgs({
	options: {
		"pages-root": { type: "string", default: "build-pages" },
		output: { type: "string", default: ".desktop-local/phase4-browser" },
	},
});
const output = resolve(values.output);
const files = new Map();
for (const locale of matrix.languages)
	for (const kind of ["privacy", "support"]) {
		const path = pagePath(locale, kind);
		const html = await readFile(
			join(values["pages-root"], path, "index.html"),
			"utf8",
		);
		assert.equal(
			html,
			renderPage(content, locale, kind),
			"Documentation input must match current rendered content",
		);
		files.set(path, html);
	}
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse to replace historical screenshots/reports.
const server = createServer((req, res) => {
	const html = files.get(req.url);
	res.writeHead(html ? 200 : 404, {
		"Content-Type": "text/html; charset=utf-8",
	});
	res.end(html ?? "Not found");
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
	browser = await chromium.launch({
		executablePath: process.env.CHROMIUM_PATH || undefined,
		args: ["--no-sandbox"],
	});
	const context = await browser.newContext({ javaScriptEnabled: false });
	const unexpected = [];
	context.on("request", (req) => {
		if (
			!files.has(new URL(req.url()).pathname) ||
			req.method() !== "GET" ||
			!req.url().startsWith(base + "/")
		)
			unexpected.push(req.url());
	});
	const page = await context.newPage();
	page.setDefaultTimeout(15000);
	const checked = [];
	for (const viewport of [
		{ width: 1366, height: 900 },
		{ width: 390, height: 844 },
	]) {
		await page.setViewportSize(viewport);
		for (const locale of matrix.languages)
			for (const kind of ["privacy", "support"]) {
				await page.goto(base + pagePath(locale, kind), {
					waitUntil: "networkidle",
				});
				assert.equal(
					await page.locator("h1").textContent(),
					content.locales[locale][kind + "Title"],
				);
				assert.equal(
					await page.locator("html").getAttribute("lang"),
					locale,
				);
				assert.equal(await page.locator("script").count(), 0);
				assert.ok(
					await page.evaluate(
						() =>
							document.documentElement.scrollWidth <=
							window.innerWidth,
					),
				);
				assert.equal(
					await page
						.locator('a[href="mailto:contact@web.casa"]')
						.count(),
					1,
				);
				await page.keyboard.press("Tab");
				assert.equal(await page.locator(":focus").count(), 1);
				if (kind === "privacy")
					await page.screenshot({
						path: join(output, `${locale}-${viewport.width}.png`),
						fullPage: true,
					});
				checked.push({
					locale,
					kind,
					width: viewport.width,
					status: "passed",
				});
			}
	}
	await page.goto(base + pagePath("en", "support"));
	await page.locator('header a[lang="zh-Hans"]').click();
	assert.equal(await page.locator("html").getAttribute("lang"), "zh-Hans");
	assert.deepEqual(unexpected, []);
	await writeFile(
		join(output, "report.json"),
		JSON.stringify(
			{
				schema: 1,
				status: "passed",
				javascript: false,
				externalRequests: 0,
				checks: checked,
				languageNavigation: true,
				scope: "Local documentation, not public deployment or native store screenshots",
			},
			null,
			2,
		) + "\n",
	);
	console.log(
		`Desktop documentation: ${checked.length} browser checks passed, no JS or external requests`,
	);
} finally {
	if (browser) await browser.close();
	await new Promise((r) => server.close(r));
}
