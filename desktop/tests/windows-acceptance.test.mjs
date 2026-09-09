import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp,
	mkdir,
	writeFile,
	readFile,
	rm,
	symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileInfo } from "../../scripts/lib/desktop-sources.mjs";
import {
	processTests,
	validateTestResult,
	webviewReadiness,
	assertOutside,
	verifyHandoff,
} from "../../scripts/lib/desktop-windows-acceptance.mjs";
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-win-accept-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const files = {};
	for (const name of [
		"candidate/z8-desktop.exe",
		"candidate/engines/engines.json",
		"validation/native-tests.exe",
		"validation/validation-run.exe",
		"build-inputs.json",
		"scripts/desktop-windows-acceptance.mjs",
	]) {
		await mkdir(join(root, name, ".."), { recursive: true });
		await writeFile(join(root, name), "fixture");
		files[name] = await fileInfo(root, name);
	}
	const manifest = {
		schema: 1,
		scope: "windows-x64-native-validation",
		redistributionApproved: false,
		files,
	};
	const save = () =>
		writeFile(join(root, "handoff.json"), JSON.stringify(manifest));
	await save();
	return { root, manifest, save };
}
test("lifecycle validation requires exactly one real successful test", () => {
	for (const name of processTests) {
		const valid = `running 1 test\ntest ${name} ... ok\n\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 45 filtered out; finished in 0.1s\n`;
		validateTestResult(valid, name);
		for (const invalid of [
			valid.replace("1 passed", "0 passed"),
			valid.replace("0 ignored", "1 ignored"),
			valid.replace("... ok", "... ignored"),
			valid.replace(name, "another::test"),
			"test result: ok. 0 passed; 0 failed;",
		])
			assert.throws(() => validateTestResult(invalid, name));
	}
});
test("runtime readiness distinguishes stable, prerelease and absent WebView2", () => {
	const info = {
		schema: 1,
		os: "windows",
		arch: "x86_64",
		gui: "not-run",
		webview: {
			engine: "webview2",
			status: "available",
			version: "140.0.1.2",
		},
	};
	assert.equal(webviewReadiness(info), "passed");
	for (const version of [
		"",
		"0.0.0.0",
		"140.0.1.2 beta",
		"140.0",
		"140.0.1.2\n",
	])
		assert.equal(
			webviewReadiness({
				...info,
				webview: { ...info.webview, version },
			}),
			"blocked",
		);
	assert.equal(
		webviewReadiness({
			...info,
			webview: {
				engine: "webview2",
				status: "unavailable",
				error: "not found",
			},
		}),
		"blocked",
	);
	assert.throws(() => webviewReadiness({ ...info, os: "linux" }));
	assert.throws(() => webviewReadiness({ ...info, gui: "passed" }));
});
test("handoff verification rejects changed, missing and unlisted files", async (t) => {
	const f = await fixture(t);
	await verifyHandoff(f.root);
	const path = join(f.root, "candidate/z8-desktop.exe"),
		original = await readFile(path);
	await writeFile(path, "changed");
	await assert.rejects(verifyHandoff(f.root), /integrity mismatch/);
	await writeFile(path, original);
	await writeFile(join(f.root, "extra.txt"), "extra");
	await assert.rejects(verifyHandoff(f.root), /unlisted/);
	await rm(join(f.root, "extra.txt"));
	await rm(path);
	await assert.rejects(verifyHandoff(f.root), /Missing/);
});
test("handoff rejects case aliases and unsafe manifest paths before reading them", async (t) => {
	const f = await fixture(t);
	f.manifest.files["Candidate/z8-desktop.exe"] =
		f.manifest.files["candidate/z8-desktop.exe"];
	await f.save();
	await assert.rejects(verifyHandoff(f.root), /Case collision/);
	delete f.manifest.files["Candidate/z8-desktop.exe"];
	f.manifest.files["../outside"] =
		f.manifest.files["candidate/z8-desktop.exe"];
	await f.save();
	await assert.rejects(verifyHandoff(f.root), /Unsafe relative/);
});
test("reports cannot mutate input directories through direct or symlink paths", async (t) => {
	const f = await fixture(t);
	await assert.rejects(
		assertOutside(f.root, join(f.root, "report")),
		/outside immutable/,
	);
	await assertOutside(f.root, join(tmpdir(), "another-output"));
	if (process.platform !== "win32") {
		const alias = join(f.root, "alias");
		await symlink(f.root, alias);
		await assert.rejects(
			assertOutside(f.root, join(alias, "report")),
			/outside immutable/,
		);
	}
});
