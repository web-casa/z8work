import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	macGuiChecks,
	validateMacGuiReport,
} from "../../scripts/lib/desktop-macos-gui-report.mjs";
const pin = { os: "darwin", arch: "arm64", sha256: "a".repeat(64) };
const fixture = () => ({
	schema: 1,
	status: "passed",
	gui: "passed",
	source: pin,
	artifact: { sha256: pin.sha256, bytes: 1 },
	application: { sha256: "b".repeat(64), bytes: 1 },
	environment: { accessibilityTrusted: true, screens: 1 },
	exit: "terminated",
	uninstall: "removed-test-copy",
	checks: [...macGuiChecks],
	result: {
		decoded: { width: 32, height: 32 },
		sha256: "c".repeat(64),
		bytes: 1,
	},
	resultRetainedAfterUninstall: true,
});
test("macOS installed GUI gate rejects partial launch, missing checks, wrong package and cleanup failures", () => {
	validateMacGuiReport(fixture(), pin);
	for (const mutate of [
		(r) => r.checks.pop(),
		(r) => r.checks.push(r.checks[0]),
		(r) => (r.gui = "inspection-only"),
		(r) => (r.environment.accessibilityTrusted = false),
		(r) => (r.status = "failed"),
		(r) => (r.exit = "still-running"),
		(r) => (r.uninstall = "not-run"),
		(r) => (r.resultRetainedAfterUninstall = false),
		(r) => (r.artifact.sha256 = "d".repeat(64)),
		(r) => (r.result.decoded.width = 1),
		(r) => (r.cleanupError = "failed"),
	]) {
		const r = fixture();
		mutate(r);
		assert.throws(() => validateMacGuiReport(r, pin));
	}
});
test("macOS installer refuses non-hosted invocations before installation", () => {
	assert.throws(
		() =>
			execFileSync(
				process.execPath,
				["scripts/desktop-macos-installed-gui.mjs", "macos-arm64"],
				{
					env: {
						...process.env,
						GITHUB_ACTIONS: "false",
						RUNNER_ENVIRONMENT: "self-hosted",
					},
					stdio: "pipe",
				},
			),
		(e) =>
			e.status !== 0 &&
			/Native macOS required|Ephemeral GitHub Actions environment required/.test(
				e.stderr.toString(),
			),
	);
});
