import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { pdfFixture } from "../helpers-pdf-fixture.mjs";

const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE || "playwright",
);
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
try {
	const page = await browser.newPage();
	await page.goto(process.env.IIPE_TEST_BASE || "http://localhost:5174/");
	await page
		.locator("input[type=file]:enabled")
		.first()
		.setInputFiles({
			name: "focus.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from(pdfFixture()),
		});
	await page.locator(".pixel-file-format button").first().click();
	const retained = await page.evaluate(async () => {
		const dialog = document.querySelector("dialog[open]");
		const next = document.querySelector(".file-remove");
		const closed = new Promise((resolve) => {
			dialog.addEventListener(
				"close",
				() => {
					requestAnimationFrame(() =>
						resolve(document.activeElement === next),
					);
				},
				{ once: true },
			);
		});
		// The native close event is queued. Simulate the user's next keyboard
		// action before it arrives; it must not move focus back to the selector.
		dialog.querySelector(".format-options button").click();
		next.focus();
		return closed;
	});
	assert.equal(
		retained,
		true,
		"A delayed close event must preserve the next focus target",
	);
	console.log(JSON.stringify({ delayedClosePreservesFocus: true }));
} finally {
	await browser.close();
}
