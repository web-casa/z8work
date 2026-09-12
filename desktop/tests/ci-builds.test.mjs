import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
test("CI targets all six native OS/architecture combinations without substituting emulation", async () => {
	const entries = await json("packaging/desktop/ci-matrix.json");
	assert.equal(entries.length, 6);
	assert.equal(new Set(entries.map((e) => `${e.os}/${e.arch}`)).size, 6);
	assert.deepEqual(
		entries.map((e) => e.runner).sort(),
		[
			"ubuntu-24.04",
			"ubuntu-24.04-arm",
			"windows-2025",
			"windows-11-arm",
			"macos-15-intel",
			"macos-15",
		].sort(),
	);
	const workflow = parse(
		await readFile(".github/workflows/desktop-builds.yml", "utf8"),
	);
	assert.equal(workflow.permissions.contents, "read");
	assert.equal(workflow.jobs.application.strategy["fail-fast"], false);
	assert.equal(workflow.jobs.application["runs-on"], "${{ matrix.runner }}");
	assert.equal(workflow.jobs["windows-packages"].needs, "windows-bundle");
	const steps = workflow.jobs["windows-packages"].steps;
	const native = steps.findIndex((s) => s.run?.includes("--runtime native"));
	const pack = steps.findIndex((s) =>
		s.run?.includes("desktop-msix-pack.mjs"),
	);
	const upload = steps.findIndex(
		(s) => s.with?.name === "windows-x64-preview-and-development-msix",
	);
	assert.ok(native >= 0 && native < pack && pack < upload);
	assert.equal(steps[upload].if, undefined); // Failed validation cannot upload a usable-looking package.
	assert.equal(workflow.on.push.branches[0], "desktop-ci/**");
	assert.equal(workflow.on.release, undefined);
});
