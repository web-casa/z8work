import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
try {
	const base = process.env.IIPE_TEST_BASE || "http://localhost:5174";
	const origin = new URL(base).origin;
	const context = await browser.newContext({
		serviceWorkers: "block",
		acceptDownloads: true,
	});
	const external = [],
		engines = [],
		errors = [];
	let failEngine = true;
	await context.route("**/*", (route) => {
		const url = new URL(route.request().url());
		if (
			["http:", "https:"].includes(url.protocol) &&
			url.origin !== origin
		) {
			external.push(url.href);
			return route.abort();
		}
		// Vite's development ?url modules only export a path; they are not engine downloads.
		if (
			url.pathname.includes("ffmpeg-core") &&
			!url.searchParams.has("url")
		)
			engines.push(url.href);
		if (
			failEngine &&
			url.pathname.includes("ffmpeg-core") &&
			url.pathname.endsWith(".wasm") &&
			!url.searchParams.has("url")
		)
			return route.abort();
		return route.continue();
	});
	await context.addInitScript(() => {
		localStorage.setItem("locale", "en");
		window.__ffmpegWorkers = [];
		const records = new WeakMap();
		const post = Worker.prototype.postMessage;
		const terminate = Worker.prototype.terminate;
		Worker.prototype.postMessage = function (message, ...args) {
			if (
				message.type === "LOAD" &&
				message.data?.coreURL?.includes("ffmpeg-core")
			) {
				const record = {
					terminated: false,
					held: !!window.__holdFFmpeg,
				};
				records.set(this, record);
				window.__ffmpegWorkers.push(record);
				if (record.held) return;
			}
			return post.call(this, message, ...args);
		};
		Worker.prototype.terminate = function () {
			const record = records.get(this);
			if (record) record.terminated = true;
			return terminate.call(this);
		};
	});
	const page = await context.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(base, { waitUntil: "load" });
	await page.locator("input[type=file]:enabled").first().waitFor();
	assert.deepEqual(engines, [], "FFmpeg should not load on the homepage");
	const samples = 8000;
	const wave = Buffer.alloc(44 + samples * 2);
	wave.write("RIFF", 0);
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
	wave.writeUInt32LE(samples * 2, 40);
	for (let i = 0; i < samples; i++)
		wave.writeInt16LE(
			Math.round(2000 * Math.sin((i * Math.PI) / 10)),
			44 + i * 2,
		);
	await page.locator("input[type=file]:enabled").first().setInputFiles({
		name: "local.wav",
		mimeType: "audio/wav",
		buffer: wave,
	});
	const row = page.locator(".compact-file");
	await row.locator(".pixel-file-format button").first().click();
	const dialog = page.locator("dialog[open]");
	await dialog.locator("input").fill(".flac");
	await dialog.getByRole("button", { name: ".flac", exact: true }).click();
	await row.locator(".pixel-square").click();
	await page.waitForFunction(
		() =>
			document.querySelector(".compact-file")?.dataset.state === "failed",
	);
	assert.equal(
		await page.evaluate(() => window.__ffmpegWorkers.at(-1).terminated),
		true,
	);
	failEngine = false;
	await row.locator(".pixel-square").click();
	await page.waitForFunction(
		() =>
			["complete", "failed"].includes(
				document.querySelector(".compact-file")?.dataset.state,
			),
		{},
		{ timeout: 60000 },
	);
	assert.equal(
		await row.getAttribute("data-state"),
		"complete",
		await row.textContent(),
	);
	const download = page.waitForEvent("download");
	await row.locator(".pixel-square").click();
	const result = await download;
	const bytes = await readFile(await result.path());
	assert.equal(bytes.subarray(0, 4).toString(), "fLaC");
	assert.ok(engines.some((url) => url.includes(".wasm")));
	assert.ok(engines.every((url) => new URL(url).origin === origin));
	assert.equal(
		await page.evaluate(() => window.__ffmpegWorkers.at(-1).terminated),
		true,
	);
	await page.locator(".pixel-clear").click();
	await page.evaluate(() => {
		window.__holdFFmpeg = true;
	});
	await page.locator("input[type=file]:enabled").first().setInputFiles({
		name: "cancel-load.wav",
		mimeType: "audio/wav",
		buffer: wave,
	});
	await row.locator(".pixel-square").click();
	await page.waitForFunction(() => window.__ffmpegWorkers.at(-1)?.held);
	await row.locator(".pixel-square").click();
	await page.waitForFunction(
		() =>
			document.querySelector(".compact-file")?.dataset.state ===
			"cancelled",
	);
	assert.equal(
		await page.evaluate(() => window.__ffmpegWorkers.at(-1).terminated),
		true,
	);
	await page.evaluate(() => {
		window.__holdFFmpeg = false;
	});
	if (process.env.IIPE_EXPECT_NO_EXTERNAL === "true") {
		for (const path of ["/about/", "/acknowledgements/", "/privacy/"]) {
			await page.goto(base + path, { waitUntil: "networkidle" });
		}
	}
	assert.deepEqual(external, []);
	assert.deepEqual(errors, []);
	console.log(
		JSON.stringify(
			{
				localAudioConversion: true,
				loadFailureRetryAndCleanup: true,
				cancelDuringLoad: true,
				bytes: bytes.length,
				engineRequests: engines,
				externalRequests: external,
				pageErrors: errors,
			},
			null,
			2,
		),
	);
} finally {
	await browser.close();
}
