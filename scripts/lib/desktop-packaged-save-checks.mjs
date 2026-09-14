import { checkPackagedClearUnsaved } from "./desktop-packaged-clear-unsaved.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	mkdir,
	copyFile,
	writeFile,
	readFile,
	rename,
	readdir,
	lstat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { cachedWebp } from "./desktop-packaged-quit-checks.mjs";

// All mutations go through visible controls. Only the isolated fixture is moved;
// this proves saving the retained result does not require reading the source.
export async function checkPackagedSave({
	root,
	output,
	invoke,
	js,
	change,
	choose,
	until,
	screenshot,
	checks,
	windows,
	xdotool,
}) {
	await change(".language select", "en");
	const input = join(root, "save-probe.png"),
		moved = input + ".moved";
	const collisions = join(root, "save-collisions");
	await mkdir(collisions);
	await copyFile(join(root, "sample.png"), input);
	const original = await readFile(input);
	for (let i = 1; i <= 1000; i++)
		await writeFile(
			join(collisions, `save-probe-z8-${i}.webp`),
			"existing",
			{ flag: "wx" },
		);
	await choose("button-input", input, "^Z8.Work — Select input files$");
	const task = await until(
		async () => (await invoke("queue_snapshot")).tasks[0],
		"Save probe missing",
	);
	await change(`[data-task-id="${task.id}"] select`, "webp");
	await choose(
		"button-output",
		collisions + "/",
		"^Z8.Work — Select output folder$",
	);
	await until(
		() =>
			js(
				'return !document.querySelector("[data-start-conversion]").disabled',
			),
		"Conversion disabled",
	);
	await js('document.querySelector("[data-start-conversion]").click()');
	const pending = await until(
		async () => {
			const state = await invoke("queue_snapshot"),
				t = state.tasks[0];
			if (t.phase === "failed") throw new Error(t.error);
			return !state.processing && t.phase === "awaiting_save" && t;
		},
		"Save collision did not retain output",
		120000,
	);
	assert.equal(pending.attempt, 1);
	assert.equal(pending.result, null);
	assert.match(pending.error, /Too many output filename collisions/);
	const paths = await cachedWebp(
		join(root, "cache/work.z8.desktop.m0/native-work-v1"),
	);
	assert.equal(
		paths.length,
		1,
		"Expected one retained result in isolated queue",
	);
	const retained = await readFile(paths[0]);
	const before = await invoke("queue_snapshot");
	await js('document.querySelector(".toolbar button:nth-child(2)").click()');
	const dialog = await until(
		async () => (await windows("^Z8.Work — Select output folder$"))[0],
		"Output picker missing",
	);
	await xdotool("windowfocus", dialog);
	await xdotool("key", "Escape");
	await until(
		async () =>
			(await windows("^Z8.Work — Select output folder$")).length === 0,
		"Picker did not dismiss",
	);
	await until(
		() =>
			js(
				'return !document.querySelector(".toolbar button:nth-child(2)").disabled',
			),
		"Picker cancellation did not settle",
	);
	const after = await invoke("queue_snapshot");
	assert.equal(after.output_authorized, true);
	assert.equal(before.output, collisions);
	assert.equal(after.output, before.output);
	assert.equal(after.tasks[0].phase, "awaiting_save");
	assert.equal(after.tasks[0].attempt, 1);
	assert.deepEqual(await readFile(paths[0]), retained);
	checks.push("save-picker-cancel-retains-output-grant-and-cached-bytes");
	await screenshot(
		"save-awaiting.png",
		`[data-task-id="${task.id}"] .saved-result-notice`,
	);
	await rename(input, moved);
	let saved;
	try {
		await assert.rejects(lstat(input), { code: "ENOENT" });
		await choose(
			"button-output",
			output + "/",
			"^Z8.Work — Select output folder$",
		);
		const selector = `[data-task-id="${task.id}"] [data-save-result]`;
		await until(
			() =>
				js(
					"const b=document.querySelector(arguments[0]);return b&&!b.disabled",
					[selector],
				),
			"Save-only button unavailable",
		);
		await js("document.querySelector(arguments[0]).focus()", [selector]);
		await xdotool("windowfocus", (await windows("^Z8.Work — Desktop$"))[0]);
		await xdotool("key", "Return");
		saved = await until(
			async () => {
				const state = await invoke("queue_snapshot"),
					t = state.tasks[0];
				if (t.phase === "failed") throw new Error(t.error);
				return !state.processing && t.phase === "saved" && t;
			},
			"Cached output did not save without source",
			30000,
		);
		assert.equal(saved.attempt, 2); // Save submissions also increment the attempt.
		assert.equal(dirname(saved.result.path), output);
		assert.deepEqual(await readFile(saved.result.path), retained);
		assert.equal(saved.result.bytes, retained.length);
		await assert.rejects(lstat(input), { code: "ENOENT" });
		await until(async () => {
			try {
				await lstat(paths[0]);
				return false;
			} catch (e) {
				if (e.code === "ENOENT") return true;
				throw e;
			}
		}, "Saved cache not released");
		await screenshot(
			"save-recovered.png",
			`[data-task-id="${task.id}"] .saved-path`,
		);
	} finally {
		await rename(moved, input);
	}
	assert.deepEqual(await readFile(input), original);
	assert.equal((await readdir(collisions)).length, 1000);
	for (let i = 1; i <= 1000; i++)
		assert.equal(
			await readFile(join(collisions, `save-probe-z8-${i}.webp`), "utf8"),
			"existing",
		);
	checks.push(
		"keyboard-save-only-publishes-identical-cache-with-source-unavailable",
	);
	await js('document.querySelector(".toolbar .danger").click()');
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 0,
		"Clear after save failed",
	);
	assert.deepEqual(await readFile(saved.result.path), retained);
	assert.deepEqual(await readFile(input), original);
	checks.push(
		"save-recovery-clear-keeps-result-original-and-collision-files",
	);
	await writeFile(
		join(root, "save-details.json"),
		JSON.stringify(
			{
				schema: 1,
				sourceUnavailableDuringSave: true,
				originalRestored: true,
				cacheRemovedAfterSave: true,
				collisionsPreserved: 1000,
				attemptBefore: pending.attempt,
				attemptAfter: saved.attempt,
				output: {
					bytes: retained.length,
					sha256: createHash("sha256").update(retained).digest("hex"),
				},
			},
			null,
			2,
		) + "\n",
	);
	await checkPackagedClearUnsaved({
		root,
		output,
		input,
		original,
		collisions,
		invoke,
		js,
		change,
		choose,
		until,
		screenshot,
		checks,
		windows,
		xdotool,
	});
}
