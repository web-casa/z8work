import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	readFile,
	writeFile,
	mkdir,
	readdir,
	lstat,
	rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
assert.equal(process.platform, "darwin");
assert.equal(process.arch, "arm64");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const root = resolve(".desktop-local/macos-web-gui");
await mkdir(root, { recursive: true });
const source = resolve(".desktop-local/macos-web-input");
const report = {
	status: "running",
	sourceRun: "35501918930",
	toolCommit: process.env.GITHUB_SHA,
	checks: [],
};
const run = (bin, args, timeout = 60000) =>
	execFileSync(bin, args, {
		encoding: "utf8",
		timeout,
		maxBuffer: 16 * 1024 * 1024,
	}).trim();
const record = (name, data) =>
	writeFile(join(root, name + ".json"), JSON.stringify(data, null, 2) + "\n");
const hash = async (path) =>
	createHash("sha256")
		.update(await readFile(path))
		.digest("hex");
const zip = join(source, "Z8.Work-0.2.0-macos-arm64-preview.app.zip");
assert.equal(
	await hash(zip),
	"c6e2cd530e66cbd8246b5132f330c2b93f2a0db632995433ae85ded9c3b417cd",
);
const app = "/Applications/Z8.Work Desktop Dev.app";
const helper = join(root, "ax-helper");
let installed = false,
	pid;
const flat = (t) => [t, ...(t.children ?? []).flatMap(flat)];
const tree = () => JSON.parse(run(helper, ["tree", String(pid)]));
const has = (text) =>
	flat(tree()).some((n) =>
		[n.AXTitle, n.AXDescription, n.AXValue, n.AXIdentifier].includes(text),
	);
const until = async (fn, label, ms = 30000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (await fn()) return;
		await delay(300);
	}
	throw Error(label);
};
const press = (label, role = "AXButton", index = 0) =>
	run(helper, ["press-at", String(pid), role, label, String(index)]);
const key = (code, modifiers = "") =>
	run("osascript", [
		"-e",
		`tell application "System Events" to key code ${code}${modifiers ? ` using {${modifiers}}` : ""}`,
	]);
async function snapshot(name) {
	await record(name, tree());
	if (report.environment.screenCaptureAllowed)
		run("screencapture", ["-x", join(root, name + ".png")]);
}
async function picker(label, path, save = false) {
	press(label);
	await until(() => has("Cancel"), "Native picker not open");
	if (!path) return;
	key(5, "command down, shift down");
	await until(() => has("PathTextField"), "Native path field unavailable");
	run(helper, [
		"set-text",
		String(pid),
		"AXTextField",
		"PathTextField",
		path,
	]);
	await delay(500);
	key(36);
	await until(() => !has("GoToWindow"), "Go-to-path sheet still open");
	await snapshot(save ? "save-picker" : "input-picker");
	await until(
		() =>
			flat(tree()).some(
				(n) =>
					n.AXEnabled &&
					(n.AXIdentifier === "OKButton" ||
						n.AXTitle === (save ? "Save" : "Open")),
			),
		"Native confirmation unavailable",
	);
	if (has("OKButton")) press("OKButton");
	else press(save ? "Save" : "Open");
	await until(() => !has("Cancel"), "Native picker did not close");
}
try {
	run("xcrun", [
		"swiftc",
		"scripts/lib/desktop-macos-accessibility.swift",
		"-o",
		helper,
	]);
	report.environment = JSON.parse(run(helper, ["environment"]));
	assert.equal(
		report.environment.accessibilityTrusted,
		true,
		"Accessibility permission unavailable",
	);
	await assert.rejects(lstat(app), { code: "ENOENT" });
	run("ditto", ["-x", "-k", zip, "/Applications"]);
	installed = true;
	run("codesign", ["--verify", "--deep", "--strict", app]);
	report.checks.push("fixed-preview-hash-and-installed-signature");
	pid = JSON.parse(run(helper, ["launch", app])).pid;
	await until(() => has("Add files"), "Workspace did not appear", 45000);
	await snapshot("launch");
	await picker("Add files");
	press("Cancel");
	await until(() => !has("Cancel"), "Input cancel failed");
	report.checks.push("input-picker-cancel");
	const input = join(root, "测试 image.png"),
		output = join(root, "输出 results");
	await mkdir(output);
	run(helper, ["fixture", input]);
	await picker("Add files", input);
	await until(() => has("Convert this file"), "Imported task missing");
	await snapshot("imported");
	const format = flat(tree()).find(
		(n) =>
			n.AXRole === "AXButton" &&
			String(n.AXDescription ?? n.AXTitle ?? "").startsWith(
				"Output format:",
			),
	);
	assert.ok(format, "Output format control missing");
	press(format.AXDescription ?? format.AXTitle);
	await until(() => has("Search format"), "Format dialog missing");
	run(helper, [
		"set-text",
		String(pid),
		"AXTextField",
		"Search format",
		".webp",
	]);
	await until(() => has(".webp"), "WebP option missing");
	press(".webp");
	press("Convert this file");
	await until(
		() => has("Download this file"),
		"Conversion did not finish",
		120000,
	);
	await picker("Download this file");
	press("Cancel");
	await until(() => !has("Cancel"), "Save cancel failed");
	assert.ok(has("Download this file"));
	report.checks.push("save-cancel-retains-result");
	await picker("Download this file", output + "/", true);
	await until(
		async () => (await readdir(output)).some((n) => n.endsWith(".webp")),
		"Output not saved",
	);
	const saved = join(
		output,
		(await readdir(output)).find((n) => n.endsWith(".webp")),
	);
	report.image = {
		sha256: await hash(saved),
		decoded: JSON.parse(run(helper, ["decode", saved])),
	};
	assert.deepEqual(report.image.decoded, { width: 32, height: 32 });
	report.checks.push("unicode-input-output-webp-independent-decode");
	await snapshot("saved");
	// Capture actual Cmd-Q behavior rather than assuming a window-close handler covers it.
	key(12, "command down");
	await delay(1500);
	try {
		process.kill(pid, 0);
		report.cmdQ = "application-still-running";
		await snapshot("cmd-q");
	} catch (e) {
		if (e.code !== "ESRCH") throw e;
		report.cmdQ = "exited-without-confirmation";
		pid = undefined;
	}
	report.status = "passed-basic";
} catch (error) {
	report.status = "failed";
	report.error = String(error.stack);
	process.exitCode = 1;
	if (pid) {
		try {
			await snapshot("failure");
		} catch (e) {
			report.captureError = String(e);
		}
	}
} finally {
	if (pid) {
		try {
			process.kill(pid, "SIGTERM");
		} catch (e) {
			if (e.code !== "ESRCH") report.cleanupError = String(e);
		}
	}
	if (installed) await rm(app, { recursive: true });
	await record("report", report);
	console.log(JSON.stringify(report, null, 2));
}
