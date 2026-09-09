import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp,
	mkdir,
	readFile,
	writeFile,
	rm,
	lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { verifyDsc } from "../../scripts/lib/desktop-sources.mjs";
const execute = promisify(execFile);
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-assemble-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = join(root, "old"),
		supplement = join(root, "new");
	await mkdir(input);
	const hash = createHash("sha256").update("source bytes").digest("hex");
	const records = [];
	for (const source of ["aa", "bb"]) {
		const directory =
			source === "aa" ? input : join(supplement, "archives", "bb_1.0");
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, source + ".tar.xz"), "source bytes");
		await writeFile(
			join(directory, source + ".dsc"),
			`Format: 3.0 (native)\nSource: ${source}\nVersion: 1.0\nChecksums-Sha256:\n ${hash} 12 ${source}.tar.xz\n`,
		);
		records.push(await verifyDsc(directory, source + ".dsc"));
	}
	const audit = {
		schema: 1,
		sourceDistribution: "debian-13",
		engineManifestSha256: "a".repeat(64),
		sourceArchiveRoot: input,
		sources: [
			{ source: "aa", version: "1.0", delivery: records[0] },
			{ source: "bb", version: "1.0", delivery: { status: "missing" } },
		],
	};
	const added = {
		schema: 1,
		engineManifestSha256: audit.engineManifestSha256,
		status: "verified-awaiting-source-review",
		sources: [{ ...records[1], version: "1.0", status: "verified" }],
	};
	await writeFile(join(root, "audit.json"), JSON.stringify(audit));
	await writeFile(join(supplement, "downloads.json"), JSON.stringify(added));
	return { root, input, supplement, audit, added };
}
const assemble = (f, output = join(f.root, "assembled")) =>
	execute(process.execPath, [
		"scripts/desktop-source-assemble.mjs",
		"--audit",
		join(f.root, "audit.json"),
		"--supplement",
		join(f.supplement, "downloads.json"),
		"--output",
		output,
	]);
test("assembly combines exact verified cache and supplement without changing originals", async (t) => {
	const f = await fixture(t);
	await assemble(f);
	const report = JSON.parse(
		await readFile(join(f.root, "assembled", "assembly.json"), "utf8"),
	);
	assert.equal(report.sourceVersions, 2);
	assert.equal(report.files.length, 4);
	assert.equal(report.status, "assembled-awaiting-audit");
	assert.equal(report.redistributionApproved, false);
	assert.equal(
		(await verifyDsc(join(f.root, "assembled", "bb_1.0"), "bb.dsc")).source,
		"bb",
	);
	assert.equal(
		await readFile(join(f.input, "aa.tar.xz"), "utf8"),
		"source bytes",
	);
	await assert.rejects(assemble(f), /EEXIST/);
});
test("assembly rejects a corrupt source rather than trusting a verified report", async (t) => {
	const f = await fixture(t);
	await writeFile(
		join(f.supplement, "archives", "bb_1.0", "bb.tar.xz"),
		"broken bytes",
	);
	await assert.rejects(assemble(f), /mismatch/);
	await assert.rejects(lstat(join(f.root, "assembled", "assembly.json")), {
		code: "ENOENT",
	});
});
test("assembly rejects foreign manifests and outputs inside immutable source caches", async (t) => {
	const f = await fixture(t);
	await assert.rejects(assemble(f, join(f.input, "nested")), /immutable/);
	await assert.rejects(lstat(join(f.input, "nested")), { code: "ENOENT" });
	f.added.engineManifestSha256 = "b".repeat(64);
	await writeFile(
		join(f.supplement, "downloads.json"),
		JSON.stringify(f.added),
	);
	await assert.rejects(assemble(f), /mismatched/);
});
