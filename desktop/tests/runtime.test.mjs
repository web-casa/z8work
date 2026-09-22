import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	failureCodes,
	failureMessage,
	commandError,
	taskReadiness,
} from "../src/platform/runtime.ts";
import { parseSnapshot } from "../src/platform/queue-contract.ts";
test("readiness isolates slow and failed engines while saving needs none", () => {
	const states = [
		{ id: "magick", phase: "preparing" },
		{ id: "ffmpeg", phase: "ready" },
		{ id: "ffprobe", phase: "ready" },
		{ id: "pandoc", phase: "failed" },
	];
	assert.equal(
		taskReadiness({ name: "a.png", phase: "ready" }, states),
		"preparing",
	);
	assert.equal(
		taskReadiness({ name: "a.mp3", phase: "ready" }, states),
		"ready",
	);
	assert.equal(
		taskReadiness({ name: "a.md", phase: "ready" }, states),
		"failed",
	);
	assert.equal(
		taskReadiness({ name: "a.png", phase: "awaiting_save" }, []),
		"ready",
	);
});
test("public failure copy is bilingual and never echoes raw engine logs", () => {
	for (const code of failureCodes) {
		assert.ok(failureMessage(code, false));
		assert.ok(failureMessage(code, true));
	}
	assert.equal(
		commandError("Engine failed /private/input.png <script>", true),
		failureMessage("conversion", true),
	);
	assert.equal(
		commandError("Z8:preparing", false),
		failureMessage("preparing", false),
	);
});
test("progress snapshot rejects stale attempts, completion percentages and log payloads", async () => {
	const fixture = JSON.parse(
		await readFile(
			new URL("./fixtures/queue-snapshot.json", import.meta.url),
			"utf8",
		),
	);
	fixture.schema = 3;
	fixture.tasks[0].phase = "running";
	const progress = {
		id: fixture.tasks[0].id,
		attempt: fixture.tasks[0].attempt,
		value: { stage: "encoding", percent: 42 },
	};
	assert.equal(
		parseSnapshot({ ...fixture, progress }).progress.value.percent,
		42,
	);
	for (const p of [
		{ ...progress, attempt: 99 },
		{ ...progress, value: { stage: "encoding", percent: 100 } },
		{ ...progress, value: { stage: "engine logs", percent: null } },
	])
		assert.throws(() => parseSnapshot({ ...fixture, progress: p }));
	assert.throws(() =>
		parseSnapshot({
			...fixture,
			failures: { [progress.id]: "secret log" },
		}),
	);
});

test("failure vocabulary matches the shared Rust fixture", async () => {
	const fixture = JSON.parse(
		await readFile(
			new URL("./fixtures/runtime-contract.json", import.meta.url),
			"utf8",
		),
	);
	assert.deepEqual(failureCodes, fixture.failures);
});
