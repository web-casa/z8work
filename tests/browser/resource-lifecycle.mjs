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
const checks = [];
try {
	const page = await browser.newPage();
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.addInitScript(() => {
		localStorage.setItem("locale", "en");
		window.__urls = [];
		const create = URL.createObjectURL.bind(URL);
		const revoke = URL.revokeObjectURL.bind(URL);
		URL.createObjectURL = (blob) => {
			const url = create(blob);
			window.__urls.push({
				url,
				name: blob instanceof File ? blob.name : null,
				type: blob.type,
				size: blob.size,
				revoked: false,
			});
			return url;
		};
		URL.revokeObjectURL = (url) => {
			const record = window.__urls.find((item) => item.url === url);
			if (record) record.revoked = true;
			return revoke(url);
		};
		const context = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (...args) {
			if (window.__noCanvas) return null;
			return context.apply(this, args);
		};
		const descriptor = Object.getOwnPropertyDescriptor(
			HTMLImageElement.prototype,
			"src",
		);
		Object.defineProperty(HTMLImageElement.prototype, "src", {
			...descriptor,
			set(value) {
				if (window.__stallThumbnail && value.startsWith("blob:"))
					return;
				descriptor.set.call(this, value);
			},
		});
		const timeout = window.setTimeout;
		window.setTimeout = (callback, milliseconds, ...args) =>
			timeout(
				callback,
				window.__shortThumbnailTimeout && milliseconds === 15000
					? 30
					: milliseconds,
				...args,
			);
	});
	await page.goto(process.env.IIPE_TEST_BASE || "http://localhost:5174", {
		waitUntil: "load",
	});
	const png = await readFile(
		new URL("../fixtures/cover.png", import.meta.url),
	);
	const mp3 = await readFile(
		new URL("../fixtures/cover.mp3", import.meta.url),
	);
	const add = async (name, buffer, mimeType) => {
		await page
			.locator("input[type=file]:enabled")
			.first()
			.setInputFiles({ name, buffer, mimeType });
		await page.locator(".compact-file").first().waitFor();
	};
	const clear = async () => {
		await page.locator(".pixel-clear").click();
		await page.waitForFunction(
			() => document.querySelectorAll(".compact-file").length === 0,
		);
	};
	const revoked = async (name) => {
		await page.waitForFunction(
			(name) =>
				window.__urls.some(
					(item) => item.name === name && item.revoked,
				),
			name,
		);
	};
	await add("normal.png", png, "image/png");
	await page.waitForFunction(() =>
		document.querySelector(".file-thumbnail img")?.src.startsWith("data:"),
	);
	await revoked("normal.png");
	await clear();
	checks.push("image source URL released after rendering");

	for (const [name, buffer, noCanvas] of [
		["invalid.png", Buffer.from("invalid"), false],
		["no-canvas.png", png, true],
	]) {
		await page.evaluate((value) => {
			window.__noCanvas = value;
		}, noCanvas);
		await add(name, buffer, "image/png");
		await revoked(name);
		await clear();
	}
	await page.evaluate(() => {
		window.__noCanvas = false;
	});
	checks.push("decode failure and missing canvas release their URL");
	const generated = await page.evaluate(() => {
		const canvas = document.createElement("canvas");
		canvas.width = 5000;
		canvas.height = 5;
		const transparent = canvas.toDataURL();
		canvas.getContext("2d").fillRect(0, 0, 5000, 5);
		return { transparent, panorama: canvas.toDataURL() };
	});
	await add(
		"transparent.png",
		Buffer.from(generated.transparent.split(",")[1], "base64"),
		"image/png",
	);
	await revoked("transparent.png");
	assert.equal(await page.locator(".file-thumbnail img").count(), 0);
	await clear();
	await add(
		"panorama.png",
		Buffer.from(generated.panorama.split(",")[1], "base64"),
		"image/png",
	);
	await page.waitForFunction(
		() => document.querySelector(".file-thumbnail img")?.naturalWidth > 0,
	);
	assert.deepEqual(
		await page
			.locator(".file-thumbnail img")
			.evaluate((image) => [image.naturalWidth, image.naturalHeight]),
		[180, 1],
	);
	await clear();
	checks.push("transparent image and extreme aspect ratio remain bounded");

	await page.evaluate(() => {
		window.__stallThumbnail = true;
	});
	await add("cancelled.png", png, "image/png");
	await page.waitForFunction(() =>
		window.__urls.some((item) => item.name === "cancelled.png"),
	);
	await page.locator(".file-remove").click();
	await revoked("cancelled.png");
	await page.evaluate(() => {
		window.__shortThumbnailTimeout = true;
	});
	await add("timed-out.png", png, "image/png");
	await revoked("timed-out.png");
	await clear();
	await page.evaluate(() => {
		window.__stallThumbnail = false;
		window.__shortThumbnailTimeout = false;
	});
	checks.push("removal and timeout release stalled media");

	for (const mode of ["remove", "clear"]) {
		await add(`${mode}.mp3`, mp3, "audio/mpeg");
		await page.waitForFunction(
			() =>
				document.querySelector(".file-thumbnail img")?.naturalWidth ===
				32,
		);
		const url = await page
			.locator(".file-thumbnail img")
			.getAttribute("src");
		const before = await page.evaluate(
			(url) => window.__urls.find((item) => item.url === url),
			url,
		);
		assert.equal(
			before.size,
			png.length,
			"Cover must exclude surrounding ID3 bytes",
		);
		assert.equal(before.revoked, false);
		if (mode === "remove") await page.locator(".file-remove").click();
		else await clear();
		assert.equal(
			await page.evaluate(
				(url) => window.__urls.find((item) => item.url === url).revoked,
				url,
			),
			true,
		);
	}
	checks.push("audio cover decodes correctly and releases on remove/clear");

	await page.evaluate(() => {
		const slice = File.prototype.slice;
		const read = Blob.prototype.arrayBuffer;
		const gate = new Promise((resolve) => {
			window.__releaseCover = resolve;
		});
		window.__coverReads = 0;
		File.prototype.slice = function (...args) {
			const blob = slice.apply(this, args);
			if (this.name === "late.mp3")
				blob.arrayBuffer = async () => {
					window.__coverReads++;
					await gate;
					return read.call(blob);
				};
			return blob;
		};
	});
	await add("late.mp3", mp3, "audio/mpeg");
	await page.waitForFunction(() => window.__coverReads > 0);
	await page.locator(".file-remove").click();
	const count = await page.evaluate(() => window.__urls.length);
	await page.evaluate(() => window.__releaseCover());
	// Let the already-started metadata parser finish; it cannot be synchronously aborted.
	await page.waitForTimeout(200);
	assert.equal(await page.evaluate(() => window.__urls.length), count);
	assert.equal(await page.locator(".compact-file").count(), 0);
	checks.push("late audio parsing does not create an orphan URL");

	await add(
		"thumbnail.webm",
		await readFile(new URL("../fixtures/thumbnail.webm", import.meta.url)),
		"video/webm",
	);
	await revoked("thumbnail.webm");
	// A browser without a usable decoded video frame may show the format icon.
	// Both that fallback and a rendered preview must release the source URL.
	const videoPreview = await page.locator(".file-thumbnail img").count();
	if (videoPreview)
		assert.equal(
			await page
				.locator(".file-thumbnail img")
				.evaluate((image) => image.naturalWidth),
			32,
		);
	await clear();
	checks.push(
		`video source URL released (${videoPreview ? "preview" : "format icon fallback"})`,
	);
	await page.evaluate(() => {
		window.__noCanvas = true;
	});
	await add(
		"canvas-failure.svg",
		Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>',
		),
		"image/svg+xml",
	);
	await revoked("canvas-failure.svg");
	const svgRow = page.locator(".compact-file");
	await svgRow.locator(".pixel-file-format button").first().click();
	const svgDialog = page.locator("dialog[open]");
	await svgDialog.locator("input").fill(".png");
	await svgDialog.getByRole("button", { name: ".png", exact: true }).click();
	await svgRow.locator(".pixel-square").click();
	await page.waitForFunction(
		() =>
			document.querySelector(".compact-file")?.dataset.state === "failed",
	);
	assert.equal(
		await page.evaluate(
			() =>
				window.__urls.filter(
					(item) => item.type === "image/svg+xml" && !item.revoked,
				).length,
		),
		0,
	);
	await page.evaluate(() => {
		window.__noCanvas = false;
	});
	await svgRow.locator(".pixel-square").click();
	await page.waitForFunction(
		() =>
			document.querySelector(".compact-file")?.dataset.state ===
			"complete",
	);
	await clear();
	checks.push(
		"SVG canvas setup failure and successful retry leave no source URL",
	);
	assert.equal(
		await page.evaluate(
			() =>
				window.__urls.filter(
					(item) =>
						!item.revoked &&
						["image/png", "image/svg+xml", "video/webm"].includes(
							item.type,
						),
				).length,
		),
		0,
	);
	assert.deepEqual(errors, []);
	console.log(JSON.stringify({ checks, pageErrors: errors }, null, 2));
} finally {
	await browser.close();
}
