import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
export async function checkMacGui({
	root,
	helper,
	run,
	record,
	report,
	pid,
	app,
	hash,
	setPid,
}) {
	const tree = () => JSON.parse(run(helper, ["tree", String(pid)]));
	const flat = (t) => [t, ...(t.children ?? []).flatMap(flat)];
	const has = (t, text) =>
		flat(t).some((n) =>
			[n.AXTitle, n.AXValue, n.AXDescription].includes(text),
		);
	const until = async (fn, label, ms = 30000) => {
		const end = Date.now() + ms;
		while (Date.now() < end) {
			const r = await fn();
			if (r) return r;
			await delay(400);
		}
		throw new Error(label);
	};
	const press = (title, role = "AXButton") =>
		run(helper, ["press", String(pid), role, title]);
	const key = (k) =>
		run("osascript", [
			"-e",
			`tell application "System Events" to key code ${{ go: 5, return: 36, escape: 53 }[k]}${k === "go" ? " using {command down, shift down}" : ""}`,
		]);
	const shot = (name) => {
		if (report.environment.screenCaptureAllowed)
			run("screencapture", ["-x", join(root, name + ".png")]);
	};
	const snapshot = async (name) => {
		const t = tree();
		await record(name + ".json", t);
		shot(name);
		return t;
	};
	const input = join(root, "测试 image.png"),
		output = join(root, "输出 results");
	await mkdir(output);
	run(helper, ["fixture", input]);
	const original = await readFile(input);
	const openPicker = async (label) => {
		press(label);
		await until(() => has(tree(), "Cancel"), "Picker did not open");
	};
	const choose = async (label, path) => {
		await openPicker(label);
		key("go");
		await delay(500);
		await record("picker-go.json", tree());
		run(helper, [
			"set-text",
			String(pid),
			"AXTextField",
			"PathTextField",
			path,
		]);
		await until(
			() =>
				flat(tree()).some(
					(n) =>
						n.AXIdentifier === "PathTextField" &&
						n.AXValue === path,
				),
			"Native path field value mismatch",
		);
		await delay(500);
		await record("picker-typed.json", tree());
		key("return");
		await delay(700);
		key("return");
		await until(() => !has(tree(), "Cancel"), "Picker did not close");
	};
	assert.ok(has(tree(), "Start with a few small files"));
	await openPicker("Choose files");
	await snapshot("input-picker");
	press("Cancel");
	await until(() => !has(tree(), "Cancel"), "Input cancel did not close");
	assert.ok(has(tree(), "Start with a few small files"));
	report.checks.push("native-input-picker-cancel-keeps-empty-workspace");
	await choose("Choose files", input);
	await until(() => has(tree(), "测试 image.png"), "Selected input missing");
	await snapshot("imported");
	press("测试 image.png output format", "AXPopUpButton");
	await delay(400);
	await record("format-menu.json", tree());
	press("WEBP", "AXMenuItem");
	await until(
		() =>
			flat(tree()).some(
				(n) => n.AXRole === "AXPopUpButton" && n.AXValue === "WEBP",
			),
		"Output format did not change",
	);
	await openPicker("Choose save folder and convert");
	press("Cancel");
	await until(() => !has(tree(), "Cancel"), "Output cancel did not close");
	assert.deepEqual(await readdir(output), []);
	assert.ok(!has(tree(), "Saved· Attempt 1"));
	report.checks.push("conversion-output-picker-cancel");
	await choose("Save folder", output + "/");
	await snapshot("output-selected");
	press("Convert unfinished files");
	await until(
		async () => {
			const names = await readdir(output);
			return names.some((n) => n.endsWith(".webp"));
		},
		"No converted output",
		60000,
	);
	const saved = join(
		output,
		(await readdir(output)).find((n) => n.endsWith(".webp")),
	);
	const bytes = await readFile(saved);
	assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
	assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
	const decoded = JSON.parse(run(helper, ["decode", saved]));
	assert.deepEqual(decoded, { width: 32, height: 32 });
	assert.deepEqual(await readFile(input), original);
	const complete = await until(() => {
		const t = tree();
		return (
			flat(t).some(
				(n) =>
					String(n.AXValue ?? "").includes("Saved") &&
					String(n.AXValue).includes("Attempt 1"),
			) && t
		);
	}, "Saved UI state missing");
	await record("saved-tree.json", complete);
	shot("saved");
	report.result = { file: saved, ...(await hash(saved)), decoded };
	report.checks.push(
		"native-pickers-unicode-path-webp-conversion-and-real-decode",
	);
	const quit = async () => {
		run(helper, ["quit", String(pid)]);
		await until(() => {
			try {
				process.kill(pid, 0);
				return false;
			} catch (e) {
				if (e.code === "ESRCH") return true;
				throw e;
			}
		}, "Native quit did not finish");
	};
	await quit();
	report.checks.push("native-idle-quit");
	const launched = JSON.parse(run(helper, ["launch", app]));
	pid = launched.pid;
	setPid(pid);
	await until(() => has(tree(), "测试 image.png"), "History did not restore");
	const restarted = await snapshot("restarted");
	assert.ok(has(restarted, "Choose file again"));
	assert.ok(
		flat(restarted).some((n) =>
			String(n.AXValue ?? "").includes(
				"Choose the folder again to authorize",
			),
		),
	);
	assert.deepEqual(await readFile(saved), bytes);
	report.checks.push("restart-history-without-input-output-authorization");
	press("Clear file list");
	await until(
		() => has(tree(), "Start with a few small files"),
		"Clear did not settle",
	);
	assert.deepEqual(await readFile(saved), bytes);
	assert.deepEqual(await readFile(input), original);
	await snapshot("cleared");
	report.checks.push("clear-keeps-original-and-saved-result");
	await quit();
	setPid(undefined);
	report.exit = "terminated";
	report.gui = "passed";
}
