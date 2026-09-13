// Exercise visible format controls through Tauri's official IPC mock.
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
try {
	for (const format of ["html", "htm", "rtf", "odt", "epub"]) {
		const page = await browser.newPage({
			viewport: { width: 1100, height: 850 },
		});
		const errors = [];
		page.on("pageerror", (e) => errors.push(String(e)));
		await page.route("**/src/main.ts", async (route) => {
			const response = await route.fetch();
			const setup = `import {mockIPC} from '/@fs/${resolve("node_modules/@tauri-apps/api/mocks.js")}';
window.isTauri=true;
const state=${JSON.stringify(fixture)};
state.tasks=[state.tasks[0]];state.tasks[0].name='input.${format}';state.tasks[0].format='txt';state.tasks[0].formats=['txt'];state.tasks[0].phase='ready';state.tasks[0].result=null;state.import_report=null;
window.calls=[];
mockIPC(async(command,args)=>{
 window.calls.push(command);
 if(command==='read_preferences') return {schema:1,revision:0,preferences:{language:'zh_hans',batch_format:'txt',batch_options:{quality:'balanced',keep_metadata:false,pdf_dpi:144}}};
 if(command==='desktop_info') return {preparing:false,startup:[{id:'pandoc',phase:'ready',failure:null}],pending_imports:0,import_failure:null,workspace_error:null,temporary_cleanup:null,architecture:'test',engines:[],error:null,queue_error:null};
 if(command==='queue_snapshot')return structuredClone(state);
 if(command==='set_task_format'){state.tasks[0].format=args.format;state.revision++;return structuredClone(state);}
 throw new Error('Unexpected IPC: '+command);
},{shouldMockEvents:true});
`;
			await route.fulfill({
				response,
				body: setup + (await response.text()),
			});
		});
		await page.goto(server.resolvedUrls.local[0]);
		await page.getByText("input." + format, { exact: true }).waitFor();
		assert.equal(await page.locator(".options-editor").count(), 2);
		assert.equal(
			await page.getByRole("combobox", { name: /图片质量/ }).count(),
			0,
		);
		assert.equal(
			await page
				.getByText("保留 EXIF / XMP / IPTC 元数据", { exact: true })
				.count(),
			0,
		);
		assert.equal(
			await page.getByText(/仅提取纯文本，不保留图片/).count(),
			2,
		);
		assert.equal(
			await page.getByRole("button", { name: "预览原图" }).count(),
			0,
		);
		const taskSelect = page
			.locator("select")
			.filter({ has: page.locator('option[value="txt"]') })
			.last();
		assert.equal(await taskSelect.inputValue(), "txt");
		assert.equal(await taskSelect.locator("option").count(), 1);
		assert.deepEqual(errors, []);
		await mkdir(".desktop-local/format-phase3a-browser", {
			recursive: true,
		});
		await page.screenshot({
			path: `.desktop-local/format-phase3a-browser/${format}.png`,
			fullPage: true,
		});
		await page.close();
		console.log(format + ": plain-text controls passed");
	}
} finally {
	await browser.close();
	await server.close();
}
