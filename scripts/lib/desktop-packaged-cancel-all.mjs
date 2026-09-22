import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { createHash } from "node:crypto";
import { sameProcess } from "./desktop-linux-process.mjs";

export async function checkPackagedCancelAll({
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
	const existing = new Map();
	for (const name of await readdir(output))
		existing.set(name, await readFile(join(output, name)));
	await js(
		'const b=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Cancel all");if(!b||b.disabled)throw new Error("Cancel all unavailable");b.focus()',
	);
	await xdotool("windowfocus", main);
	await xdotool("key", "Return");
	const cancelled = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing && s;
		},
		"Cancel all did not settle",
		30000,
	);
	assert.equal(cancelled.tasks.length, 2);
	assert.equal(cancelled.closing, false);
	assert.equal(cancelled.clearing, false);
	for (const id of [task.id, queued.id]) {
		const t = cancelled.tasks.find((t) => t.id === id);
		assert.equal(t.phase, "cancelled");
		assert.equal(t.attempt, 1);
		assert.equal(t.result, null);
	}
	for (const child of held)
		await until(
			async () => !(await sameProcess(child)),
			"Cancel all left encoder running",
			10000,
		);
	assert.ok(await sameProcess(app));
	assert.deepEqual(
		(await readdir(output)).sort(),
		[...existing.keys()].sort(),
	);
	for (const [name, bytes] of existing)
		assert.deepEqual(await readFile(join(output, name)), bytes);
	assert.deepEqual(await readFile(input), original);
	assert.deepEqual(await readFile(queuedInput), queuedOriginal);
	await screenshot("cancel-all-stopped.png", `[data-task-id="${queued.id}"]`);
	checks.push(
		"keyboard-cancel-all-stops-running-and-queued-without-new-output",
	);
	// Explicitly retry just the small cancelled task. Do not press the batch button.
	await js(
		'const row=document.querySelector(arguments[0]);const b=[...row.querySelectorAll("button")].find(b=>b.textContent.trim()==="Retry");if(!b||b.disabled)throw new Error("Retry unavailable after cancel all");b.focus()',
		[`[data-task-id="${queued.id}"]`],
	);
	await xdotool("windowfocus", main);
	await xdotool("key", "Return");
	const resumed = await until(
		async () => {
			const s = await invoke("queue_snapshot"),
				t = s.tasks.find((t) => t.id === queued.id);
			if (t.phase === "failed") throw new Error(t.error);
			return !s.processing && t.phase === "saved" && s;
		},
		"Explicit retry after cancel all failed",
		30000,
	);
	const untouched = resumed.tasks.find((t) => t.id === task.id),
		saved = resumed.tasks.find((t) => t.id === queued.id);
	assert.equal(untouched.phase, "cancelled");
	assert.equal(untouched.attempt, 1);
	assert.equal(untouched.result, null);
	assert.equal(saved.attempt, 2);
	assert.equal(dirname(saved.result.path), output);
	const bytes = await readFile(saved.result.path);
	assert.equal(saved.result.bytes, bytes.length);
	assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
	assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
	await js(
		'window.z8AllDecoded=null;const im=new Image();im.onload=()=>window.z8AllDecoded=[im.naturalWidth,im.naturalHeight];im.onerror=()=>window.z8AllDecoded="failed";im.src=arguments[0]',
		[`data:image/webp;base64,${bytes.toString("base64")}`],
	);
	const decoded = await until(
		() => js("return window.z8AllDecoded"),
		"Retried output did not decode",
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
		"cancel-all-retried.png",
		`[data-task-id="${queued.id}"] .saved-path`,
	);
	await js('document.querySelector(".toolbar .danger").click()');
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 0,
		"Retry history clear failed",
	);
	assert.deepEqual(await readFile(saved.result.path), bytes);
	checks.push(
		"cancel-all-explicit-single-retry-saves-without-restarting-other-task",
	);
	await writeFile(
		join(root, "cancel-all-details.json"),
		JSON.stringify(
			{
				schema: 1,
				faultInjection: "SIGSTOP on observed app-owned AVIF encoder",
				beforeCancel: running,
				afterCancel: cancelled,
				afterRetry: resumed,
				observedEncoders: held,
				appRemainedOpen: true,
				observedEncodersExited: true,
				noOutputBeforeExplicitRetry: true,
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
