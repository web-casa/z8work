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
import { pdfFixture } from "../tests/helpers-pdf-fixture.mjs";
import { unzipSync } from "fflate";
import { parseFile } from "music-metadata";
assert.equal(process.platform, "darwin");
assert.equal(process.arch, "arm64");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const signedCandidate = process.env.SIGNED_CANDIDATE === "1";
const root = resolve(
	signedCandidate
		? ".desktop-local/macos-web-signed-gui"
		: ".desktop-local/macos-web-gui",
);
await mkdir(root, { recursive: true });
const source = resolve(".desktop-local/macos-web-input");
const pin = JSON.parse(
	await readFile("packaging/desktop-web/macos-candidate.json", "utf8"),
);
const report = {
	status: "running",
	sourceRun: pin.runId,
	signedCandidate,
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
const zip = join(source, pin.zip);
assert.equal(await hash(zip), pin.zipSha256);
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
async function selectFormat(extension) {
	const format = flat(tree()).find(
		(n) =>
			["AXButton", "AXPopUpButton"].includes(n.AXRole) &&
			String(n.AXDescription ?? n.AXTitle ?? "").startsWith(
				"Output format:",
			),
	);
	assert.ok(format, "Output format control missing");
	press(format.AXDescription || format.AXTitle, format.AXRole);
	await until(() => has("Search format"), "Format dialog missing");
	run(helper, [
		"set-text",
		String(pid),
		"AXTextField",
		"Search format",
		extension,
	]);
	await until(() => has(extension), "WebP option missing");
	press(extension, "AXCheckBox");
	await until(() => !has("Search format"), "Format menu did not close");
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
	if (signedCandidate) {
		const previous = resolve(
			".desktop-local/macos-web-previous/Z8.Work-0.2.0-macos-arm64-preview.app.zip",
		);
		assert.equal(
			await hash(previous),
			"c6e2cd530e66cbd8246b5132f330c2b93f2a0db632995433ae85ded9c3b417cd",
		);
		run("ditto", ["-x", "-k", previous, "/Applications"]);
		installed = true;
		pid = JSON.parse(run(helper, ["launch", app])).pid;
		await until(() => has("Add files"), "Previous preview launch failed");
		await snapshot("previous-preview");
		key(12, "command down");
		await until(() => {
			try {
				process.kill(pid, 0);
				return false;
			} catch (e) {
				if (e.code !== "ESRCH") throw e;
				return true;
			}
		}, "Previous preview did not exit");
		pid = undefined;
		await rm(app, { recursive: true });
		installed = false;
		report.checks.push(
			"previous-preview-installed-and-launched-before-replacement",
		);
		const final = JSON.parse(
			await readFile(
				".desktop-local/mac-web-signed/reports/final.json",
				"utf8",
			),
		);
		assert.equal(final.source.zipSha256, pin.zipSha256);
		const dmg = resolve(
			".desktop-local/mac-web-signed/downloads",
			final.artifact.name,
		);
		assert.equal(await hash(dmg), final.artifact.sha256);
		const mount = join(root, "mounted");
		await mkdir(mount);
		run("hdiutil", [
			"attach",
			"-readonly",
			"-nobrowse",
			"-mountpoint",
			mount,
			dmg,
		]);
		try {
			run("ditto", [join(mount, pin.appName), app]);
			installed = true;
		} finally {
			run("hdiutil", ["detach", mount]);
		}
		run("spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
		report.artifact = final.artifact;
	} else {
		run("ditto", ["-x", "-k", zip, "/Applications"]);
		installed = true;
	}
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
	await selectFormat(".webp");
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

	// An OS quit request must preserve the queue when cancelled, then exit on approval.
	key(12, "command down");
	await until(() => has("Cancel") && has("OK"), "Cmd-Q confirmation missing");
	await snapshot("cmd-q");
	press("Cancel");
	await until(() => !has("Cancel"), "Quit cancellation failed");
	assert.ok(has("Download this file"));
	report.checks.push("cmd-q-cancel-preserves-result");
	key(13, "command down"); // Cmd-W follows the same guarded path.
	await until(() => has("Cancel") && has("OK"), "Cmd-W confirmation missing");
	press("Cancel");
	await until(() => !has("Cancel"), "Window close cancellation failed");
	report.checks.push("cmd-w-cancel-preserves-result");

	async function convertAndSave(inputPath, extension, tag) {
		press("Remove all files");
		await until(() => !has("Download this file"), "Queue did not clear");
		await picker("Add files", inputPath);
		await until(() => has("Convert this file"), "Task missing: " + tag);
		await selectFormat(extension);
		press("Convert this file");
		await until(
			() => has("Download this file"),
			"Conversion timeout: " + tag,
			120000,
		);
		const folder = join(root, tag);
		await mkdir(folder);
		await picker("Download this file", folder + "/", true);
		await until(
			async () => (await readdir(folder)).length === 1,
			"Save missing: " + tag,
		);
		const path = join(folder, (await readdir(folder))[0]);
		await snapshot(tag);
		return path;
	}
	const markdown = join(root, "文档 fixture.md");
	await writeFile(
		markdown,
		"# Mac acceptance\n\nUnicode: 中文测试.\n\n**Result marker: z8-web-macos**\n",
	);
	const html = await convertAndSave(markdown, ".html", "document-output");
	assert.match(await readFile(html, "utf8"), /z8-web-macos/);
	assert.match(await readFile(html, "utf8"), /中文测试/);
	report.checks.push("markdown-to-html-content");
	const pdf = join(root, "多页 fixture.pdf");
	await writeFile(pdf, pdfFixture({ pages: 2 }));
	const pdfZip = await convertAndSave(pdf, ".png", "pdf-output");
	const pages = Object.entries(unzipSync(await readFile(pdfZip)));
	assert.equal(pages.length, 2);
	for (const [index, [, bytes]] of pages.entries()) {
		const png = join(root, `decoded-page-${index}.png`);
		await writeFile(png, bytes);
		assert.deepEqual(JSON.parse(run(helper, ["decode", png])), {
			width: 144,
			height: 96,
		});
	}
	report.checks.push("multipage-pdf-zip-two-images-independent-decode");
	const wav = join(root, "音频 fixture.wav");
	const samples = 48000 * 20,
		data = Buffer.alloc(44 + samples * 2);
	data.write("RIFF");
	data.writeUInt32LE(data.length - 8, 4);
	data.write("WAVEfmt ", 8);
	data.writeUInt32LE(16, 16);
	data.writeUInt16LE(1, 20);
	data.writeUInt16LE(1, 22);
	data.writeUInt32LE(48000, 24);
	data.writeUInt32LE(96000, 28);
	data.writeUInt16LE(2, 32);
	data.writeUInt16LE(16, 34);
	data.write("data", 36);
	data.writeUInt32LE(samples * 2, 40);
	let seed = 42;
	for (let i = 0; i < samples; i++) {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		data.writeInt16LE((seed >>> 16) - 32768, 44 + i * 2);
	}
	await writeFile(wav, data);
	const flac = await convertAndSave(wav, ".flac", "audio-output");
	const metadata = await parseFile(flac);
	assert.equal(metadata.format.sampleRate, 48000);
	assert.ok(Math.abs(metadata.format.duration - 20) < 0.01);
	assert.ok((await readFile(flac)).length > 1024 * 1024);
	report.checks.push("wav-to-flac-duration-sample-rate-and-multichunk-save");

	press("Remove all files");
	await until(
		() => !has("Download this file"),
		"Queue did not clear for batch",
	);
	for (let i = 0; i < 2; i++) {
		const path = join(root, `batch-${i}.png`);
		await writeFile(path, await readFile(input));
		await picker("Add files", path);
	}
	await until(
		() => has("Convert 2 files"),
		"Batch conversion action missing",
	);
	press("Convert 2 files");
	await until(
		() => has("Download 2 completed files (ZIP)"),
		"Batch did not finish",
		120000,
	);
	const batchFolder = join(root, "batch-output");
	await mkdir(batchFolder);
	await picker("Download 2 completed files (ZIP)", batchFolder + "/", true);
	await until(
		async () => (await readdir(batchFolder)).length === 1,
		"Batch ZIP missing",
	);
	const batch = unzipSync(
		await readFile(join(batchFolder, (await readdir(batchFolder))[0])),
	);
	assert.equal(Object.keys(batch).length, 2);
	for (const [index, bytes] of Object.values(batch).entries()) {
		const path = join(root, `batch-decoded-${index}.jpeg`);
		await writeFile(path, bytes);
		assert.deepEqual(JSON.parse(run(helper, ["decode", path])), {
			width: 32,
			height: 32,
		});
	}
	report.checks.push("two-file-batch-zip-independent-decode");

	key(12, "command down");
	await until(() => has("OK"), "Quit retry missing");
	press("OK");
	await until(() => {
		try {
			process.kill(pid, 0);
			return false;
		} catch (e) {
			if (e.code !== "ESRCH") throw e;
			return true;
		}
	}, "Confirmed quit did not exit");
	pid = JSON.parse(run(helper, ["launch", app])).pid;
	await until(() => has("Add files"), "Relaunch failed");
	assert.ok(!has("Download this file"));
	assert.equal(await hash(saved), report.image.sha256);
	report.checks.push("confirmed-quit-and-relaunch-keeps-saved-file");
	key(12, "command down");
	await until(() => {
		try {
			process.kill(pid, 0);
			return false;
		} catch (e) {
			if (e.code !== "ESRCH") throw e;
			return true;
		}
	}, "Empty queue quit did not exit");
	pid = undefined;
	report.checks.push("empty-queue-quit-without-dialog");
	report.status = "passed";
	if (signedCandidate) {
		const finalPath = ".desktop-local/mac-web-signed/reports/final.json";
		const final = JSON.parse(await readFile(finalPath, "utf8"));
		final.gui =
			"passed: signed DMG installation, conversion, save, batch and exit regression";
		final.guiChecks = report.checks;
		await writeFile(finalPath, JSON.stringify(final, null, 2) + "\n");
	}
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
