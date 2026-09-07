import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pdfFixture } from "../helpers-pdf-fixture.mjs";
import { moduleUrl } from "../helpers-load-ts.mjs";

const { PDF_FORMATS } = await import(
	await moduleUrl(
		new URL("../../src/lib/util/pdf-options.ts", import.meta.url),
	)
);
const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE || "playwright",
);
const base = process.env.IIPE_TEST_BASE || "http://localhost:5174";
const output = process.env.IIPE_TEST_OUTPUT || "/tmp/z8-format-choices";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
const report = { checks: [], layouts: [], pageErrors: [] };
try {
	const page = await browser.newPage({
		viewport: { width: 1366, height: 768 },
	});
	page.on("pageerror", (error) => report.pageErrors.push(error.message));
	await page.addInitScript(() => {
		if (!localStorage.getItem("locale"))
			localStorage.setItem("locale", "en");
		localStorage.setItem("effects", "false");
		localStorage.setItem("maxArrayBufferSize", "2145386496");
	});
	await page.goto(base);
	const add = async (name, buffer) => {
		await page.locator("input[type=file]:enabled").first().setInputFiles({
			name,
			mimeType: "application/octet-stream",
			buffer,
		});
		await page.locator(".compact-file").first().waitFor();
	};
	const clear = async () => {
		await page.locator(".pixel-clear").click();
		await page.locator(".compact-file").waitFor({ state: "detached" });
	};
	const trigger = page.locator(
		".pixel-batch-format .pixel-format-selector > button",
	);
	const dialog = page.locator("dialog[open]");
	const formats = () =>
		dialog
			.locator(".format-options button")
			.evaluateAll((elements) =>
				elements.map((el) => el.getAttribute("aria-label")),
			);
	const close = async () => {
		await page.keyboard.press("Escape");
		await page.waitForFunction(
			() => !document.querySelector("dialog[open]"),
		);
		assert.ok(
			await trigger.evaluate((el) => document.activeElement === el),
		);
	};
	await add("choices.pdf", Buffer.from(pdfFixture()));
	await trigger.click();
	assert.deepEqual(await formats(), [
		".jpeg",
		".png",
		".webp",
		".avif",
		".gif",
		".tiff",
	]);
	assert.equal(
		await dialog.locator(".format-expand").getAttribute("aria-expanded"),
		"false",
	);
	assert.equal(await dialog.locator(".format-options small").count(), 6);
	assert.equal(
		await dialog.locator(".format-count").innerText(),
		`Showing 6 of ${PDF_FORMATS.length} formats`,
	);
	const beforeTarget = await trigger.innerText();
	await dialog.locator(".format-expand").press("Enter");
	assert.deepEqual((await formats()).sort(), [...PDF_FORMATS].sort());
	const linksValid = await dialog
		.locator(".format-options button[aria-describedby]")
		.evaluateAll((elements) =>
			elements.every((el) =>
				document
					.getElementById(el.getAttribute("aria-describedby"))
					?.textContent.trim(),
			),
		);
	assert.ok(
		linksValid,
		"Purpose text is connected to the accessible option description",
	);
	await dialog.locator(".format-expand").press("Enter");
	assert.equal(await dialog.locator(".format-options button").count(), 6);
	assert.ok(
		await dialog
			.locator(".format-expand")
			.evaluate((el) => document.activeElement === el),
	);
	assert.equal(
		await trigger.innerText(),
		beforeTarget,
		"Expanding must not change the target",
	);
	report.checks.push(
		"common choices have descriptions; expansion exposes all 23 PDF outputs without duplicates or target changes; collapsing retains focus",
	);
	for (const query of [".JPG", "jpg", "  .JpG  "]) {
		await dialog.locator("input").fill(query);
		assert.deepEqual(await formats(), [".jpg"]);
	}
	for (const query of ["heic", "pdf", "mp3", "does-not-exist"]) {
		await dialog.locator("input").fill(query);
		assert.deepEqual(await formats(), []);
	}
	await dialog.locator("input").fill(" . ");
	assert.equal(await dialog.locator(".format-categories").count(), 1);
	assert.equal((await formats()).length, 6);
	await dialog.locator("input").fill("qoi");
	await dialog.locator("input").press("Enter");
	assert.match(await trigger.innerText(), /QOI/);
	await trigger.click();
	assert.equal(
		await dialog.locator(".format-expand").getAttribute("aria-expanded"),
		"true",
	);
	assert.equal(
		await dialog
			.getByRole("button", { name: ".qoi", exact: true })
			.getAttribute("aria-pressed"),
		"true",
	);
	await close();
	report.checks.push(
		"search covers collapsed aliases and uncommon outputs, normalizes dots/case/whitespace and rejects illegal outputs; reopening preserves uncommon selection",
	);
	await trigger.click();
	await dialog.locator("input").fill(".jpg");
	await dialog.getByRole("button", { name: ".jpg", exact: true }).click();
	await trigger.click();
	assert.equal(
		await dialog.locator(".format-expand").getAttribute("aria-expanded"),
		"false",
	);
	assert.equal(
		(await formats())[0],
		".jpg",
		"Selected aliases stay visible without expanding all formats",
	);
	await dialog.locator("input").fill(".jpeg");
	assert.deepEqual(
		await formats(),
		[".jpeg"],
		"The other alias remains independently searchable",
	);
	await close();
	// A mixed image/PDF queue retains the existing per-file capability boundaries.
	await add(
		"pixel.png",
		await readFile(new URL("../fixtures/cover.png", import.meta.url)),
	);
	assert.equal(await page.locator(".pixel-batch-format").count(), 0);
	await page
		.locator(".compact-file")
		.last()
		.locator(".pixel-file-format button")
		.first()
		.click();
	assert.equal(
		await dialog.locator(".format-expand").getAttribute("aria-expanded"),
		"false",
		"Default JPEG output stays in the common group",
	);
	await page.setViewportSize({ width: 390, height: 640 });
	await page
		.locator(".compact-file")
		.last()
		.locator(".pixel-file-format button")
		.first()
		.click();
	await dialog.locator(".format-expand").click();
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			),
	);
	await dialog.locator(".format-options button").last().focus();
	assert.ok(
		await dialog
			.locator(".format-results")
			.evaluate((el) => el.scrollTop > 0),
	);
	await dialog.locator("input").fill("p");
	assert.equal(
		await dialog.locator(".format-results").evaluate((el) => el.scrollTop),
		0,
		"New queries reveal the first match after scrolling a long list",
	);
	await dialog.locator("input").fill("png");
	assert.equal(
		(await formats())[0],
		".png",
		"Exact matches precede PNG variants",
	);
	await page.keyboard.press("Escape");
	await clear();
	for (const [name, bytes, expected, absent] of [
		[
			"audio.mp3",
			await readFile(new URL("../fixtures/cover.mp3", import.meta.url)),
			[".mp3", ".wav", ".flac", ".m4a", ".ogg", ".opus"],
			"gif",
		],
		[
			"notes.md",
			Buffer.from("# Local document\n\nHello."),
			[".docx", ".odt", ".md", ".html", ".epub"],
			"pdf",
		],
	]) {
		await add(name, bytes);
		await trigger.click();
		assert.deepEqual(await formats(), expected);
		await dialog.locator("input").fill(absent);
		assert.deepEqual(await formats(), []);
		await close();
		await clear();
	}
	report.checks.push(
		"image/PDF batch restrictions, PNG exact-match ordering, audio/document common choices and unsupported output exclusions remain intact",
	);
	await add("layout.pdf", Buffer.from(pdfFixture()));
	for (const locale of ["en", "es", "zh-Hans", "zh-Hant", "de"]) {
		await page.locator("#header-language").selectOption(locale);
		await page.waitForFunction(
			(value) => document.documentElement.lang === value,
			locale,
		);
		for (const theme of ["light", "dark"]) {
			if (
				!(await page.locator("html").getAttribute("class"))
					.split(" ")
					.includes(theme)
			)
				await page.locator(".pixel-theme-toggle").click();
			for (const [width, height] of [
				[320, 640],
				[390, 844],
				[800, 600],
				[801, 600],
				[1366, 768],
				[844, 390],
			]) {
				await page.setViewportSize({ width, height });
				await trigger.click();
				await page.waitForFunction(
					() => document.querySelector("dialog[open]")?.style.top,
				);
				assert.ok(
					await page.evaluate(
						(mobile) =>
							mobile
								? document.activeElement ===
									document.querySelector(
										"dialog[open] header button",
									)
								: document.activeElement ===
									document.querySelector(
										"dialog[open] input",
									),
						width <= 800,
					),
				);
				const checkBounds = async () => {
					// The menu repositions through ResizeObserver after a size change.
					await page.evaluate(
						() =>
							new Promise((resolve) =>
								requestAnimationFrame(() =>
									requestAnimationFrame(resolve),
								),
							),
					);
					const bounds = await dialog.evaluate((el) => {
						const rect = el.getBoundingClientRect();
						return {
							left: rect.left,
							right: rect.right,
							top: rect.top,
							bottom: rect.bottom,
							overflow: el.scrollWidth - el.clientWidth,
						};
					});
					assert.ok(
						bounds.left >= 0 &&
							bounds.right <= width + 1 &&
							bounds.top >= 0 &&
							bounds.bottom <= height + 1 &&
							bounds.overflow <= 1,
						JSON.stringify({
							locale,
							theme,
							width,
							height,
							bounds,
						}),
					);
				};
				await checkBounds();
				await dialog.locator(".format-expand").click();
				await dialog.locator(".format-options button").last().focus();
				await checkBounds();
				for (const control of ["header button", "input"]) {
					const box = await dialog.locator(control).boundingBox();
					assert.ok(
						box.y >= 0 && box.y + box.height <= height,
						"Search and close stay visible while results scroll",
					);
				}
				for (let i = 0; i < 4; i++) {
					await page.keyboard.press("Tab");
					assert.ok(
						await page.evaluate(
							() =>
								!!document.activeElement?.closest(
									"dialog[open]",
								),
						),
					);
				}
				const ids = await dialog
					.locator("[id]")
					.evaluateAll((elements) => elements.map((el) => el.id));
				assert.equal(new Set(ids).size, ids.length);
				if (
					locale === "zh-Hans" &&
					theme === "light" &&
					[390, 1366].includes(width)
				) {
					await dialog.locator(".format-expand").click();
					await page.screenshot({
						path: `${output}/common-${width}.png`,
						animations: "disabled",
					});
				}
				await close();
				report.layouts.push({ locale, theme, width, height });
			}
		}
	}
	assert.deepEqual(report.pageErrors, []);
	await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser.close();
}
