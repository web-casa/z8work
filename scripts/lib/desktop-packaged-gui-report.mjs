import assert from "node:assert/strict";
export const packagedGuiChecks = Object.freeze([
	"keyboard-remove-current-reaps-encoder-removes-record-and-queued-task-saves",
	"remove-current-keeps-batch-originals-and-decodable-next-output",
	"keyboard-remove-one-unsaved-releases-only-selected-cache",
	"remove-one-unsaved-other-result-saves-without-source-or-reencoding",
	"keyboard-clear-unsaved-discards-cache-keeps-original-and-existing-results",
	"clear-unsaved-new-task-converts-without-restart-or-restored-cache",
	"keyboard-clear-active-removes-running-and-queued-without-deleting-files",
	"clear-active-workspace-accepts-new-conversion-without-restart",
	"keyboard-cancel-queued-leaves-active-encoder-and-task-running",
	"cancel-queued-active-attempt-finishes-as-decodable-avif-without-queued-output",
	"keyboard-cancel-all-stops-running-and-queued-without-new-output",
	"cancel-all-explicit-single-retry-saves-without-restarting-other-task",
	"keyboard-cancel-current-reaps-encoder-and-queued-task-saves",
	"cancel-current-keeps-originals-existing-results-and-decodable-next-output",
	"queued-task-survives-escape-cancels-on-quit-and-never-auto-resumes",
	"active-encoder-injected-stop-escape-preserves-running-task",
	"active-confirmed-native-quit-reaps-observed-encoder-without-output",
	"active-quit-restart-cancelled-no-auto-resume-or-authorization",
	"save-picker-cancel-retains-output-grant-and-cached-bytes",
	"keyboard-save-only-publishes-identical-cache-with-source-unavailable",
	"save-recovery-clear-keeps-result-original-and-collision-files",
	"native-input-picker-cancel-keeps-queue-empty",
	"convert-button-save-picker-cancel-does-not-start",
	"visible-format-and-keyboard-convert-save-decodable-webp-original-unchanged",
	"native-restart-restores-language-and-history-without-file-authorization",
	"keyboard-clear-retains-original-and-saved-result",
	"unsaved-close-single-confirmation-escape-retains-payload",
	"unsaved-close-default-enter-stays-in-app",
	"confirmed-native-quit-discards-cache-restart-requires-manual-conversion",
	"idle-native-window-close-exits-without-confirmation",
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
