// Frontend interaction regression using Tauri's official IPC mock; no native dialog claims.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const fixture = JSON.parse(
	await readFile("desktop/tests/fixtures/queue-snapshot.json", "utf8"),
);
const server = await createServer({
	configFile: "desktop/vite.config.ts",
	server: { port: 0, strictPort: false },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const cases = [
	"choose",
	"cancel",
	"error",
	"authorized",
	"reauthorize",
	"removed",
	"closing",
	"empty",
];
try {
	for (const mode of cases) {
		const page = await browser.newPage({
			viewport: { width: 1100, height: 800 },
		});
		const errors = [];
		page.on("pageerror", (e) => errors.push(String(e)));
		await page.route("**/src/main.ts", async (route) => {
			const response = await route.fetch();
			const setup = `
import { mockIPC } from '/@fs/${resolve("node_modules/@tauri-apps/api/mocks.js")}';
window.isTauri = true;
const mode = ${JSON.stringify(mode)};
const state = ${JSON.stringify(fixture)};
state.tasks[0].phase = 'ready'; state.tasks[0].result = null;
state.import_report = null;
state.output = mode === 'authorized' || mode === 'reauthorize' ? 'C:/output' : null;
state.output_authorized = mode === 'authorized';
if (mode === 'empty') state.tasks = [];
window.calls = [];
mockIPC(async (command, args) => {
 window.calls.push(command);
 if (command === 'read_preferences') return { schema: 1, revision: 0, preferences: { language: 'zh_hans', batch_format: 'webp', batch_options: { quality: 'balanced', keep_metadata: false, pdf_dpi: 144 } } };
 if (command === 'desktop_info') return { preparing: false, startup: [{ id: 'magick', phase: 'ready', failure: null }], pending_imports: 0, import_failure: null, workspace_error: null, temporary_cleanup: null, architecture: 'windows / x86_64', engines: [], error: null, queue_error: null };
 if (command === 'queue_snapshot') return structuredClone(state);
 if (command === 'pick_output') {
  await new Promise(resolve => { window.finishPicker = resolve; });
  if (mode === 'error') throw new Error('Test folder selection failed');
  if (mode !== 'cancel') { state.output = 'C:/output'; state.output_authorized = true; state.revision++; }
  if (mode === 'removed') state.tasks = [];
  if (mode === 'closing') state.closing = true;
  return structuredClone(state);
 }
 if (command === 'submit_batch') {
  if (!state.output_authorized || state.closing || !state.tasks.length) throw new Error('Unauthorized submission');
  window.request = args.request;
  state.processing = true; state.tasks[0].phase = 'queued'; state.revision++;
  return structuredClone(state);
 }
 throw new Error('Unexpected IPC: ' + command);
}, { shouldMockEvents: true });
`;
			await route.fulfill({
				response,
				body: setup + (await response.text()),
			});
		});
		await page.goto(server.resolvedUrls.local[0]);
		const button = page.locator("[data-start-conversion]");
		await button.waitFor();
		await page.waitForFunction(
			() =>
				window.calls?.includes("desktop_info") &&
				window.calls?.includes("queue_snapshot"),
		);
		if (mode === "empty") {
			assert.equal(await button.isDisabled(), true);
		} else {
			await page.waitForFunction(
				() =>
					!document.querySelector("[data-start-conversion]").disabled,
			);
			assert.match(
				await button.innerText(),
				mode === "authorized" ? /转换未完成文件/ : /选择保存目录并转换/,
			);
			if (mode === "choose") {
				await mkdir(".desktop-local/conversion-start", {
					recursive: true,
				});
				await page.locator(".workspace").screenshot({
					path: ".desktop-local/conversion-start/folder-prompt.png",
				});
			}
			await button.click();
			if (mode !== "authorized") {
				await page.waitForFunction(
					() => typeof window.finishPicker === "function",
				);
				assert.equal(await button.isDisabled(), true);
				await button.evaluate((el) => el.click()); // Disabled button must not open a second dialog.
				await page.evaluate(() => window.finishPicker());
			}
			const starts = ["choose", "authorized", "reauthorize"].includes(
				mode,
			);
			if (starts)
				await page.waitForFunction(() =>
					window.calls.includes("submit_batch"),
				);
			else if (mode === "closing")
				await page.waitForFunction(() =>
					document.body.innerText.includes("C:/output"),
				);
			else
				await page.waitForFunction(
					() =>
						!document.querySelector("[data-choose-files]").disabled,
				);
			const calls = await page.evaluate(() => window.calls);
			assert.equal(
				calls.filter((c) => c === "pick_output").length,
				mode === "authorized" ? 0 : 1,
			);
			assert.equal(
				calls.filter((c) => c === "submit_batch").length,
				starts ? 1 : 0,
			);
			if (starts)
				assert.equal(
					(await page.evaluate(() => window.request)).items[0].id,
					fixture.tasks[0].id,
				);
			if (mode === "error")
				assert.match(
					await page.locator("body").innerText(),
					/处理失败/,
				);
		}
		assert.deepEqual(errors, []);
		await page.close();
		console.log(`PASS ${mode}`);
	}
} finally {
	await browser.close();
	await server.close();
}
