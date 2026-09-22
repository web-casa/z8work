import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { createHash } from "node:crypto";
import { sameProcess } from "./desktop-linux-process.mjs";
export async function checkPackagedClearActive({
	root,
	output,
	input,
	original,
	queuedInput,
	queuedOriginal,
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
	choose,
	change,
}) {
	const existing = new Map();
	for (const name of await readdir(output))
		existing.set(name, await readFile(join(output, name)));
	await js(
		'const b=document.querySelector(".toolbar .danger");if(!b||b.disabled||b.textContent.trim()!=="Clear file list")throw new Error("Clear list unavailable");b.focus()',
	);
	await xdotool("windowfocus", main);
	await xdotool("key", "Return");
	const cleared = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing && !s.clearing && s.tasks.length === 0 && s;
		},
		"Active clear did not settle",
		30000,
	);
	assert.equal(cleared.closing, false);
	assert.notEqual(cleared.epoch, running.epoch);
	assert.equal(cleared.output_authorized, true);
	assert.equal(cleared.output, output);
	assert.ok(await sameProcess(app));
	for (const child of held)
		await until(
			async () => !(await sameProcess(child)),
			"Cleared encoder remained alive",
			10000,
		);
	assert.deepEqual(
		(await readdir(output)).sort(),
		[...existing.keys()].sort(),
	);
	for (const [name, bytes] of existing)
		assert.deepEqual(await readFile(join(output, name)), bytes);
	assert.deepEqual(await readFile(input), original);
	assert.deepEqual(await readFile(queuedInput), queuedOriginal);
	await screenshot("clear-active-empty.png", "[data-choose-files]");
	checks.push(
		"keyboard-clear-active-removes-running-and-queued-without-deleting-files",
	);
	await choose("button-input", queuedInput, "^Z8.Work — Select input files$");
	const imported = await until(async () => {
		const s = await invoke("queue_snapshot");
		return s.tasks.length === 1 && s.tasks[0];
	}, "New input not accepted after clear");
	assert.ok(!running.tasks.some((t) => t.id === imported.id));
	assert.equal(imported.attempt, 0);
	await change(`[data-task-id="${imported.id}"] select`, "webp");
	await until(
		() =>
			js(
				'const b=document.querySelector("[data-start-conversion]");return !!b&&!b.disabled',
			),
		"Convert did not become available after clear",
	);
	await js('document.querySelector("[data-start-conversion]").focus()');
	await xdotool("windowfocus", main);
	await xdotool("key", "Return");
	const completed = await until(
		async () => {
			const s = await invoke("queue_snapshot"),
				t = s.tasks[0];
			if (t.phase === "failed") throw new Error(t.error);
			return !s.processing && t.phase === "saved" && s;
		},
		"Conversion after clear failed",
		30000,
	);
	assert.equal(completed.tasks.length, 1);
	assert.equal(completed.epoch, cleared.epoch);
	assert.equal(completed.tasks[0].id, imported.id);
	assert.equal(completed.tasks[0].attempt, 1);
	assert.ok(await sameProcess(app));
	const saved = completed.tasks[0];
	assert.equal(dirname(saved.result.path), output);
	const bytes = await readFile(saved.result.path);
	assert.equal(saved.result.bytes, bytes.length);
	assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
	assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
	await js(
		'window.z8ClearDecoded=null;const im=new Image();im.onload=()=>window.z8ClearDecoded=[im.naturalWidth,im.naturalHeight];im.onerror=()=>window.z8ClearDecoded="failed";im.src=arguments[0]',
		[`data:image/webp;base64,${bytes.toString("base64")}`],
	);
	const decoded = await until(
		() => js("return window.z8ClearDecoded"),
		"Post-clear output did not decode",
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
		"clear-active-new-saved.png",
		`[data-task-id="${imported.id}"] .saved-path`,
	);
	await js('document.querySelector(".toolbar .danger").click()');
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 0,
		"Final clear failed",
	);
	assert.deepEqual(await readFile(saved.result.path), bytes);
	checks.push(
		"clear-active-workspace-accepts-new-conversion-without-restart",
	);
	await writeFile(
		join(root, "clear-active-details.json"),
		JSON.stringify(
			{
				schema: 1,
				faultInjection: "SIGSTOP on observed app-owned AVIF encoder",
				beforeClear: running,
				afterClear: cleared,
				afterNewConversion: completed,
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
