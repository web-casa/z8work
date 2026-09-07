import test from "node:test";
import assert from "node:assert/strict";
import { moduleUrl } from "./helpers-load-ts.mjs";
const { inputFormat, normalizedInputName } = await import(
	await moduleUrl(new URL("../src/lib/util/input-format.ts", import.meta.url))
);

test("PNG suffix recognition handles uppercase, suffix-only names and trailing whitespace", () => {
	for (const name of [
		"picture.png",
		"截图.PNG",
		".png",
		"图片.png ",
		"family.photo.png\u00a0",
	])
		assert.equal(inputFormat({ name }), ".png");
});
test("extensionless clipboard images use a known MIME type and keep the original name", () => {
	assert.equal(
		inputFormat({ name: "剪贴板图片", type: "image/png" }),
		".png",
	);
	assert.equal(normalizedInputName("剪贴板图片"), "剪贴板图片");
	assert.equal(normalizedInputName("截图.PNG"), "截图.png");
	assert.equal(normalizedInputName("文档.DOCX\u00a0"), "文档.docx");
	assert.equal(
		inputFormat({ name: "image", type: "application/octet-stream" }),
		"",
	);
});
test("MIME does not override an explicit suffix or silently turn spreadsheets into ZIPs", () => {
	assert.equal(
		inputFormat({ name: "table.xlsx", type: "application/zip" }),
		".xlsx",
	);
	assert.equal(
		inputFormat({ name: "table.xlxs", type: "image/png" }),
		".xlxs",
	);
	assert.equal(
		inputFormat({ name: "actual.png", type: "image/jpeg" }),
		".png",
	);
	assert.equal(
		inputFormat({ name: "archive", type: "application/zip" }),
		".zip",
	);
});
