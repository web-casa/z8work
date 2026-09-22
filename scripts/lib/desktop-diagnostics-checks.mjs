import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function checkDiagnostics({
	root,
	invoke,
	js,
	until,
	screenshot,
	xdotool,
	windows,
	change,
	checks,
}) {
	const title =
		"^Z8.Work — (Save diagnostic report|保存诊断报告|Save diagnostic report / 保存诊断报告)$";
	await assert.rejects(
		invoke("save_diagnostics", { id: "invalid" }),
		/Preview.*again/,
	);
	await js(
		'document.querySelector("[data-diagnostics]").open=true;document.querySelector("[data-diagnostics-preview]").click()',
	);
	let reviewed = await until(
		() => js('return document.querySelector("#diagnostic-report")?.value'),
		"Diagnostic preview unavailable",
	);
	const snapshot = await invoke("queue_snapshot");
	const parsed = JSON.parse(reviewed);
	assert.equal(parsed.queue.tasks, snapshot.tasks.length);
	assert.equal(parsed.engines.length, 5);
	assert.equal(reviewed.includes(root), false);
	for (const task of snapshot.tasks) {
		assert.equal(reviewed.includes(task.name), false);
		assert.equal(reviewed.includes(task.id), false);
	}
	assert.equal(
		await js(
			'return document.querySelector("#diagnostic-report").readOnly',
		),
		true,
	);
	await js('document.querySelector("[data-diagnostics-select]").click()');
	assert.equal(
		await js(
			'const e=document.querySelector("#diagnostic-report");return e.selectionStart===0&&e.selectionEnd===e.value.length',
		),
		true,
	);
	checks.push(
		"diagnostic-preview-contains-only-allowlisted-summary",
		"diagnostic-text-is-readonly-and-selectable",
	);
	// A newer backend preview invalidates the older UI's save token.
	await invoke("preview_diagnostics");
	await js('document.querySelector("[data-diagnostics-save]").click()');
	await until(
		() =>
			js(
				'return document.querySelector("[data-diagnostics] .error")?.textContent.includes("again")',
			),
		"Stale report save was not rejected",
	);
	assert.equal((await windows(title)).length, 0);
	await js('document.querySelector("[data-diagnostics-preview]").click()');
	reviewed = await until(
		() => js('return document.querySelector("#diagnostic-report")?.value'),
		"Report regeneration failed",
	);
	checks.push("stale-diagnostic-token-rejected-before-picker");
	await change(".language select", "zh_hans");
	await screenshot("diagnostics-zh.png", "#diagnostic-report");
	async function openSave() {
		await js('document.querySelector("[data-diagnostics-save]").click()');
		const win = await until(
			async () => (await windows(title))[0],
			"Save report picker did not open",
		);
		await xdotool("windowfocus", win);
		return win;
	}
	await openSave();
	await xdotool("key", "Escape");
	await until(
		() =>
			js(
				'return document.querySelector("[data-diagnostics-outcome]")?.textContent.includes("已取消")',
			),
		"Report cancellation missing",
	);
	checks.push("native-report-save-cancellation-releases-modal");
	const saved = join(root, "diagnostics.json");
	await openSave();
	await xdotool("key", "ctrl+l");
	await xdotool("key", "ctrl+a");
	await xdotool("type", "--clearmodifiers", "--delay", "5", saved);
	await xdotool("key", "Return");
	await until(
		() =>
			js(
				'return document.querySelector("[data-diagnostics-outcome]")?.textContent.includes("已保存")',
			),
		"Report save did not complete",
	);
	assert.equal(await readFile(saved, "utf8"), reviewed);
	assert.equal(
		(await readdir(root)).some((name) => name.startsWith(".z8-report-")),
		false,
	);
	checks.push("native-report-save-matches-reviewed-bytes");
	await change(".language select", "en");
}
