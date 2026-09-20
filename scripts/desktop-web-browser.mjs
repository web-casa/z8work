import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
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
	args: [
		"--no-sandbox",
		...(process.argv.includes("--stress")
			? ["--js-flags=--max-old-space-size=128"]
			: []),
	],
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
	if (process.argv.includes("--stress"))
		fixtures.push([
			"large-4096.svg",
			"image/svg+xml",
			Buffer.from(
				'<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="4096"><rect width="4096" height="4096" fill="red"/></svg>',
			),
			".png",
			(b) => {
				assert.equal(b.readUInt32BE(16), 4096);
				assert.equal(b.readUInt32BE(20), 4096);
			},
		]);
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

	if (process.argv.includes("--stress")) {
		await page.goto(base + "/convert/");
		const batch = Array.from({ length: 32 }, (_, i) => ({
			name: `batch-${i}.svg`,
			mimeType: "image/svg+xml",
			buffer: fixtures[0][2],
		}));
		await page
			.locator("input[type=file]:enabled")
			.first()
			.setInputFiles(batch);
		await page
			.getByRole("button", { name: "Convert 32 files", exact: true })
			.click();
		await page.waitForFunction(
			() =>
				document.querySelectorAll(
					'.compact-file[data-state="complete"]',
				).length === 32,
			{},
			{ timeout: 180000 },
		);
		const downloaded = page.waitForEvent("download");
		await page
			.getByRole("button", {
				name: "Download 32 completed files (ZIP)",
				exact: true,
			})
			.click();
		const entries = unzipSync(
			await readFile(await (await downloaded).path()),
		);
		assert.equal(Object.keys(entries).length, 32);
		for (const bytes of Object.values(entries)) {
			const dimensions = await page.evaluate(
				async (data) => {
					const image = await createImageBitmap(
						new Blob([new Uint8Array(data)]),
					);
					const size = [image.width, image.height];
					image.close();
					return size;
				},
				[...bytes],
			);
			assert.deepEqual(dimensions, [20, 20]);
		}
		console.log("32-file batch ZIP: every output validated");

		// Hold the real worker's resource request so cancellation is deterministic.
		const fresh = await context.newPage();
		fresh.on("pageerror", (e) => errors.push(e.message));
		let release, requested;
		const gate = new Promise((r) => {
			release = r;
		});
		const seen = new Promise((r) => {
			requested = r;
		});
		await fresh.route("**/pandoc.wasm", async (route) => {
			requested();
			await gate;
			await route.continue().catch(() => {});
		});
		await fresh.goto(base + "/convert/");
		await fresh
			.locator("input[type=file]:enabled")
			.first()
			.setInputFiles({
				name: "cancel.md",
				mimeType: "text/markdown",
				buffer: Buffer.from("# Recover after cancellation"),
			});
		const row = fresh.locator(".compact-file");
		await row.locator(".pixel-file-format button").first().click();
		await fresh.locator("dialog[open] input").fill(".html");
		await fresh
			.locator("dialog[open]")
			.getByRole("button", { name: ".html", exact: true })
			.click();
		await row
			.getByRole("button", { name: "Convert this file", exact: true })
			.click();
		await Promise.race([
			seen,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(Error("Worker never requested resource")),
					15000,
				),
			),
		]);
		await row
			.getByRole("button", { name: "Cancel conversion", exact: true })
			.click();
		await fresh.waitForFunction(
			() =>
				document
					.querySelector(".compact-file")
					?.getAttribute("data-state") === "cancelled",
		);
		release();
		await fresh.unroute("**/pandoc.wasm");
		await row
			.getByRole("button", { name: "Convert this file", exact: true })
			.click();
		await fresh.waitForFunction(
			() =>
				document
					.querySelector(".compact-file")
					?.getAttribute("data-state") === "complete",
			{},
			{ timeout: 120000 },
		);
		console.log("Cancel during engine load and retry: passed");
		await fresh.close();
	}
	// A separate context only stubs the desktop shell for the license UI. Engine
	// conversions above use real WASM and browser downloads, without shell stubs.
	const noticeContext = await browser.newContext({ serviceWorkers: "block" });
	await noticeContext.route("**/*", (route) => {
		const url = new URL(route.request().url());
		if (["http:", "https:"].includes(url.protocol) && url.origin !== base) {
			external.push(url.href);
			return route.abort();
		}
		return route.continue();
	});
	await noticeContext.addInitScript(() => {
		window.__TAURI_INTERNALS__ = {
			metadata: {
				currentWindow: { label: "main" },
				currentWebview: { label: "main" },
			},
			invoke: async () => 1,
			transformCallback: () => 1,
		};
	});
	const notices = await noticeContext.newPage();
	notices.on("pageerror", (e) => errors.push(e.message));
	await notices.goto(base + "/acknowledgements/");
	await notices
		.getByText("Open-source licenses (available offline)", { exact: true })
		.click();
	await notices.locator("summary").filter({ hasText: "Pandoc 3.5" }).click();
	const pandocText = notices
		.locator("details")
		.filter({ has: notices.locator("summary", { hasText: "Pandoc 3.5" }) })
		.last()
		.locator("pre")
		.first();
	await pandocText.waitFor();
	assert.match(await pandocText.textContent(), /Copyright|copyright/);
	assert.ok((await notices.locator("summary").count()) > 100);
	assert.equal(
		await notices.locator("pre").count(),
		1,
		"Collapsed notices should not render license texts",
	);
	assert.equal(
		await notices
			.getByRole("link", { name: "Releases and downloads" })
			.getAttribute("href"),
		"https://github.com/web-casa/z8work/releases",
	);
	await noticeContext.close();
	console.log(
		"Offline licenses and manual release link: passed (shell stub)",
	);
	assert.deepEqual(external, [], "All resources must be bundled");
	assert.deepEqual(errors, []);
	console.log(
		"Four web engines passed from desktop/dist without external network access.",
	);
} finally {
	await browser.close();
	await new Promise((r) => server.close(r));
}
