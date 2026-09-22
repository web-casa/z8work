import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { createHash } from "node:crypto";
import { sameProcess } from "./desktop-linux-process.mjs";

export async function checkPackagedCancelCurrent({
	action = "cancel-current",
	root,
	output,
	input,
	original,
	queuedInput,
	queuedOriginal,
	task,
	queued,
	running,
	held,
	app,
	invoke,
	js,
	until,
	screenshot,
	checks,
	xdotool,
	main,
}) {
	assert.ok(["cancel-current", "remove-current"].includes(action));
	const removing = action === "remove-current";
	const existing = new Map();
	for (const name of await readdir(output))
		existing.set(name, await readFile(join(output, name)));
	// Resolve the actual row action by its visible label; never send mutation IPC.
	await js(
		'const row=document.querySelector(arguments[0]);const button=[...row.querySelectorAll("button")].find(b=>b.textContent.trim()===arguments[1]);if(!button||button.disabled)throw new Error("Task action unavailable");button.focus()',
		[
			`[data-task-id="${task.id}"]`,
			removing ? "Remove task" : "Cancel task",
		],
	);
	await xdotool("windowfocus", main);
	await xdotool("key", "Return");
	const completed = await until(
		async () => {
			const state = await invoke("queue_snapshot");
			const next = state.tasks.find((t) => t.id === queued.id);
			if (next?.phase === "failed") throw new Error(next.error);
			return !state.processing && next?.phase === "saved" && state;
		},
		"Current task action did not let queued task save",
		30000,
	);
	assert.equal(completed.tasks.length, removing ? 1 : 2);
	const cancelled = completed.tasks.find((t) => t.id === task.id),
		saved = completed.tasks.find((t) => t.id === queued.id);
	if (removing) {
		assert.equal(cancelled, undefined);
		assert.equal(completed.epoch, running.epoch);
		assert.equal(completed.clearing, false);
		assert.equal(completed.output, output);
		assert.equal(completed.output_authorized, true);
	} else {
		assert.equal(cancelled.phase, "cancelled");
		assert.equal(cancelled.attempt, 1);
		assert.equal(cancelled.result, null);
	}
	assert.equal(saved.attempt, 1);
	assert.equal(completed.closing, false);
	assert.ok(await sameProcess(app), "App exited on task action");
	for (const child of held)
		await until(
			async () => !(await sameProcess(child)),
			"Stopped encoder survived",
			10000,
		);
	assert.equal(dirname(saved.result.path), output);
	const bytes = await readFile(saved.result.path);
	assert.equal(bytes.length, saved.result.bytes);
	assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
	assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
	await js(
		'window.z8CancelDecoded=null;const image=new Image();image.onload=()=>window.z8CancelDecoded=[image.naturalWidth,image.naturalHeight];image.onerror=()=>window.z8CancelDecoded="failed";image.src=arguments[0]',
		[`data:image/webp;base64,${bytes.toString("base64")}`],
	);
	const decoded = await until(
		() => js("return window.z8CancelDecoded"),
		"Queued WebP did not decode",
	);
	assert.deepEqual(decoded, [
		queuedOriginal.readUInt32BE(16),
		queuedOriginal.readUInt32BE(20),
	]);
	assert.deepEqual(
		(await readdir(output)).sort(),
		[...existing.keys(), basename(saved.result.path)].sort(),
	);
	for (const [name, old] of existing)
		assert.deepEqual(await readFile(join(output, name)), old);
	assert.deepEqual(await readFile(input), original);
	assert.deepEqual(await readFile(queuedInput), queuedOriginal);
	await screenshot(
		`${action}-saved.png`,
		`[data-task-id="${queued.id}"] .saved-path`,
	);
	checks.push(
		removing
			? "keyboard-remove-current-reaps-encoder-removes-record-and-queued-task-saves"
			: "keyboard-cancel-current-reaps-encoder-and-queued-task-saves",
	);
	await js('document.querySelector(".toolbar .danger").click()');
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 0,
		"Task action scenario did not clear",
	);
	assert.deepEqual(await readFile(saved.result.path), bytes);
	assert.deepEqual(await readFile(input), original);
	assert.deepEqual(await readFile(queuedInput), queuedOriginal);
	checks.push(
		removing
			? "remove-current-keeps-batch-originals-and-decodable-next-output"
			: "cancel-current-keeps-originals-existing-results-and-decodable-next-output",
	);
	await writeFile(
		join(root, `${action}-details.json`),
		JSON.stringify(
			{
				schema: 1,
				faultInjection: "SIGSTOP on observed app-owned AVIF encoder",
				...(removing
					? { beforeRemoval: running }
					: { beforeCancel: running }),
				afterCompletion: completed,
				observedEncoders: held,
				appRemainedOpen: true,
				observedEncodersExited: true,
				decoded,
				output: {
					file: basename(saved.result.path),
					bytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				},
			},
			null,
			2,
		) + "\n",
	);
}
