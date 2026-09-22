import assert from "node:assert/strict";
import { readFile, readdir, chmod, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

export async function checkStorage({
	root,
	output,
	choose,
	invoke,
	submit,
	until,
	js,
	change,
	screenshot,
	checks,
}) {
	const originals = new Map();
	for (const name of await readdir(output))
		originals.set(
			name,
			createHash("sha256")
				.update(await readFile(join(output, name)))
				.digest("hex"),
		);
	const input = join(root, "storage-probe.png");
	await copyFile("tests/fixtures/cover.png", input);
	const original = await readFile(input);
	await choose(
		"pick_inputs",
		input,
		"^Z8.Work — (Select input files|选择输入文件|Select input files / 选择输入文件)$",
	);
	const task = (await invoke("queue_snapshot")).tasks.find(
		(t) => t.name === "storage-probe.png",
	);
	await invoke("set_task_format", { id: task.id, format: "webp" });
	try {
		// Permission changes after the user selects this folder. No disk is filled.
		await chmod(output, 0o500);
		await submit(task.id);
		const failed = await until(async () => {
			const state = await invoke("queue_snapshot");
			return (
				!state.processing && state.tasks.find((t) => t.id === task.id)
			);
		}, "Unwritable output did not settle");
		assert.equal(failed.phase, "failed");
		assert.match(failed.error, /^Cannot write to output folder:/);
		assert.equal(failed.result, null);
		assert.deepEqual(
			(await readdir(output)).sort(),
			[...originals.keys()].sort(),
		);
		await change(".language select", "zh_hans");
		await until(
			() =>
				js(
					'return document.querySelector(`[data-task-id="${arguments[0]}"] .error`)?.textContent.includes("保存目录无法写入")',
					[task.id],
				),
			"Localized storage error missing",
		);
		await screenshot(
			"storage-error-zh.png",
			`[data-task-id="${task.id}"] .error`,
		);
		await change(".language select", "en");
		assert.match(
			await js(
				'return document.querySelector(`[data-task-id="${arguments[0]}"] .error`).textContent',
				[task.id],
			),
			/output folder is not writable/,
		);
		checks.push(
			"output-permission-change-fails-before-publishing",
			"storage-errors-localized-with-retry-advice",
		);
	} finally {
		await chmod(output, 0o700);
	}
	await submit(task.id);
	const saved = await until(async () => {
		const state = await invoke("queue_snapshot");
		return !state.processing && state.tasks.find((t) => t.id === task.id);
	}, "Storage retry did not settle");
	assert.equal(saved.phase, "saved");
	assert.equal(saved.attempt, 2);
	assert.ok(saved.result.bytes > 0);
	assert.deepEqual(await readFile(input), original);
	for (const [name, hash] of originals)
		assert.equal(
			createHash("sha256")
				.update(await readFile(join(output, name)))
				.digest("hex"),
			hash,
		);
	assert.equal(
		(await readdir(output)).some(
			(name) =>
				name.startsWith(".z8-write-check-") || name.startsWith(".tmp"),
		),
		false,
	);
	checks.push(
		"retry-after-permission-repair-saves-result",
		"storage-checks-preserve-input-and-prior-results",
		"write-probe-leaves-no-files",
	);
	await invoke("remove_tasks", { ids: [task.id] });
}
