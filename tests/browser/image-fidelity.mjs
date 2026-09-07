import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
	initializeImageMagick,
	MagickImage,
	MagickReadSettings,
	MagickFormat,
	ColorProfile,
	ColorSpace,
	Orientation,
} from "@imagemagick/magick-wasm";

const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE || "playwright",
);
const base = process.env.IIPE_TEST_BASE || "http://localhost:5174";
const output = process.env.IIPE_TEST_OUTPUT || "/tmp/iipe-image-fidelity";
await mkdir(output, { recursive: true });
await initializeImageMagick(
	await readFile(
		new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")),
	),
);
const write = (image, format) =>
	image.write(format, (bytes) => new Uint8Array(bytes));
const rgba = (image) =>
	image.getPixels(
		(p) =>
			new Uint8Array(
				p.toByteArray(0, 0, image.width, image.height, "RGBA"),
			),
	);
const pixels = Uint8Array.from(
	Array.from({ length: 48 * 32 }, (_, i) => [
		255,
		0,
		0,
		i % 48 < 16 ? 0 : i % 48 < 32 ? 128 : 255,
	]).flat(),
);
const src = MagickImage.create(
	pixels,
	new MagickReadSettings({
		format: MagickFormat.Rgba,
		width: 48,
		height: 32,
	}),
);
const transparent = write(src, MagickFormat.Png);
src.dispose();
const portrait = MagickImage.create(transparent);
// The source fixture itself must be a valid 8-bit TIFF, not a write using
// the PNG palette-index depth (that separate bug is covered above).
portrait.depth = 8;
portrait.orientation = Orientation.RightTop;
const oriented = write(portrait, MagickFormat.Tiff);
portrait.autoOrient();
const orientedPixels = rgba(portrait);
portrait.dispose();
const p3Bytes = new Uint8Array(
	await readFile(new URL("../fixtures/display-p3.icc", import.meta.url)),
);
const p3 = MagickImage.create(
	Uint8Array.from(
		Array.from({ length: 48 * 32 }, (_, i) => [
			100 + (i % 48),
			140 + Math.floor(i / 48),
			80,
			255,
		]).flat(),
	),
	new MagickReadSettings({
		format: MagickFormat.Rgba,
		width: 48,
		height: 32,
	}),
);
p3.setProfile(new ColorProfile(p3Bytes));
const p3Png = write(p3, MagickFormat.Png),
	p3Pixels = rgba(p3);
