import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	parseSnapshot,
	submissionItems,
} from "../src/platform/queue-contract.ts";
import { storageMessage } from "../src/platform/storage-message.ts";

test("queue schema 3 supports saving without granting input permission or claiming saved output", async () => {
	const fixture = JSON.parse(
		await readFile(
			new URL("./fixtures/queue-snapshot.json", import.meta.url),
			"utf8",
		),
	);
	for (const phase of ["awaiting_save", "saving"]) {
		const value = structuredClone(fixture);
		value.schema = 3;
		value.tasks[0].phase = phase;
		value.tasks[0].authorized = false;
		value.tasks[0].result = null;
		const task = parseSnapshot(value).tasks[0];
		assert.equal(task.authorized, false);
		assert.equal(task.result, null);
		assert.equal(
			submissionItems([task])[0].save_only,
			phase === "awaiting_save",
		);
	}
	assert.equal(parseSnapshot(fixture).schema, 2);
	for (const schema of ["3", 4])
		assert.throws(() => parseSnapshot({ ...fixture, schema }));
});

test("save retry requests bind attempt and settings while normal retry stays a conversion", async () => {
	const fixture = JSON.parse(
		await readFile(
			new URL("./fixtures/queue-snapshot.json", import.meta.url),
			"utf8",
		),
	);
	const task = { ...fixture.tasks[0], phase: "awaiting_save", attempt: 4 };
	assert.deepEqual(submissionItems([task]), [
		{
			id: task.id,
			format: task.format,
			expected_attempt: 4,
			options: task.options,
			save_only: true,
		},
	]);
	assert.equal(
		submissionItems([{ ...task, phase: "failed" }])[0].save_only,
		false,
	);
	for (const message of [
		"Saved result expired or unavailable; convert again",
		"Saved result changed or is unreadable; convert again",
		"Saved-result cache is full; convert again after saving or removing other tasks",
	]) {
		assert.match(storageMessage(message, false), /重新转换/);
		assert.equal(storageMessage(message, true), message);
	}
});
