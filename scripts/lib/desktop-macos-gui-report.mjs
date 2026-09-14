import assert from "node:assert/strict";
export const macGuiChecks = Object.freeze([
	"fixed-dmg-hash",
	"installed-application-signature-and-gatekeeper",
	"launchservices-from-applications",
	"native-input-picker-cancel-keeps-empty-workspace",
	"conversion-output-picker-cancel",
	"native-pickers-unicode-path-webp-conversion-and-real-decode",
	"native-idle-quit",
	"restart-history-without-input-output-authorization",
	"clear-keeps-original-and-saved-result",
]);
export function validateMacGuiReport(report, pin) {
	assert.equal(report.schema, 1);
	assert.equal(report.status, "passed");
	assert.equal(report.gui, "passed");
	assert.deepEqual(report.source, pin);
	assert.equal(pin.os, "darwin");
	assert.equal(report.artifact.sha256, pin.sha256);
	assert.ok(report.artifact.bytes > 0);
	assert.match(report.application.sha256, /^[a-f0-9]{64}$/);
	assert.ok(report.application.bytes > 0);
	assert.equal(report.environment.accessibilityTrusted, true);
	assert.ok(report.environment.screens > 0);
	assert.equal(report.exit, "terminated");
	assert.equal(report.uninstall, "removed-test-copy");
	assert.deepEqual([...report.checks].sort(), [...macGuiChecks].sort());
	assert.deepEqual(report.result.decoded, { width: 32, height: 32 });
	assert.ok(report.result.bytes > 0);
	assert.match(report.result.sha256, /^[a-f0-9]{64}$/);
	assert.equal(report.resultRetainedAfterUninstall, true);
	assert.ok(
		!report.error &&
			!report.cleanupError &&
			!report.detachError &&
			!report.diagnosticsError,
	);
}