p3.dispose();
const cases = [
	...[".tiff", ".psd", ".webp"].map((to) => ({
		name: "透明索引.png",
		bytes: transparent,
		to,
		pixels,
		width: 48,
		height: 32,
	})),
	{
		name: "方向.tiff",
		bytes: oriented,
		to: ".webp",
		pixels: orientedPixels,
		width: 32,
		height: 48,
	},
	{
		name: "广色域.png",
		bytes: p3Png,
		to: ".png",
		visual: true,
		width: 48,
		height: 32,
	},
	{
		name: "保留色彩.png",
		bytes: p3Png,
		to: ".png",
		keep: true,
		profile: p3Bytes,
		pixels: p3Pixels,
		width: 48,
		height: 32,
	},
	{
		name: "透明转白底.png",
		bytes: transparent,
		to: ".jpeg",
		white: true,
		width: 48,
		height: 32,
	},
];
for (const colorSpace of [ColorSpace.CMYK, ColorSpace.Lab]) {
	const image = MagickImage.create(transparent);
	try {
		// Expand the PNG palette depth before creating a valid TIFF fixture.
		image.depth = 8;
		image.colorSpace = colorSpace;
		cases.push({
			name: `${colorSpace}-透明.tiff`,
			bytes: write(image, MagickFormat.Tiff),
			to: ".jpeg",
			keep: true,
			white: true,
			samples:
				colorSpace === ColorSpace.Lab
					? [[8, [255, 255, 255]]]
					: undefined,
			width: 48,
			height: 32,
		});
	} finally {
		image.dispose();
	}
}
for (const depth of [1, 2, 4]) {
	const width = 256,
		height = 128,
		levels = 2 ** depth;
	const grayscale = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		const value = ((i % levels) * 255) / (levels - 1);
		grayscale.set([value, value, value, 255], i * 4);
	}
	const image = MagickImage.create(
		grayscale,
		new MagickReadSettings({ format: MagickFormat.Rgba, width, height }),
	);
	try {
		image.depth = depth;
		cases.push({
			name: `${depth}位灰度.png`,
			bytes: write(image, MagickFormat.Png),
			to: depth === 2 ? ".tif" : ".tiff",
			keep: depth === 2,
			pixels: grayscale,
			depth,
			width,
			height,
		});
	} finally {
		image.dispose();
	}
}
const report = { base, cases: [], pageErrors: [], nonReadRequests: [] };
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
try {
	const context = await browser.newContext({
		viewport: { width: 1100, height: 900 },
		acceptDownloads: true,
	});
	context.on("request", (r) => {
		if (!["GET", "HEAD"].includes(r.method()))
			report.nonReadRequests.push(r.url());
	});
	const page = await context.newPage();
	page.on("pageerror", (e) => report.pageErrors.push(e.message));
	await page.addInitScript(() => localStorage.setItem("locale", "zh-Hans"));
	await page.goto(base.replace(/\/$/, "") + "/zh-Hans/", {
		waitUntil: "load",
	});
	for (const item of cases) {
		console.log("Checking", item.name, item.to);
		await page.evaluate(
			(metadata) =>
				localStorage.setItem(
					"settings",
					JSON.stringify({
						magickQualityMode: "custom",
						magickQuality: 100,
						metadata,
					}),
				),
			!!item.keep,
		);
		await page.reload({ waitUntil: "load" });
		await page
			.locator("input[type=file]:enabled")
			.first()
			.setInputFiles({
				name: item.name,
				mimeType: item.name.endsWith(".tiff")
					? "image/tiff"
					: "image/png",
				buffer: Buffer.from(item.bytes),
			});
		const row = page.locator(".compact-file");
		await row.locator(".pixel-file-format button").first().click();
		const dialog = page.locator("dialog[open]");
		await dialog.locator("input").fill(item.to);
		await dialog
			.getByRole("button", { name: item.to, exact: true })
			.click();
		await page.locator(".pixel-convert").click();
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
		const event = page.waitForEvent("download");
		await row.locator(".pixel-square").click();
		const file = await event;
		assert.equal(
			file.suggestedFilename(),
			`Z8.Work_${item.name.replace(/\.[^.]+$/, "")}${item.to}`,
		);
		const bytes = await readFile(await file.path());
		const decoded = MagickImage.create(bytes);
		const record = {
			name: item.name,
			to: item.to,
			keepMetadata: !!item.keep,
			bytes: bytes.length,
			depth: decoded.depth,
		};
		try {
			assert.deepEqual(
				[decoded.width, decoded.height],
				[item.width, item.height],
			);
			if (item.pixels) assert.deepEqual(rgba(decoded), item.pixels);
			if (item.depth) assert.equal(decoded.depth, item.depth);
			if (item.profile)
				assert.deepEqual(decoded.getColorProfile()?.data, item.profile);
			if (item.visual) {
				assert.equal(decoded.getColorProfile(), null);
				const error = await page.evaluate(
					async ({ before, after }) => {
						const render = async (bytes) => {
							const image = await createImageBitmap(
								new Blob([new Uint8Array(bytes)], {
									type: "image/png",
								}),
							);
							const canvas = document.createElement("canvas");
							canvas.width = image.width;
							canvas.height = image.height;
							const ctx = canvas.getContext("2d", {
								colorSpace: "srgb",
							});
							ctx.drawImage(image, 0, 0);
							image.close();
							return ctx.getImageData(
								0,
								0,
								canvas.width,
								canvas.height,
							).data;
						};
						const original = await render(before),
							converted = await render(after);
						let maximum = 0,
							sum = 0;
						for (let i = 0; i < original.length; i++) {
							const delta = Math.abs(original[i] - converted[i]);
							maximum = Math.max(maximum, delta);
							sum += delta;
						}
						return { maximum, mean: sum / original.length };
					},
					{ before: [...item.bytes], after: [...bytes] },
				);
				record.browserColorError = error;
				assert.ok(
					error.maximum <= 2 && error.mean < 0.5,
					JSON.stringify(error),
				);
			}
			if (item.white) {
				decoded.colorSpace = ColorSpace.sRGB;
				for (const [x, expected] of item.samples ?? [
					[8, [255, 255, 255]],
					[24, [255, 127, 127]],
					[40, [255, 0, 0]],
				]) {
					const actual = decoded.getPixels((p) =>
						p.toByteArray(x, 16, 1, 1, "RGB"),
					);
					assert.ok(
						actual.every(
							(value, i) => Math.abs(value - expected[i]) <= 2,
						),
					);
				}
				assert.match(await row.textContent(), /半透明边缘会与白色混合/);
			}
		} finally {
			decoded.dispose();
		}
		report.cases.push(record);
	}
	await page.locator(".image-quality-control summary").click();
	assert.match(
		await page.locator(".image-quality-control").textContent(),
		/8 位通道处理/,
	);
	for (const width of [390, 1100]) {
		await page.setViewportSize({ width, height: 900 });
		await page.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(resolve)),
				),
		);
		assert.ok(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth + 1,
			),
		);
		await page.screenshot({
			path: `${output}/image-notes-${width}.png`,
			fullPage: true,
		});
	}
	assert.deepEqual(report.pageErrors, []);
	assert.deepEqual(report.nonReadRequests, []);
	await writeFile(
		`${output}/results.json`,
		JSON.stringify(report, null, 2) + "\n",
	);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser.close();
}
