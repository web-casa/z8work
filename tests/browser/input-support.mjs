import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
const { chromium } = createRequire(import.meta.url)(
	process.env.PLAYWRIGHT_MODULE || "playwright",
);
const base = process.env.IIPE_TEST_BASE || "http://localhost:5174";
const output = process.env.IIPE_TEST_OUTPUT || "/tmp/iipe-input-support";
await mkdir(output, { recursive: true });
const workbook = zipSync(
	Object.fromEntries(
		Object.entries({
			"[Content_Types].xml":
				'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
			"_rels/.rels":
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
			"xl/workbook.xml":
				'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sample" sheetId="1" r:id="rId1"/></sheets></workbook>',
			"xl/_rels/workbook.xml.rels":
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
			"xl/worksheets/sheet1.xml":
				'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Sample</t></is></c></row></sheetData></worksheet>',
		}).map(([name, text]) => [name, strToU8(text)]),
	),
);
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
const errors = [],
	writes = [];
try {
	const page = await browser.newPage({
		viewport: { width: 1100, height: 900 },
		acceptDownloads: true,
	});
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("request", (r) => {
		if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
	});
	await page.addInitScript(() => localStorage.setItem("locale", "zh-Hans"));
	await page.goto(base, { waitUntil: "load" });
	const bytes = Buffer.from(
		await page.evaluate(() => {
			const canvas = document.createElement("canvas");
			canvas.width = 48;
			canvas.height = 32;
			const ctx = canvas.getContext("2d");
			ctx.fillStyle = "#427b68";
			ctx.fillRect(0, 0, 48, 32);
			return canvas.toDataURL("image/png").split(",")[1];
		}),
		"base64",
	);
	const images = [
		{ name: "普通.png", mimeType: "image/png" },
		{ name: "大写.PNG", mimeType: "application/octet-stream" },
		{ name: ".png", mimeType: "" },
		{ name: "尾随空白.png\u00a0", mimeType: "image/png" },
		{ name: "剪贴板图片", mimeType: "image/png" },
		{ name: "错误MIME.png", mimeType: "application/zip" },
	];
	const sheets = [
		{
			name: "正常.xlsx",
			mimeType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		},
		{ name: "ZIP类型.xlsx", mimeType: "application/zip" },
		{ name: "后缀拼写.xlxs", mimeType: "application/octet-stream" },
	];
	await page
		.locator("input[type=file]:enabled")
		.first()
		.setInputFiles([
			...images.map((f) => ({ ...f, buffer: bytes })),
			...sheets.map((f) => ({ ...f, buffer: Buffer.from(workbook) })),
		]);
	await page.waitForFunction(
		() => document.querySelectorAll(".compact-file").length === 9,
	);
	const rows = page.locator(".compact-file");
	for (let i = 0; i < 6; i++)
		assert.equal(
			await rows.nth(i).locator(".file-extension").innerText(),
			"PNG",
		);
	for (let i = 6; i < 8; i++)
		assert.match(
			await rows.nth(i).locator(".pixel-file-status").innerText(),
			/暂不支持电子表格转换（XLSX）/,
		);
	assert.match(
		await rows.nth(8).locator(".pixel-file-status").innerText(),
		/XLXS.*XLSX/,
	);
	assert.match(
		await page.locator(".pixel-convert").innerText(),
		/转换 6 个文件/,
	);
	assert.equal(
		await rows.nth(4).locator(".file-name span").first().innerText(),
		"剪贴板图片",
	);
	await page.locator(".pixel-convert").click();
	await page.waitForFunction(
		() => document.querySelectorAll('[data-state="complete"]').length === 6,
		{},
		{ timeout: 60000 },
	);
	assert.equal(await rows.count(), 9);
	assert.equal(await page.locator('[data-state="failed"]').count(), 0);
	const downloadEvent = page.waitForEvent("download");
	await rows.nth(4).locator(".pixel-square").click();
	const result = await downloadEvent;
	const jpeg = await readFile(await result.path());
	assert.equal(result.suggestedFilename(), "Z8.Work_剪贴板图片.jpeg");
	assert.deepEqual([...jpeg.subarray(0, 3)], [255, 216, 255]);
	await page.screenshot({
		path: `${output}/png-and-spreadsheets.png`,
		fullPage: true,
	});
	assert.deepEqual(errors, []);
	assert.deepEqual(writes, []);
	const report = {
		base,
		pngInputs: images,
		completed: 6,
		spreadsheetInputs: sheets,
		spreadsheetRowsRetained: 3,
		download: { name: result.suggestedFilename(), bytes: jpeg.length },
		pageErrors: errors,
		nonReadRequests: writes,
	};
	await writeFile(
		`${output}/results.json`,
		JSON.stringify(report, null, 2) + "\n",
	);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await browser.close();
}
