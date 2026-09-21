import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep, basename } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { pdfFixture } from "../tests/helpers-pdf-fixture.mjs";

const { values } = parseArgs({
	options: {
		stress: { type: "boolean" },
		"ffmpeg-core-dir": { type: "string" },
		"video-fixture": { type: "string" },
		"mupdf-wasm": { type: "string" },
		"pandoc-wasm": { type: "string" },
	},
});
const candidate = new Map();
const candidateRequests = { js: 0, wasm: 0 };
const mupdfCandidate = values["mupdf-wasm"]
	? await readFile(values["mupdf-wasm"])
	: null;
let mupdfRequests = 0;
if (mupdfCandidate)
	assert.equal(mupdfCandidate.subarray(0, 4).toString("hex"), "0061736d");
const pandocCandidate = values["pandoc-wasm"]
	? await readFile(values["pandoc-wasm"])
	: null;
let pandocRequests = 0;
if (pandocCandidate)
	assert.equal(pandocCandidate.subarray(0, 4).toString("hex"), "0061736d");
if (values["ffmpeg-core-dir"]) {
	for (const extension of ["js", "wasm"]) {
		const bytes = await readFile(
			resolve(values["ffmpeg-core-dir"], `ffmpeg-core.${extension}`),
		);
		if (extension === "wasm")
			assert.equal(bytes.subarray(0, 4).toString("hex"), "0061736d");
		candidate.set(extension, bytes);
	}
}
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
		const asset = /^ffmpeg-core[.-][^.]+\.(js|wasm)$/.exec(basename(path));
		if (pandocCandidate && basename(path) === "pandoc.wasm") {
			pandocRequests += 1;
			res.end(pandocCandidate);
		} else if (
			mupdfCandidate &&
			/^mupdf-wasm[.-][^.]+\.wasm$/.test(basename(path))
		) {
			mupdfRequests += 1;
			res.end(mupdfCandidate);
		} else if (candidate.size && asset) {
			candidateRequests[asset[1]] += 1;
			res.end(candidate.get(asset[1]));
		} else {
			res.end(await readFile(path));
		}
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
	if (mupdfCandidate) {
		const pixels = async (bytes, width, height, expectedColor) => {
			const result = await page.evaluate(
				async ({ data, color }) => {
					const image = await createImageBitmap(
						new Blob([new Uint8Array(data)]),
					);
					const canvas = new OffscreenCanvas(
						image.width,
						image.height,
					);
					const ctx = canvas.getContext("2d");
					ctx.drawImage(image, 0, 0);
					const pixel = Array.from(
						ctx.getImageData(24, 60, 1, 1).data,
					);
					const result = {
						width: image.width,
						height: image.height,
						pixel,
						color,
					};
					image.close();
					return result;
				},
				{ data: [...bytes], color: expectedColor },
			);
			assert.equal(result.width, width);
			assert.equal(result.height, height);
			if (expectedColor) assert.deepEqual(result.pixel, expectedColor);
		};
		fixtures.push(
			[
				"彩色页面.pdf",
				"application/pdf",
				Buffer.from(pdfFixture()),
				".png",
				(bytes) => pixels(bytes, 144, 96, [255, 0, 0, 255]),
			],
			[
				"旋转裁剪.pdf",
				"application/pdf",
				Buffer.from(pdfFixture({ rotate: 90, crop: true })),
				".jpeg",
				(bytes) => pixels(bytes, 80, 128),
			],
			[
				"多页文档.pdf",
				"application/pdf",
				Buffer.from(pdfFixture({ pages: 2 })),
				".png",
				async (bytes) => {
					const entries = unzipSync(bytes);
					assert.deepEqual(Object.keys(entries), [
						"page-001.png",
						"page-002.png",
					]);
					await pixels(
						entries["page-001.png"],
						144,
						96,
						[255, 0, 0, 255],
					);
					await pixels(
						entries["page-002.png"],
						144,
						96,
						[0, 0, 255, 255],
					);
				},
			],
		);
	}
	if (values["video-fixture"]) {
		fixtures.push([
			"视频.mp4",
			"video/mp4",
			await readFile(values["video-fixture"]),
			".flac",
			async (bytes) => {
				assert.equal(bytes.subarray(0, 4).toString(), "fLaC");
				const decoded = await page.evaluate(
					async (data) => {
						const audio = new OfflineAudioContext(1, 1, 8000);
						const buffer = await audio.decodeAudioData(
							new Uint8Array(data).buffer,
						);
						return {
							duration: buffer.duration,
							nonSilent: buffer
								.getChannelData(0)
								.some((sample) => Math.abs(sample) > 0.005),
						};
					},
					[...bytes],
				);
				assert.ok(decoded.duration > 0.2 && decoded.duration < 1);
				assert.equal(
					decoded.nonSilent,
					true,
					"extracted video audio must contain the generated tone",
				);
			},
		]);
	}
	if (candidate.size) {
		fixtures.push(
			[
				"candidate.mp3-input.wav",
				"audio/wav",
				wave,
				".mp3",
				(bytes) => assert.equal(bytes.subarray(0, 3).toString(), "ID3"),
			],
			[
				"candidate.ogg-input.wav",
				"audio/wav",
				wave,
				".ogg",
				(bytes) =>
					assert.equal(bytes.subarray(0, 4).toString(), "OggS"),
			],
		);
	}
	if (pandocCandidate) {
		fixtures.push([
			"candidate-pandoc.md",
			"text/markdown",
			Buffer.from("# Candidate Pandoc\n\nUnicode: 文档转换。"),
			".docx",
			(bytes) => {
				const entries = unzipSync(bytes);
				assert.ok(entries["[Content_Types].xml"]);
				assert.ok(entries["word/document.xml"]);
				const documentXml = Buffer.from(
					entries["word/document.xml"],
				).toString();
				assert.match(documentXml, /Candidate Pandoc/);
				assert.match(documentXml, /文档转换。/);
			},
		]);
	}
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
		await check(bytes);
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
			invoke: async (command) =>
				command === "distribution_channel"
					? (window.__Z8_TEST_CHANNEL ?? "direct")
					: 1,
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
	await notices.addInitScript(() => {
		window.__Z8_TEST_CHANNEL = "store";
	});
	await notices.reload();
	await notices
		.getByText("Open-source licenses (available offline)", { exact: true })
		.waitFor();
	assert.equal(
		await notices
			.getByRole("link", { name: "Releases and downloads" })
			.count(),
		0,
	);
	await noticeContext.close();
	console.log(
		"Offline licenses and manual release link: passed (shell stub)",
	);
	if (candidate.size) {
		assert.ok(
			candidateRequests.js > 0 && candidateRequests.wasm > 0,
			"Candidate JS and WASM must both be requested",
		);
		console.log(
			JSON.stringify({
				candidateFfmpeg: "passed",
				requests: candidateRequests,
				hashes: Object.fromEntries(
					[...candidate].map(([extension, bytes]) => [
						extension,
						createHash("sha256").update(bytes).digest("hex"),
					]),
				),
			}),
		);
	}
	assert.deepEqual(external, [], "All resources must be bundled");
	if (mupdfCandidate) {
		assert.ok(mupdfRequests > 0, "Candidate MuPDF WASM must be requested");
		console.log(
			JSON.stringify({
				candidateMupdf: "passed",
				requests: mupdfRequests,
				sha256: createHash("sha256")
					.update(mupdfCandidate)
					.digest("hex"),
			}),
		);
	}
	if (pandocCandidate) {
		assert.ok(
			pandocRequests > 0,
			"Candidate Pandoc WASM must be requested",
		);
		console.log(
			JSON.stringify({
				candidatePandoc: "passed",
				requests: pandocRequests,
				sha256: createHash("sha256")
					.update(pandocCandidate)
					.digest("hex"),
			}),
		);
	}
	assert.deepEqual(errors, []);
	console.log(
		"Four web engines passed from desktop/dist without external network access.",
	);
} finally {
	await browser.close();
	await new Promise((r) => server.close(r));
}
