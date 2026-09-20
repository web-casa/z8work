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
	const catalog = JSON.parse(
		await readFile(
			new URL(
				"../docs/desktop/format-expansion-catalog.json",
				import.meta.url,
			),
			"utf8",
		),
	);
	const markdownCatalog = await readFile(
		new URL("../docs/desktop/FORMAT_EXPANSION_CATALOG.md", import.meta.url),
		"utf8",
	);
	const scope = JSON.parse(
		await readFile(
			new URL("../packaging/desktop/v1-scope.json", import.meta.url),
			"utf8",
		),
	);
	const desktopInputs = new Set(
		scope.groups.flatMap((group) => group.inputs),
	);
	const desktopOutputs = new Set(
		scope.groups.flatMap((group) => group.outputs),
	);
	const desktopRouteCount = scope.groups.reduce(
		(total, group) => total + group.inputs.length * group.outputs.length,
		0,
	);
	for (const value of [
		"Z8.Work 格式能力对照报告",
		"XLSX",
		"OCR",
		"JP2/J2K、PSD、DDS",
		"23 个栅格扩展名",
	])
		assert.match(report, new RegExp(value));
	assert.match(
		report,
		new RegExp(
			`${desktopInputs.size} 个输入扩展 / ${desktopOutputs.size} 个输出格式 / ${desktopRouteCount}\\s*条声明路线`,
		),
	);
	assert.match(
		report,
		new RegExp(
			`当前源码范围的\\s*${desktopRouteCount}\\s*条路线必须逐一经过最终包验收`,
		),
	);
	assert.doesNotMatch(
		report,
		/<strong>undefined<\/strong>|<td>undefined<\/td>/,
	);
	assert.match(report, /src-tauri\/native\/src\/convert\.rs/);
	assert.match(report, /evidence\/format-research-20260913/);
	assert.match(report, /data-filter="\.web-format-table"/);
	assert.match(report, /data-filter="\.why-table"/);
	assert.equal(catalog.schema, 1);
	assert.deepEqual(
		catalog.tiers.map((tier) => tier.label),
		["超低", "低", "中", "高", "超高"],
	);
	assert.equal(
		new Set(catalog.items.map((item) => item.id)).size,
		catalog.items.length,
	);
	assert.match(report, /扩展格式选择目录/);
	assert.match(report, /data-catalog-search/);
	assert.match(markdownCatalog, /# Z8\.Work 原生格式扩展选择目录/);
	for (const item of catalog.items) {
		assert.match(report, new RegExp(`>${item.id}<`));
		assert.ok(markdownCatalog.includes(`\`${item.id}\``));
	}
});
