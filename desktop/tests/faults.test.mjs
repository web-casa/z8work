import test from "node:test";
import assert from "node:assert/strict";
import { validateFaultReport } from "../../scripts/lib/desktop-faults.mjs";
function fixture() {
	return {
		schema: 1,
		phase: 29,
		status: "passed",
		platform: "linux-aarch64",
		elapsedMs: 2000,
		checks: [
			{
				id: "readonly-mount",
				status: "passed",
				failure: "output_permission",
			},
			{
				id: "inode-exhaustion",
				status: "passed",
				failure: "storage",
				createdFiles: 63,
			},
			...["disk-full", "permission-revoked"].map((id) => ({
				id,
				status: "passed",
				failure: id === "disk-full" ? "storage" : "output_permission",
				injectedBytes: id === "disk-full" ? 32 * 1024 ** 2 : 0,
				saveRetryWithoutSource: true,
				existingFilesPreserved: true,
				partialFiles: 0,
				savedSha256: "a".repeat(64),
			})),
			{ id: "workspace-cleanup", status: "passed" },
		],
	};
}
test("native fault evidence requires actual bounded injection, recovery, cleanup and platform", () => {
	validateFaultReport(fixture(), "linux-aarch64");
	for (const mutate of [
		(r) => {
			r.platform = "linux-x86_64";
		},
		(r) => {
			r.checks.pop();
		},
		(r) => {
			r.checks[4] = r.checks[0];
		},
		(r) => {
			r.checks[1].createdFiles = 0;
		},
		(r) => {
			r.checks[2].injectedBytes = 0;
		},
		(r) => {
			r.checks[2].saveRetryWithoutSource = false;
		},
		(r) => {
			r.checks[3].partialFiles = 1;
		},
		(r) => {
			r.checks[3].savedSha256 = "";
		},
		(r) => {
			r.elapsedMs = NaN;
		},
	]) {
		const r = fixture();
		mutate(r);
		assert.throws(() => validateFaultReport(r, "linux-aarch64"));
	}
});
