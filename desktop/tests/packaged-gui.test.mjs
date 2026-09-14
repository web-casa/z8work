import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	packagedGuiChecks,
	validatePackagedGuiReport,
} from "../../scripts/lib/desktop-packaged-gui-report.mjs";
const expected = { arch: "arm64", sha256: "a".repeat(64) };
const fixture = () => ({
	schema: 1,
	status: "passed",
	mode: "packaged-product",
	platform: "linux/arm64",
	binarySha256: expected.sha256,
	checks: [...packagedGuiChecks],
});
test("packaged GUI gate binds all twenty-four native interaction checks to the actual binary", () => {
	assert.equal(packagedGuiChecks.length, 24);
	validatePackagedGuiReport(fixture(), expected);
	for (const mutate of [
		(r) => r.checks.pop(),
		(r) => (r.checks = r.checks.slice(2)),
		(r) => (r.checks = r.checks.slice(1)),
		(r) => (r.checks = r.checks.slice(3)),
		(r) => (r.checks = r.checks.slice(0, 5)),
		(r) => r.checks.push(r.checks[0]),
		(r) => (r.status = "failed"),
		(r) => (r.mode = "legacy"),
		(r) => (r.platform = "linux/x64"),
		(r) => (r.binarySha256 = "b".repeat(64)),
	]) {
		const report = fixture();
		mutate(report);
		assert.throws(() => validatePackagedGuiReport(report, expected));
	}
});
test("installed GUI installer refuses a normal local invocation before apt operations", () => {
	assert.throws(
		() =>
			execFileSync(
				process.execPath,
				[
					"scripts/desktop-installed-gui.mjs",
					"linux-arm64",
					"/unused",
					"/unused",
				],
				{
					env: { ...process.env, GITHUB_ACTIONS: "false" },
					stdio: "pipe",
				},
			),
		(error) =>
			error.status !== 0 &&
			/ephemeral GitHub-hosted/.test(error.stderr.toString()),
	);
});
