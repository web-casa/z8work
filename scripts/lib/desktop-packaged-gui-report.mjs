import assert from "node:assert/strict";
export const packagedGuiChecks = Object.freeze([
	"native-input-picker-cancel-keeps-queue-empty",
	"convert-button-save-picker-cancel-does-not-start",
	"visible-format-and-keyboard-convert-save-decodable-webp-original-unchanged",
	"native-restart-restores-language-and-history-without-file-authorization",
	"keyboard-clear-retains-original-and-saved-result",
]);
export function validatePackagedGuiReport(report, { arch, sha256 }) {
	assert.equal(report.schema, 1);
	assert.equal(report.status, "passed");
	assert.equal(report.mode, "packaged-product");
	assert.ok(["arm64", "x64"].includes(arch));
	assert.equal(report.platform, `linux/${arch}`);
	assert.match(sha256, /^[a-f0-9]{64}$/);
	assert.equal(report.binarySha256, sha256);
	assert.deepEqual([...report.checks].sort(), [...packagedGuiChecks].sort());
}
