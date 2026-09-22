import test from "node:test";
import assert from "node:assert/strict";
import {
	artifactMatrix,
	assertElf,
	validateEvidence,
	validateBuild,
} from "../../scripts/lib/desktop-artifacts.mjs";

test("artifact matrix keeps store targets separate from local ARM evidence", async () => {
	const matrix = await artifactMatrix();
	assert.equal(
		new Set(matrix.artifacts.map((a) => a.id)).size,
		matrix.artifacts.length,
	);
	assert.deepEqual(matrix.languages, ["zh-Hans", "en"]);
	assert.ok(matrix.artifacts.every((a) => a.updater === false));
	const snap = matrix.artifacts.find((a) => a.channel === "snap");
	assert.equal(snap.arch, "x86_64");
	assert.equal(snap.confinement, "strict");
	assert.equal(
		matrix.artifacts.find((a) => a.channel === "microsoft-store").publisher,
		null,
	);
});
test("package validator rejects another architecture and malformed ELF", () => {
	const elf = Buffer.alloc(64);
	elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
	elf.writeUInt16LE(183, 18);
	assert.doesNotThrow(() => assertElf(elf, "aarch64"));
	assert.throws(() => assertElf(elf, "x86_64"));
	assert.throws(() => assertElf(Buffer.from("not ELF"), "aarch64"));
});
test("acceptance cannot borrow an older candidate or count not-run checks as passed", async () => {
	const artifact = (await artifactMatrix()).artifacts.find(
		(a) => a.channel === "snap",
	);
	const checks = Object.fromEntries(
		[
			"integrity",
			"conversion",
			"gui",
			"install",
			"upgrade",
			"uninstall",
			"licenses",
			"faults",
			"performance",
			"strict-confinement",
			"portal",
		].map((k) => [k, { status: "passed", report: "fixture evidence" }]),
	);
	const evidence = {
		schema: 1,
		sourceCommit: "a".repeat(40),
		artifact: artifact.id,
		sha256: "a".repeat(64),
		checks,
	};
	assert.equal(validateEvidence(evidence, evidence.sha256, artifact), true);
	assert.throws(
		() => validateEvidence(evidence, "b".repeat(64), artifact),
		/exact candidate/,
	);
	evidence.checks.portal.status = "not-run";
	assert.throws(
		() => validateEvidence(evidence, evidence.sha256, artifact),
		/portal/,
	);
	evidence.checks.portal.status = "passed";
	delete evidence.checks.portal.report;
	assert.throws(
		() => validateEvidence(evidence, evidence.sha256, artifact),
		/portal/,
	);
});

test("candidate build gate rejects development, debug, updater and mismatched version", async () => {
	const artifact = (await artifactMatrix()).artifacts[0];
	const info = {
		schema: 1,
		version: "0.1.0",
		os: artifact.os,
		arch: artifact.arch,
		engines: "bundled",
		debug: false,
		customProtocol: true,
		processLifetime: "watchdog-pipe-v1",
		updater: false,
	};
	assert.doesNotThrow(() => validateBuild(info, artifact, "0.1.0"));
	for (const patch of [
		{ engines: "development" },
		{ processLifetime: undefined },
		{ processLifetime: "job-close-v1" },
		{ debug: true },
		{ updater: true },
		{ customProtocol: false },
		{ version: "0.0.9" },
	])
		assert.throws(() =>
			validateBuild({ ...info, ...patch }, artifact, "0.1.0"),
		);
});

test("Windows candidate requires the compiled job-close strategy", async () => {
	const matrix = await artifactMatrix();
	const artifact = matrix.artifacts.find((a) => a.os === "windows");
	const info = {
		schema: 1,
		version: matrix.version,
		os: artifact.os,
		arch: artifact.arch,
		engines: "bundled",
		debug: false,
		customProtocol: true,
		updater: false,
		processLifetime: "job-close-v1",
	};
	assert.doesNotThrow(() => validateBuild(info, artifact, matrix.version));
	assert.throws(() =>
		validateBuild(
			{ ...info, processLifetime: "watchdog-pipe-v1" },
			artifact,
			matrix.version,
		),
	);
});
