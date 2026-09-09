import assert from "node:assert/strict";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";

export async function checkImports(h) {
	const {
		root,
		choose,
		invoke,
		js,
		until,
		change,
		screenshot,
		reload,
		checks,
		preview,
	} = h;
	const folder = join(root, "mixed-import");
	await mkdir(folder);
	const png = join(folder, "有效图片.png"),
		doc = join(folder, "notes.md"),
		bad = join(folder, "ignored <b>.xyz");
	await copyFile("tests/fixtures/cover.png", png);
	await writeFile(doc, "# Local document\n");
	await writeFile(bad, "Unsupported test input\n");
	// Use the native file list to select all three generated files.
	await choose(
		"pick_inputs",
		folder + "/",
		"^Z8.Work — Select input files$",
		true,
	);
	const s = await invoke("queue_snapshot"),
		report = s.import_report;
	assert.ok(report);
	assert.equal(report.accepted, 2);
	assert.equal(report.issues.length, 1);
	assert.equal(report.issues[0].name, "ignored <b>.xyz");
	assert.equal(report.issues[0].reason, "unsupported");
	assert.equal(s.tasks.length, 2);
	assert.ok(
		s.tasks.every(
			(t) => t.authorized && t.phase === "ready" && t.attempt === 0,
		),
	);
	assert.equal(s.output_authorized, false);
	await until(
		() => js('return !!document.querySelector("[data-import-report]")'),
		"Import report not displayed",
	);
	assert.match(
		await js(
			'return document.querySelector("[data-import-report]").textContent',
		),
		/Added\s+2/,
	);
	assert.equal(
		await js('return !!document.querySelector("[data-import-report] b")'),
		false,
	);
	const imageTask = s.tasks.find((t) => t.name === "有效图片.png");
	await preview(imageTask.id);
	await js('document.querySelector("[data-preview-close]").click()');
	await change(".language select", "zh_hans");
	await screenshot("import-report-zh.png", "[data-import-report]");
	assert.match(
		await js(
			'return document.querySelector("[data-import-report]").textContent',
		),
		/暂不支持此格式/,
	);
	await reload();
	await until(
		() => js('return !!document.querySelector("[data-import-report]")'),
		"Reload lost the last import result",
	);
	assert.equal((await invoke("queue_snapshot")).import_report.id, report.id);
	// A later unsuccessful import replaces the report but preserves good tasks.
	await choose("pick_inputs", bad, "^Z8.Work — Select input files$");
	const next = await invoke("queue_snapshot");
	assert.equal(next.tasks.length, 2);
	assert.equal(next.import_report.accepted, 0);
	assert.equal(next.import_report.issues.length, 1);
	assert.notEqual(next.import_report.id, report.id);
	await invoke("dismiss_import_report", { id: report.id });
	assert.equal(
		(await invoke("queue_snapshot")).import_report.id,
		next.import_report.id,
	);
	await until(
		async () =>
			/已添加\s+0/.test(
				await js(
					'return document.querySelector("[data-import-report]")?.textContent || ""',
				),
			),
		"Newest import result not displayed",
	);
	await js('document.querySelector("[data-import-dismiss]").click()');
	await until(
		async () => !(await invoke("queue_snapshot")).import_report,
		"Import dismissal did not reach native state",
	);
	await reload();
	assert.equal(
		await js('return !!document.querySelector("[data-import-report]")'),
		false,
	);
	await invoke("remove_tasks", { ids: s.tasks.map((t) => t.id) });
	await change(".language select", "en");
	checks.push(
		"native-mixed-selection-imports-valid-peers",
		"import-report-escapes-file-names-and-localizes-reasons",
		"mixed-import-can-preview-without-output-grant",
		"import-report-survives-ui-reload",
		"all-rejected-import-preserves-existing-tasks",
		"stale-dismiss-cannot-erase-newer-import-report",
		"dismissed-import-report-stays-dismissed-after-reload",
	);
}
