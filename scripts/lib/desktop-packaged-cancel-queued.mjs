import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sameProcess, signalEncoder } from "./desktop-linux-process.mjs";
const execute = promisify(execFile);
export async function checkPackagedCancelQueued({
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
	executable,
	magick,
	prefix,
	env,
}) {
	const existing = new Map();
	for (const name of await readdir(output))
		existing.set(name, await readFile(join(output, name)));
	await js(
		'const row=document.querySelector(arguments[0]);const b=[...row.querySelectorAll("button")].find(b=>b.textContent.trim()==="Cancel task");if(!b||b.disabled)throw new Error("Queued cancel unavailable");b.focus()',
		[`[data-task-id="${queued.id}"]`],
	);
	await xdotool("windowfocus", main);
	await xdotool("key", "Return");
	const cancelled = await until(async () => {
		const s = await invoke("queue_snapshot");
		return (
			s.tasks.find((t) => t.id === queued.id)?.phase === "cancelled" && s
		);
	}, "Queued cancellation did not settle");
	assert.equal(cancelled.tasks.length, 2);
	assert.equal(cancelled.processing, true);
	assert.equal(cancelled.closing, false);
	const pending = cancelled.tasks.find((t) => t.id === queued.id),
		active = cancelled.tasks.find((t) => t.id === task.id);
	assert.equal(pending.attempt, 1);
	assert.equal(pending.result, null);
	assert.equal(active.phase, "running");
	assert.equal(active.attempt, 1);
	for (const child of held)
		assert.equal((await sameProcess(child))?.state, "T");
	assert.ok(await sameProcess(app));
	assert.deepEqual(
		(await readdir(output)).sort(),
		[...existing.keys()].sort(),
	);
	await screenshot(
		"cancel-queued-stopped.png",
		`[data-task-id="${queued.id}"]`,
	);
	checks.push(
		"keyboard-cancel-queued-leaves-active-encoder-and-task-running",
	);
	// Release only the injected pause. The application must finish the same attempt.
	for (const child of held)
		assert.equal(
			await signalEncoder(child, app.pid, executable, "SIGCONT", magick),
			true,
		);
	const completed = await until(
		async () => {
			const s = await invoke("queue_snapshot"),
				t = s.tasks.find((t) => t.id === task.id);
			if (["failed", "cancelled"].includes(t.phase))
				throw new Error(JSON.stringify(t));
			return !s.processing && t.phase === "saved" && s;
		},
		"Active conversion did not finish after queued cancellation",
		120000,
	);
	assert.equal(completed.tasks.length, 2);
	assert.equal(completed.closing, false);
	assert.ok(await sameProcess(app));
	const saved = completed.tasks.find((t) => t.id === task.id),
		skipped = completed.tasks.find((t) => t.id === queued.id);
	assert.equal(saved.attempt, 1);
	assert.equal(skipped.phase, "cancelled");
	assert.equal(skipped.attempt, 1);
	assert.equal(skipped.result, null);
	for (const child of held)
		await until(
			async () => !(await sameProcess(child)),
			"Completed encoder remained alive",
			10000,
		);
	assert.equal(dirname(saved.result.path), output);
	const bytes = await readFile(saved.result.path);
	assert.equal(bytes.length, saved.result.bytes);
	assert.equal(bytes.toString("ascii", 4, 8), "ftyp");
	assert.ok(
		bytes.subarray(8, 32).includes(Buffer.from("avif")),
		"Output is not AVIF branded",
	);
	const decoded = (
		await execute(
			executable,
			[...prefix, saved.result.path, "-format", "%w %h", "info:"],
			{ timeout: 30000, env },
		)
	).stdout
		.trim()
		.split(/\s+/)
		.map(Number);
	assert.deepEqual(decoded, [
		original.readUInt32BE(16),
		original.readUInt32BE(20),
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
		"cancel-queued-active-saved.png",
		`[data-task-id="${task.id}"] .saved-path`,
	);
	await js('document.querySelector(".toolbar .danger").click()');
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 0,
		"Queued cancel history clear failed",
	);
	assert.deepEqual(await readFile(saved.result.path), bytes);
	checks.push(
		"cancel-queued-active-attempt-finishes-as-decodable-avif-without-queued-output",
	);
	await writeFile(
		join(root, "cancel-queued-details.json"),
		JSON.stringify(
			{
				schema: 1,
				faultInjection:
					"SIGSTOP then SIGCONT on observed app-owned AVIF encoder",
				beforeCancel: running,
				afterQueuedCancel: cancelled,
				afterCompletion: completed,
				observedEncoders: held,
				appRemainedOpen: true,
				decoded,
				decoder: "bundled ImageMagick",
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
