// Run against a local dev or preview server. See docs/ux-optimization/IMPLEMENTATION.md.
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.IIPE_TEST_BASE || "http://localhost:5174";
const output = process.env.IIPE_TEST_OUTPUT || "/tmp/iipe-workspace-validation";
await mkdir(output, { recursive: true });
const fixture = (name) =>
	fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const heic = await readFile(fixture("gradient-8bit.heic"));
const input = (name, buffer = heic) => ({
	name,
	mimeType: "application/octet-stream",
	buffer,
});
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
const report = {
	base,
	checks: [],
	layouts: [],
	pageErrors: [],
	nonReadRequests: [],
};
try {
	const context = await browser.newContext({
		viewport: { width: 1366, height: 768 },
		acceptDownloads: true,
	});
	await context.addInitScript(() => {
		if (!localStorage.getItem("locale"))
			localStorage.setItem("locale", "zh-Hans");
		localStorage.setItem("effects", "false");
		localStorage.setItem("maxArrayBufferSize", "2145386496");
		if (!localStorage.getItem("settings"))
			localStorage.setItem(
				"settings",
				JSON.stringify({ filenameFormat: "ii.Pe_%name%" }),
			);
		window.__jobs = [];
		window.__stall = false;
		window.__downloadError = false;
		const WorkerClass = window.Worker;
		window.Worker = class extends WorkerClass {
			postMessage(message, ...args) {
				if (message.type === "convert" && "compression" in message) {
					window.__jobs.push(message.input.name);
					if (window.__stall) return;
				}
				return super.postMessage(message, ...args);
			}
		};
		const create = URL.createObjectURL;
		URL.createObjectURL = function (blob) {
			if (
				window.__downloadError &&
				blob.type === "application/octet-stream"
			)
				throw new Error("Simulated download preparation failure");
			return create.call(this, blob);
		};
	});
	const page = await context.newPage();
	page.on("pageerror", (e) => report.pageErrors.push(e.message));
	page.on("request", (r) => {
		if (!["GET", "HEAD"].includes(r.method()))
			report.nonReadRequests.push(r.url());
	});
	await page.goto(base, { waitUntil: "load" });
	await page.waitForFunction(
		() => document.documentElement.lang === "zh-Hans",
	);
	const upload = async (data) => {
		// Wait for browser preferences to be applied by layout onMount, including
		// after a full navigation. SSR markup alone has no file-change handler yet.
		await page.waitForFunction(
			() =>
				document.documentElement.lang ===
					localStorage.getItem("locale") &&
				document.documentElement.classList.contains(
					localStorage.getItem("theme") || "light",
				),
		);
		await page
			.locator('input[type="file"]:enabled')
			.first()
			.setInputFiles(data);
		await page.locator(".compact-file").first().waitFor();
	};
	const clear = async () => {
		await page.locator(".pixel-clear").press("Enter");
		await page.locator(".compact-file").waitFor({ state: "detached" });
		await page.waitForFunction(() =>
			document.activeElement?.matches(".pixel-empty-state .pixel-add"),
		);
	};
	const choose = async (format, row) => {
		await (row || page.locator(".pixel-batch-format"))
			.locator(".pixel-format-selector > button")
			.click();
		const dialog = page.locator("dialog[open]");
		await dialog.locator("input").fill(format);
		await dialog
			.getByRole("button", { name: `.${format}`, exact: true })
			.press("Enter");
	};
	const settled = async (complete, failed = 0, cancelled = 0) => {
		await page.waitForFunction(
			({ complete, failed, cancelled }) =>
				document.querySelectorAll('[data-state="complete"]').length ===
					complete &&
				document.querySelectorAll('[data-state="failed"]').length ===
					failed &&
				document.querySelectorAll('[data-state="cancelled"]').length ===
					cancelled &&
				!document.querySelector(
					'[data-state="processing"], [data-state="queued"]',
				),
			{ complete, failed, cancelled },
			{ timeout: 60000 },
		);
	};
	const download = async (locator) => {
		const pending = page.waitForEvent("download");
		await locator.press("Enter");
		const value = await pending;
		return {
			name: value.suggestedFilename(),
			bytes: await readFile(await value.path()),
		};
	};
	// Partial failure: retry only the failed file, leave completed bytes available.
	await upload([
		input("good.heic"),
		input("broken.heic", Buffer.from([0, 1, 2])),
	]);
	await choose("png");
	await page.locator(".pixel-convert").click();
	await settled(1, 1);
	const before = await page.evaluate(() => window.__jobs.length);
	assert.match(await page.locator(".pixel-convert").innerText(), /重试 1/);
	const single = await download(page.locator(".workspace-partial"));
	assert.equal(single.name, "Z8.Work_good.png");
	assert.equal(
		await page.evaluate(
			() => JSON.parse(localStorage.getItem("settings")).filenameFormat,
		),
		"Z8.Work_%name%",
	);
	assert.deepEqual(
		[...single.bytes.subarray(0, 8)],
		[137, 80, 78, 71, 13, 10, 26, 10],
	);
	await page.locator(".pixel-convert").click();
	await settled(1, 1);
	assert.deepEqual(
		await page.evaluate((n) => window.__jobs.slice(n), before),
		["broken.heic"],
	);
	report.checks.push(
		"partial failure retry preserves success; one completed result downloads PNG directly",
	);
	// Re-selecting a target is a no-op; changing it resets only that row.
	const successful = page.locator('[data-state="complete"]');
	await choose("png", successful);
	assert.equal(await successful.count(), 1);
	await choose("webp", successful);
	assert.equal(await page.locator('[data-state="pending"]').count(), 1);
	assert.equal(await page.locator('[data-state="failed"]').count(), 1);
	await page.locator(".pixel-convert").click();
	await settled(1, 1);
	assert.equal(
		(await download(page.locator(".workspace-partial"))).name,
		"Z8.Work_good.webp",
	);
	report.checks.push(
		"unchanged target keeps result; changed target clears only affected result; pending precedes failed retry",
	);
	await clear();
	// A blocked input cannot prevent a valid conversion.
	await upload([input("good.heic"), input("unknown.no_such_format")]);
	assert.equal(await page.locator(".pixel-batch-format").count(), 0);
	await choose("png", page.locator(".compact-file").first());
	assert.match(await page.locator(".pixel-convert").innerText(), /转换 1/);
	await page.locator(".pixel-convert").click();
	await settled(1);
	assert.match(await page.locator(".pixel-convert").innerText(), /下载 PNG/);
	assert.match(
		await page.locator(".pixel-footer-status").innerText(),
		/1.*暂不可转换/,
	);
	report.checks.push(
		"blocked input does not block valid files; footer reports partial and blocked state",
	);
	await clear();
	// Cancel an active worker, then resume only that file.
	await upload(input("finished.heic"));
	await choose("png");
	await page.locator(".pixel-convert").click();
	await settled(1);
	await upload(input("cancelled.heic"));
	await page.evaluate(() => (window.__stall = true));
	await page.locator(".pixel-convert").click();
	await page.waitForFunction(() => window.__jobs.at(-1) === "cancelled.heic");
	await page.locator('[data-state="processing"] .pixel-square').click();
	await settled(1, 0, 1);
	const cancelledAt = await page.evaluate(() => window.__jobs.length);
	await page.evaluate(() => (window.__stall = false));
	assert.match(await page.locator(".pixel-convert").innerText(), /继续 1/);
	await page.locator(".pixel-convert").click();
	await settled(2);
	assert.deepEqual(
		await page.evaluate((n) => window.__jobs.slice(n), cancelledAt),
		["cancelled.heic"],
	);
	report.checks.push(
		"cancelled worker settles; resume converts only cancelled file",
	);
	// Download errors leave conversion state untouched, and allow another attempt.
	await page.evaluate(() => (window.__downloadError = true));
	await page.locator(".pixel-convert").click();
	await page
		.getByText(/准备下载失败/)
		.first()
		.waitFor();
	assert.equal(await page.locator('[data-state="complete"]').count(), 2);
	assert.equal(await page.locator(".pixel-convert").isEnabled(), true);
	await page.evaluate(() => (window.__downloadError = false));
	const batch = await download(page.locator(".pixel-convert"));
	assert.deepEqual(Object.keys(unzipSync(batch.bytes)).sort(), [
		"cancelled.png",
		"finished.png",
	]);
	report.checks.push(
		"ZIP content and naming verified; download error preserves results and releases lock",
	);
	await clear();
	// An actual ZIP result must not be wrapped in another ZIP.
	await upload(fixture("multi.ico"));
	await choose("png");
	await page.locator(".pixel-convert").click();
	await settled(1);
	assert.match(await page.locator(".pixel-convert").innerText(), /下载 ZIP/);
	const ico = await download(page.locator(".pixel-convert"));
	assert.ok(ico.name.endsWith(".zip"));
	assert.equal(Object.keys(unzipSync(ico.bytes)).length, 2);
	assert.ok(
		Object.keys(unzipSync(ico.bytes)).every((name) =>
			name.endsWith(".png"),
		),
	);
	report.checks.push(
		"ICO result displays ZIP and downloads its two PNG entries without another wrapper",
	);
	await clear();
	// Close notifications via their real controls before taking layout evidence.
	while (await page.locator(".toast-close").count()) {
		await page.locator(".toast-close").first().press("Enter");
		await page.waitForTimeout(100);
	}
	// Compact rows, long names, one mobile control set, focus and viewport boundaries.
	const long =
		"共同前缀📸中文" + "abcdefghijklmnop".repeat(12) + "<script>.heic";
	await upload([
		input("first.heic"),
		input("second.heic"),
		input("third.heic"),
	]);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.evaluate(() => scrollTo(0, 0));
	await page.screenshot({
		path: `${output}/mobile-queue.png`,
		fullPage: true,
	});
	const bar = await page.locator(".workspace-actions").boundingBox();
	const third = await page.locator(".file-identity").nth(2).boundingBox();
	assert.ok(
		third.y + third.height <= bar.y,
		"Three file identities and metadata fit above the mobile bar",
	);
	for (const width of [320, 390, 768, 769, 800, 801, 1024, 1366]) {
		await page.setViewportSize({ width, height: 844 });
		await page.waitForFunction((w) => innerWidth === w, width);
		await page.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(resolve)),
				),
		);
		assert.ok(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
			`overflow at ${width}`,
		);
		assert.equal(await page.locator(".pixel-convert").count(), 1);
		const fixed = await page
			.locator(".workspace-actions")
			.evaluate((el) => getComputedStyle(el).position === "fixed");
		assert.equal(fixed, width <= 800);
		report.layouts.push({ width, fixed });
	}
	await page.setViewportSize({ width: 1366, height: 768 });
	await page.evaluate(() => scrollTo(0, 0));
	const primary = await page.locator(".pixel-convert").boundingBox();
	assert.ok(primary.y + primary.height < 768);
	await page.screenshot({
		path: `${output}/desktop-queue.png`,
		fullPage: true,
	});
	await page.setViewportSize({ width: 390, height: 844 });
	const trigger = page.locator(
		".pixel-batch-format .pixel-format-selector > button",
	);
	await trigger.click();
	assert.equal(
		await page.evaluate(() =>
			document.activeElement?.getAttribute("aria-label"),
		),
		"关闭",
	);
	for (let i = 0; i < 8; i++) {
		await page.keyboard.press("Tab");
		assert.ok(
			await page.evaluate(
				() => !!document.activeElement?.closest("dialog[open]"),
			),
		);
	}
	const dialog = page.locator("dialog[open]");
	await dialog.locator("input").fill(".PNG");
	assert.equal(
		await dialog
			.locator(".format-options button")
			.first()
			.getAttribute("aria-label"),
		".png",
	);
	await dialog.locator("input").fill("heic");
	assert.equal(await dialog.locator(".format-options button").count(), 0);
	await dialog.locator("input").fill("webp");
	await page.screenshot({ path: `${output}/mobile-format.png` });
	await page.keyboard.press("Escape");
	assert.ok(await trigger.evaluate((el) => document.activeElement === el));
	await trigger.click();
	await page.setViewportSize({ width: 801, height: 844 });
	await page.locator("dialog[open]").waitFor({ state: "detached" });
	report.checks.push(
		"format dialog filters read-only outputs, searches case-insensitively, contains focus, restores it, closes on width change",
	);
	await upload(input(long));
	const longRow = page.locator(".compact-file").last();
	const nameButton = longRow.locator(".file-name");
	await nameButton.press("Enter");
	assert.equal(await nameButton.getAttribute("aria-expanded"), "true");
	assert.ok(await nameButton.evaluate((el) => document.activeElement === el));
	assert.equal(await nameButton.locator("span").first().textContent(), long);
	assert.equal(await longRow.locator("script").count(), 0);
	await page.setViewportSize({ width: 390, height: 844 });
	await nameButton.scrollIntoViewIfNeeded();
	await page.screenshot({ path: `${output}/long-filename.png` });
	await nameButton.press("Enter");
	// Footer remains reachable above the measured fixed bar; secondary routes clear reservation.
	await page.locator(".pixel-footer").scrollIntoViewIfNeeded();
	await page.evaluate(() =>
		scrollTo(0, document.documentElement.scrollHeight),
	);
	const footerLink = await page
		.locator('.pixel-footer a[href="/privacy/"]')
		.first()
		.boundingBox();
	assert.ok(
		footerLink.y + footerLink.height <
			(await page.locator(".workspace-actions").boundingBox()).y,
	);
	await page.locator('.pixel-footer a[href="/privacy/"]').first().click();
	await page.waitForURL("**/privacy/");
	assert.equal(await page.locator(".workspace-actions").count(), 0);
	assert.equal(
		await page.evaluate(() =>
			document.documentElement.style.getPropertyValue(
				"--workspace-action-height",
			),
		),
		"",
	);
	await page.locator('.pixel-menubar a[href="/convert/"]').click();
	await page.waitForURL("**/convert/");
	assert.equal(await page.locator(".compact-file").count(), 4);
	for (const route of ["settings", "about", "environment"]) {
		await page.locator(`.pixel-menubar a[href="/${route}/"]`).click();
		await page.waitForURL(`**/${route}/`);
		assert.equal(await page.locator(".workspace-actions").count(), 0);
		if (route === "settings") {
			await page
				.getByRole("button", { name: "高级设置", exact: true })
				.click();
			await page
				.getByRole("button", { name: "Enable", exact: true })
				.click();
			await page
				.locator(".pixel-format-selector > button")
				.first()
				.click();
			const settingsDialog = page.locator("dialog[open]");
			await settingsDialog.locator("input").fill("png");
			assert.equal(
				await settingsDialog
					.locator(".format-options button")
					.first()
					.getAttribute("aria-label"),
				".png",
			);
			await page.keyboard.press("Escape");
			const ids = await page
				.locator(".pixel-format-menu")
				.evaluateAll((els) => els.map((el) => el.id));
			assert.equal(new Set(ids).size, ids.length);
		}
		await page.locator('.pixel-menubar a[href="/convert/"]').click();
		await page.waitForURL("**/convert/");
		assert.equal(await page.locator(".compact-file").count(), 4);
	}
	report.checks.push(
		"privacy/settings/about/environment navigation preserves the queue; settings selector opens with unique IDs",
	);
	await page.goto(base + "/convert/", { waitUntil: "load" });
	// A reload intentionally starts a new empty in-memory queue.
	assert.equal(await page.locator(".workspace-actions").count(), 0);
	report.checks.push(
		"long filename is plain text, expands with stable focus; footer accessible; route cleanup and empty queue have no fixed bar",
	);
	// Capacity, no invisible per-format nodes in closed selectors, duplicate IDs, other locales/themes.
	for (const count of [20, 100]) {
		await upload(
			Array.from({ length: count }, (_, i) => input(`queue-${i}.heic`)),
		);
		await page.waitForFunction(
			(n) => document.querySelectorAll(".compact-file").length === n,
			count,
		);
		assert.equal(
			await page.locator(".pixel-format-menu button").count(),
			0,
		);
		const ids = await page
			.locator("[id]")
			.evaluateAll((els) => els.map((el) => el.id));
		assert.equal(new Set(ids).size, ids.length);
		report.checks.push(
			`${count} files: unique control IDs and zero closed-menu format buttons`,
		);
		await clear();
	}
	for (const locale of ["en", "es", "zh-Hant"]) {
		await upload([
			input("alpha.heic"),
			input("beta.heic"),
			input("gamma.heic"),
		]);
		const targets = await page
			.locator(".pixel-file-format button")
			.allTextContents();
		await page.locator("#header-language").selectOption(locale);
		await page.waitForFunction(
			(value) =>
				document.documentElement.lang === value &&
				document.activeElement?.id === "header-language",
			locale,
		);
		assert.equal(
			await page.evaluate(() => localStorage.getItem("locale")),
			locale,
		);
		assert.equal(await page.locator(".compact-file").count(), 3);
		assert.deepEqual(
			await page.locator(".pixel-file-format button").allTextContents(),
			targets,
		);
		if (
			!(await page.evaluate(() =>
				document.documentElement.classList.contains("dark"),
			))
		)
			await page.locator(".pixel-theme-toggle").click();
		await page.setViewportSize({ width: 320, height: 844 });
		assert.ok(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		);
		assert.ok(await page.locator(".pixel-convert").innerText());
		await page.screenshot({
			path: `${output}/${locale}-dark.png`,
			fullPage: true,
		});
		await clear();
	}
	await page.reload({ waitUntil: "load" });
	await page.waitForFunction(
		() => document.querySelector("#header-language")?.value === "zh-Hant",
	);
	report.checks.push(
		"header language switch preserves queued files/targets and keyboard focus; selection survives reload; clear returns focus to add files",
	);
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
