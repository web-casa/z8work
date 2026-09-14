import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Real WebKit and native portal UI. IPC below only inspects state/capability;
// imports, format changes, conversion and clearing use the visible controls.
export async function checkPackagedGui({
	invoke,
	js,
	change,
	choose,
	until,
	screenshot,
	checks,
	xdotool,
	windows,
	root,
	output,
	open,
	close,
}) {
	await change(".language select", "en");
	await until(
		async () => {
			const info = await invoke("desktop_info");
			return (
				info.engines.length === 5 &&
				info.engines.every((e) => e.available)
			);
		},
		"Bundled engines did not become ready",
		120000,
	);
	assert.equal(
		(await invoke("desktop_info")).processing_location,
		"device-v1",
	);
	assert.equal((await invoke("queue_snapshot")).tasks.length, 0);
	const inputTitle = "^Z8.Work — Select input files$";
	const outputTitle = "^Z8.Work — Select output folder$";
	// Cancel the actual input dialog: no imported task or implicit authorization.
	await js('document.querySelector("[data-choose-files]").click()');
	const dialog = await until(
		async () => (await windows(inputTitle))[0],
		"Input portal did not open",
	);
	await xdotool("windowfocus", dialog);
	await xdotool("key", "Escape");
	await until(
		async () => (await windows(inputTitle)).length === 0,
		"Cancelled input portal did not close",
	);
	await until(
		() =>
			js(
				'return !document.querySelector("[data-choose-files]").disabled',
			),
		"Input control stayed busy",
	);
	assert.equal((await invoke("queue_snapshot")).tasks.length, 0);
	checks.push("native-input-picker-cancel-keeps-queue-empty");

	const original = await readFile(root + "/sample.png");
	await choose("button-input", root + "/sample.png", inputTitle);
	const task = await until(
		async () => (await invoke("queue_snapshot")).tasks[0],
		"Input was not registered",
	);
	await change(`[data-task-id="${task.id}"] select`, "webp");
	await until(
		() =>
			js(
				'return !document.querySelector("[data-start-conversion]").disabled',
			),
		"Conversion button disabled after import",
	);
	// The real conversion button must open a save picker; cancelling must not convert.
	await js('document.querySelector("[data-start-conversion]").click()');
	const save = await until(
		async () => (await windows(outputTitle))[0],
		"Convert button did not open save portal",
	);
	await xdotool("windowfocus", save);
	await xdotool("key", "Escape");
	await until(
		async () => (await windows(outputTitle)).length === 0,
		"Cancelled save portal did not close",
	);
	await until(
		() =>
			js(
				'return !document.querySelector("[data-start-conversion]").disabled',
			),
		"Convert control stayed busy after cancel",
	);
	let state = await invoke("queue_snapshot");
	assert.equal(state.output_authorized, false);
	assert.equal(state.tasks[0].attempt, 0);
	checks.push("convert-button-save-picker-cancel-does-not-start");

	await choose("button-output", output + "/", outputTitle);
	await until(
		async () => (await invoke("queue_snapshot")).output_authorized,
		"Output folder was not authorized",
	);
	await until(
		() =>
			js(
				'return !document.querySelector("[data-start-conversion]").disabled',
			),
		"Conversion button unavailable",
	);
	await js('document.querySelector("[data-start-conversion]").focus()');
	const win = (await windows("^Z8.Work — Desktop$"))[0];
	await xdotool("windowfocus", win);
	await xdotool("key", "Return");
	state = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			if (s.tasks[0]?.phase === "failed")
				throw new Error(JSON.stringify(s.tasks[0].error));
			return s.tasks[0]?.phase === "saved" && s;
		},
		"Keyboard conversion did not save",
		120000,
	);
	const saved = state.tasks[0].result.path;
	const bytes = await readFile(saved);
	assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
	assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
	await js(
		'window.z8Decoded=null; const image=new Image(); image.onload=()=>window.z8Decoded=[image.naturalWidth,image.naturalHeight]; image.onerror=()=>window.z8Decoded="failed"; image.src=arguments[0]',
		[`data:image/webp;base64,${bytes.toString("base64")}`],
	);
	const decoded = await until(
		() => js("return window.z8Decoded"),
		"Saved WebP did not decode",
	);
	assert.deepEqual(decoded, [
		original.readUInt32BE(16),
		original.readUInt32BE(20),
	]);
	assert.deepEqual(await readFile(root + "/sample.png"), original);
	await screenshot("packaged-saved.png", "[data-start-conversion]");
	checks.push(
		"visible-format-and-keyboard-convert-save-decodable-webp-original-unchanged",
	);

	await change(".language select", "zh_hans");
	await close();
	await open();
	assert.equal(await js("return document.documentElement.lang"), "zh-Hans");
	state = await invoke("queue_snapshot");
	assert.equal(state.tasks.length, 1);
	assert.equal(state.output_authorized, false);
	assert.equal(state.tasks[0].authorized, false);
	assert.equal(state.tasks[0].attempt, 1);
	checks.push(
		"native-restart-restores-language-and-history-without-file-authorization",
	);
	await js('document.querySelector(".toolbar .danger").focus()');
	await xdotool("windowfocus", (await windows("^Z8.Work — Desktop$"))[0]);
	await xdotool("key", "Return");
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 0,
		"Keyboard clear failed",
	);
	assert.deepEqual(await readFile(saved), bytes);
	assert.deepEqual(await readFile(root + "/sample.png"), original);
	await screenshot("packaged-cleared.png", "[data-choose-files]");
	checks.push("keyboard-clear-retains-original-and-saved-result");
}
