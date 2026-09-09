import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import {
	mkdir,
	copyFile,
	writeFile,
	readFile,
	readdir,
	unlink,
} from "node:fs/promises";
import { join } from "node:path";

export async function checkSaveRetry({
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
	xdotool,
	windows,
}) {
	const input = join(root, "save-probe.png");
	const collisions = join(root, "save-collisions"),
		destination = join(root, "save-restored");
	await mkdir(collisions);
	await mkdir(destination);
	await copyFile("tests/fixtures/cover.png", input);
	for (let i = 1; i <= 1000; i++)
		await writeFile(
			join(collisions, `save-probe-z8-${i}.webp`),
			"existing",
		);
	await choose("pick_output", collisions, "^Z8.Work — Select output folder$");
	await choose("pick_inputs", input, "^Z8.Work — Select input files$");
	const task = (await invoke("queue_snapshot")).tasks.find(
		(t) => t.name === "save-probe.png",
	);
	await invoke("set_task_format", { id: task.id, format: "webp" });
	await submit(task.id);
	const pending = await until(async () => {
		const s = await invoke("queue_snapshot");
		return !s.processing && s.tasks.find((t) => t.id === task.id);
	}, "Publication collision did not settle");
	assert.equal(pending.phase, "awaiting_save");
	assert.equal(pending.result, null);
	assert.match(pending.error, /Too many output filename collisions/);
	await change(".language select", "zh_hans");
	await until(
		() =>
			js(
				'return document.querySelector(`[data-task-id="${arguments[0]}"] [data-save-result]`)?.textContent.includes("仅重试保存")',
				[task.id],
			),
		"Save-only action missing",
	);
	await screenshot(
		"awaiting-save-zh.png",
		`[data-task-id="${task.id}"] .saved-result-notice`,
	);
	const main = (await windows("^Z8.Work — Desktop$"))[0];
	await promisify(execFile)(
		"python3",
		["scripts/lib/desktop-quit-window.py", "close", main],
		{ timeout: 5000 },
	);
	const confirmation = await until(
		async () => (await windows("^Z8.Work — 退出确认$"))[0],
		"Unsaved result did not require exit confirmation",
	);
	await xdotool("windowfocus", confirmation);
	await xdotool("key", "Escape");
	await until(
		async () => (await windows("^Z8.Work — 退出确认$")).length === 0,
		"Exit dismissal did not settle",
	);
	assert.equal(
		(await invoke("queue_snapshot")).tasks.find((t) => t.id === task.id)
			.phase,
		"awaiting_save",
	);
	checks.push(
		"unsaved-result-requires-exit-confirmation-and-survives-escape",
	);
	await change(".language select", "en");
	// Cancel a native directory change: the existing output grant and cache survive.
	await js(
		'window.savePickDone=false;window.__TAURI_INTERNALS__.invoke("pick_output").then(()=>window.savePickDone=true,e=>window.savePickError=String(e))',
	);
	const win = await until(
		async () => (await windows("^Z8.Work — Select output folder$"))[0],
		"Output picker missing",
	);
	await xdotool("windowfocus", win);
	await xdotool("key", "Escape");
	await until(
		() => js("return window.savePickDone"),
		"Output cancellation did not settle",
	);
	assert.equal(
		(await invoke("queue_snapshot")).tasks.find((t) => t.id === task.id)
			.phase,
		"awaiting_save",
	);
	await unlink(input); // A conversion retry could no longer read the input.
	await choose(
		"pick_output",
		destination,
		"^Z8.Work — Select output folder$",
	);
	await until(
		() =>
			js(
				'const b=document.querySelector(`[data-task-id="${arguments[0]}"] [data-save-result]`);return b&&!b.disabled',
				[task.id],
			),
		"Save-only action unavailable",
	);
	await js(
		'document.querySelector(`[data-task-id="${arguments[0]}"] [data-save-result]`).click()',
		[task.id],
	);
	const saved = await until(async () => {
		const s = await invoke("queue_snapshot"),
			t = s.tasks.find((t) => t.id === task.id);
		return !s.processing && t.phase === "saved" && t;
	}, "Saving cached output did not succeed");
	assert.equal(saved.attempt, 2);
	const bytes = await readFile(saved.result.path);
	assert.equal(bytes.length, saved.result.bytes);
	assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
	assert.equal((await readdir(destination)).length, 1);
	for (const name of await readdir(collisions))
		assert.equal(
			await readFile(join(collisions, name), "utf8"),
			"existing",
		);
	assert.equal((await readdir(collisions)).length, 1000);
	await screenshot(
		"saved-without-input.png",
		`[data-task-id="${task.id}"] .saved-path`,
	);
	checks.push(
		"validated-output-retained-after-publication-failure",
		"save-only-action-bilingual",
		"cancel-output-picker-keeps-cached-result",
		"save-only-succeeds-after-input-deletion",
		"saved-output-has-real-webp-bytes",
		"save-retry-preserves-all-collision-files",
	);
	await invoke("remove_tasks", { ids: [task.id] });
	assert.deepEqual(await readFile(saved.result.path), bytes);
	await choose("pick_output", output, "^Z8.Work — Select output folder$");
}
