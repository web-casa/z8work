import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectDebInContainer } from "../../scripts/lib/desktop-deb-installed.mjs";
const quality = JSON.parse(
	await readFile(
		"docs/desktop/evidence/format-delivery-20260914/linux-arm64/quality.json",
		"utf8",
	),
);
function fixture({
	fail,
	connected = false,
	invalidQuality = false,
	cleanupFails = false,
} = {}) {
	const calls = [];
	const records = [];
	const source = { os: "linux", arch: "arm64", sha256: "a".repeat(64) };
	const options = {
		source,
		name: "test-container",
		image: `ubuntu:24.04@sha256:${"b".repeat(64)}`,
		candidate: "/input.deb",
		script: "/check.py",
		record: async (name) => records.push(name),
		docker: async (args) => {
			calls.push(args);
			if (args.includes(fail) || (cleanupFails && args[0] === "rm"))
				throw new Error("simulated failure");
			if (args[0] === "inspect")
				return JSON.stringify(connected ? { bridge: {} } : {});
			if (args.at(-1) === "/quality.json")
				return JSON.stringify(invalidQuality ? {} : quality);
			if (args.at(-1) === "/build-info.json")
				return JSON.stringify({ arch: "aarch64", engines: "bundled" });
			if (args.at(-1) === "/check.json")
				return JSON.stringify({
					status: "passed",
					machine: "aarch64",
					ordinaryUserUid: 1001,
					installedFilesChecked: 123,
					installedApplicationHash: "c".repeat(64),
					networkInterfaces: ["lo"],
					installation: "passed",
					removal: "passed",
					unownedFileRetained: true,
					gui: "not-run",
					upgrade: "not-run",
				});
			return "";
		},
	};
	return { options, calls, records };
}
test("deb acceptance disconnects before conversion and cleans up before success", async () => {
	const { options, calls, records } = fixture();
	const result = await inspectDebInContainer(options);
	assert.equal(result.status, "passed");
	assert.equal(result.hostInstallationModified, false);
	assert.ok(
		calls.findIndex((a) => a.includes("disconnect")) <
			calls.findIndex((a) => a.includes("verify")),
	);
	assert.deepEqual(calls.at(-1), ["rm", "--force", "test-container"]);
	assert.equal(records.length, 3);
	assert.ok(!calls.flat().includes("--privileged"));
});
for (const failure of ["prepare", "verify", "/quality.json"]) {
	test(`deb acceptance cleans up and rejects ${failure} failure`, async () => {
		const { options, calls } = fixture({ fail: failure });
		await assert.rejects(
			inspectDebInContainer(options),
			/simulated failure/,
		);
		assert.deepEqual(calls.at(-1), ["rm", "--force", "test-container"]);
	});
}
test("connected conversion is never started", async () => {
	const { options, calls } = fixture({ connected: true });
	await assert.rejects(inspectDebInContainer(options), /still connected/);
	assert.ok(!calls.some((a) => a.includes("verify")));
	assert.equal(calls.at(-1)[0], "rm");
});
test("invalid quality and failed cleanup cannot produce acceptance", async () => {
	await assert.rejects(
		inspectDebInContainer(fixture({ invalidQuality: true }).options),
	);
	await assert.rejects(
		inspectDebInContainer(fixture({ cleanupFails: true }).options),
		/simulated failure/,
	);
});
