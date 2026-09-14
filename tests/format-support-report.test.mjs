import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("format support report is generated from the current public contracts", async () => {
	execFileSync(
		process.execPath,
		["scripts/generate-format-support-report.mjs"],
		{
			cwd: root,
			stdio: "pipe",
		},
	);
	const report = await readFile(
		new URL("../docs/desktop/FORMAT_SUPPORT_REPORT.html", import.meta.url),
		"utf8",
	);
	for (const value of [
		"Z8.Work 格式能力对照报告",
		"XLSX",
		"OCR",
		"GIF、JXL、TIFF/TIF",
		"23 个栅格扩展名",
	])
		assert.match(report, new RegExp(value));
	assert.match(report, /29 个输入扩展 \/ 15 个输出格式 \/ 167\s*条声明路线/);
	assert.doesNotMatch(
		report,
		/<strong>undefined<\/strong>|<td>undefined<\/td>/,
	);
	assert.match(report, /src-tauri\/native\/src\/convert\.rs/);
	assert.match(report, /evidence\/format-research-20260913/);
	assert.match(report, /data-filter="\.web-format-table"/);
	assert.match(report, /data-filter="\.why-table"/);
});
