import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { taskReadiness } from "../src/platform/runtime.ts";
const json = async (path) =>
	JSON.parse(
		await readFile(new URL(`../../${path}`, import.meta.url), "utf8"),
	);
test("every native architecture audits a fingerprinted complete package rather than an application-only archive", async () => {
	const matrix = await json("packaging/desktop/ci-matrix.json");
	const sources = await json("packaging/desktop/capability-sources.json");
	assert.deepEqual(
		sources.map((s) => s.id).sort(),
		matrix.map((s) => s.id).sort(),
	);
	for (const s of sources) {
		assert.match(s.sha256, /^[a-f0-9]{64}$/);
		assert.match(s.run, /^\d+$/);
		assert.ok(!s.artifact.includes("application-only"));
		assert.equal(s.runner, matrix.find((m) => m.id === s.id).runner);
		assert.equal(s.target, matrix.find((m) => m.id === s.id).target);
		assert.equal(s.arch, s.id.endsWith("arm64") ? "arm64" : "x64");
	}
});
test("frontend readiness uses reviewed routes and rejects unknown inputs even when all engines are ready", async () => {
	const scope = await json("packaging/desktop/v1-scope.json");
	const states = ["magick", "mutool", "ffmpeg", "ffprobe", "pandoc"].map(
		(id) => ({ id, phase: "ready", failure: null }),
	);
	for (const g of scope.groups)
		for (const ext of g.inputs) {
			const task = { name: `file.${ext.toUpperCase()}`, phase: "ready" };
			assert.equal(taskReadiness(task, states), "ready");
			for (const needed of g.engines)
				assert.equal(
					taskReadiness(
						task,
						states.filter((s) => s.id !== needed),
					),
					"preparing",
				);
		}
	assert.equal(
		taskReadiness({ name: "file.xlsx", phase: "ready" }, states),
		"failed",
	);
	assert.equal(
		taskReadiness({ name: "file.xlsx", phase: "awaiting_save" }, states),
		"ready",
	);
});
