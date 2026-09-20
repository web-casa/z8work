import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { pdfFixture } from "../tests/helpers-pdf-fixture.mjs";

const root = resolve("desktop/dist");
const server = createServer(async (req, res) => {
	try {
		let path = resolve(
			root,
			"." +
				decodeURIComponent(
					new URL(req.url, "http://localhost").pathname,
				),
		);
		if (!path.startsWith(root + sep) && path !== root) {
			res.writeHead(403).end();
			return;
		}
		if ((await stat(path)).isDirectory())
			path = resolve(path, "index.html");
		const type =
			{
				".html": "text/html",
				".js": "text/javascript",
				".css": "text/css",
				".wasm": "application/wasm",
				".svg": "image/svg+xml",
				".json": "application/json",
			}[extname(path)] || "application/octet-stream";
		res.writeHead(200, { "Content-Type": type });
		res.end(await readFile(path));
	} catch {
		res.writeHead(404).end();
	}
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
	executablePath:
		process.env.CHROMIUM_PATH ||
		(existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
	args: ["--no-sandbox"],
});
try {
	const context = await browser.newContext({
		serviceWorkers: "block",
		acceptDownloads: true,
	});
	const external = [],
		errors = [];
	await context.route("**/*", (route) => {
		const url = new URL(route.request().url());
		if (["http:", "https:"].includes(url.protocol) && url.origin !== base) {
			external.push(url.href);
			return route.abort();
		}
		return route.continue();
	});
	const page = await context.newPage();
	page.on("pageerror", (e) => errors.push(e.message));
	const wave = Buffer.alloc(44 + 16000);
	wave.write("RIFF");
	wave.writeUInt32LE(wave.length - 8, 4);
	wave.write("WAVEfmt ", 8);
	wave.writeUInt32LE(16, 16);
	wave.writeUInt16LE(1, 20);
	wave.writeUInt16LE(1, 22);
	wave.writeUInt32LE(8000, 24);
	wave.writeUInt32LE(16000, 28);
	wave.writeUInt16LE(2, 32);
	wave.writeUInt16LE(16, 34);
	wave.write("data", 36);
	wave.writeUInt32LE(16000, 40);
	const fixtures = [
		[
			"图片.svg",
			"image/svg+xml",
			Buffer.from(
				'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
			),
			".png",
			(b) => assert.equal(b.subarray(1, 4).toString(), "PNG"),
		],
		[
			"音频.wav",
			"audio/wav",
			wave,
			".flac",
			(b) => assert.equal(b.subarray(0, 4).toString(), "fLaC"),
		],
		[
			"文档.md",
			"text/markdown",
			Buffer.from("# Desktop web conversion\n\nOffline document."),
			".html",
			(b) =>
				assert.match(
					b.toString(),
					/<h1[^>]*>Desktop web conversion<\/h1>/,
				),
		],
		[
			"页面.pdf",
			"application/pdf",
			Buffer.from(pdfFixture()),
			".png",
			(b) => assert.equal(b.subarray(1, 4).toString(), "PNG"),
		],
	];
	for (const [name, mimeType, buffer, format, check] of fixtures) {
		await page.goto(base + "/convert/");
		await page
			.locator("input[type=file]:enabled")
			.first()
			.setInputFiles({ name, mimeType, buffer });
		const row = page.locator(".compact-file");
		await row.locator(".pixel-file-format button").first().click();
		const dialog = page.locator("dialog[open]");
		await dialog.locator("input").fill(format);
		await dialog.getByRole("button", { name: format, exact: true }).click();
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
		const bytes = await readFile(await download.path());
		check(bytes);
		console.log(`${name} -> ${format}: ${bytes.length} bytes, validated`);
	}
	assert.deepEqual(external, [], "All resources must be bundled");
	assert.deepEqual(errors, []);
	console.log(
		"Four web engines passed from desktop/dist without external network access.",
	);
} finally {
	await browser.close();
	await new Promise((r) => server.close(r));
}
