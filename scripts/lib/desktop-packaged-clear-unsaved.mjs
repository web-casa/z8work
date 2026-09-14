import assert from "node:assert/strict";
import { readFile, readdir, lstat, writeFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import { cachedWebp } from "./desktop-packaged-quit-checks.mjs";
import { processIdentity, sameProcess } from "./desktop-linux-process.mjs";

// Reuse the isolated collision fixture after the save-only recovery checks.
export async function checkPackagedClearUnsaved({
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
}) {
	const cache = join(root, "cache/work.z8.desktop.m0/native-work-v1");
	assert.deepEqual(await cachedWebp(cache), []);
	const existing = new Map();
	for (const name of await readdir(output))
		existing.set(name, await readFile(join(output, name)));
	const main = (await windows("^Z8.Work — Desktop$"))[0];
	const app = await processIdentity(
		Number(await xdotool("getwindowpid", main)),
	);
	assert.ok(app);
	const importInput = async () => {
		await choose("button-input", input, "^Z8.Work — Select input files$");
		const task = await until(
			async () => (await invoke("queue_snapshot")).tasks[0],
			"Clear-unsaved input missing",
		);
		assert.equal(task.attempt, 0);
		await change(`[data-task-id="${task.id}"] select`, "webp");
		return task;
	};
	const start = async () => {
		await until(
			() =>
				js(
					'const b=document.querySelector("[data-start-conversion]");return b&&!b.disabled',
				),
			"Clear-unsaved conversion disabled",
		);
		await js('document.querySelector("[data-start-conversion]").focus()');
		await xdotool("windowfocus", main);
		await xdotool("key", "Return");
	};
	const first = await importInput();
	await choose(
		"button-output",
		collisions + "/",
		"^Z8.Work — Select output folder$",
	);
	await start();
	const before = await until(
		async () => {
			const s = await invoke("queue_snapshot"),
				t = s.tasks[0];
			if (t?.phase === "failed") throw new Error(t.error);
			return !s.processing && t?.phase === "awaiting_save" && s;
		},
		"Clear-unsaved collision did not retain output",
		30000,
	);
	assert.equal(before.tasks.length, 1);
	assert.equal(before.tasks[0].attempt, 1);
	assert.equal(before.tasks[0].result, null);
	assert.match(before.tasks[0].error, /Too many output filename collisions/);
	const paths = await cachedWebp(cache);
	assert.equal(paths.length, 1);
	const payload = await readFile(paths[0]);
	await screenshot(
		"clear-unsaved-awaiting.png",
		`[data-task-id="${first.id}"] .saved-result-notice`,
	);
	await js(
		'const b=document.querySelector(".toolbar .danger");if(!b||b.disabled||b.textContent.trim()!=="Clear file list")throw new Error("Clear unavailable");b.focus()',
	);
	await xdotool("windowfocus", main);
	await xdotool("key", "Return");
	const after = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing && !s.clearing && s.tasks.length === 0 && s;
		},
		"Unsaved clear did not settle",
		30000,
	);
	assert.equal(after.closing, false);
	assert.notEqual(after.epoch, before.epoch);
	assert.equal(after.output, collisions);
	assert.equal(after.output_authorized, true);
	await until(async () => {
		try {
			await lstat(paths[0]);
			return false;
		} catch (e) {
			if (e.code === "ENOENT") return true;
			throw e;
		}
	}, "Discarded cache payload remains");
	assert.deepEqual(await cachedWebp(cache), []);
	assert.ok(await sameProcess(app));
	const unchanged = async () => {
		assert.deepEqual(await readFile(input), original);
		assert.equal((await readdir(collisions)).length, 1000);
		for (let i = 1; i <= 1000; i++)
			assert.equal(
				await readFile(
					join(collisions, `save-probe-z8-${i}.webp`),
					"utf8",
				),
				"existing",
			);
		for (const [name, bytes] of existing)
			assert.deepEqual(await readFile(join(output, name)), bytes);
	};
	await unchanged();
	assert.deepEqual(
		(await readdir(output)).sort(),
		[...existing.keys()].sort(),
	);
	await screenshot("clear-unsaved-empty.png", "[data-choose-files]");
	checks.push(
		"keyboard-clear-unsaved-discards-cache-keeps-original-and-existing-results",
	);
	const fresh = await importInput();
	assert.notEqual(fresh.id, first.id);
	await choose(
		"button-output",
		output + "/",
		"^Z8.Work — Select output folder$",
	);
	await start();
	const completed = await until(
		async () => {
			const s = await invoke("queue_snapshot"),
				t = s.tasks[0];
			if (t?.phase === "failed") throw new Error(t.error);
			return !s.processing && t?.phase === "saved" && s;
		},
		"New conversion after unsaved clear failed",
		30000,
	);
	assert.equal(completed.tasks.length, 1);
	assert.equal(completed.tasks[0].id, fresh.id);
	assert.equal(completed.tasks[0].attempt, 1);
	assert.equal(completed.epoch, after.epoch);
	assert.ok(await sameProcess(app));
	const saved = completed.tasks[0].result,
		bytes = await readFile(saved.path);
	assert.equal(dirname(saved.path), output);
	assert.equal(saved.bytes, bytes.length);
	assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
	assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
	await js(
		'window.z8ClearUnsavedDecoded=null;const im=new Image();im.onload=()=>window.z8ClearUnsavedDecoded=[im.naturalWidth,im.naturalHeight];im.onerror=()=>window.z8ClearUnsavedDecoded="failed";im.src=arguments[0]',
		[`data:image/webp;base64,${bytes.toString("base64")}`],
	);
	const decoded = await until(
		() => js("return window.z8ClearUnsavedDecoded"),
		"New output did not decode",
	);
	assert.deepEqual(decoded, [
		original.readUInt32BE(16),
		original.readUInt32BE(20),
	]);
	await unchanged();
	assert.deepEqual(
		(await readdir(output)).sort(),
		[...existing.keys(), basename(saved.path)].sort(),
	);
	await screenshot(
		"clear-unsaved-new-saved.png",
		`[data-task-id="${fresh.id}"] .saved-path`,
	);
	await js('document.querySelector(".toolbar .danger").click()');
	await until(async () => {
		const s = await invoke("queue_snapshot");
		return !s.clearing && s.tasks.length === 0;
	}, "Final clear did not settle");
	assert.deepEqual(await cachedWebp(cache), []);
	assert.deepEqual(await readFile(saved.path), bytes);
	checks.push(
		"clear-unsaved-new-task-converts-without-restart-or-restored-cache",
	);
	await writeFile(
		join(root, "clear-unsaved-details.json"),
		JSON.stringify(
			{
				schema: 1,
				beforeClear: before,
				afterClear: after,
				afterNewConversion: completed,
				appRemainedOpen: true,
				cacheRemoved: true,
				collisionsPreserved: 1000,
				discardedPayload: {
					bytes: payload.length,
					sha256: createHash("sha256").update(payload).digest("hex"),
				},
				decoded,
				output: {
					file: basename(saved.path),
					bytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				},
			},
			null,
			2,
		) + "\n",
	);
}
