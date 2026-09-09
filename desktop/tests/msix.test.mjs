import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
	msixConfig,
	validateMsixConfig,
	msixManifest,
	msixAssets,
	validatePng,
} from "../../scripts/lib/desktop-msix.mjs";
test("MSIX development configuration cannot silently become a store package", async () => {
	const c = await msixConfig();
	validateMsixConfig(c);
	for (const change of [
		(x) => (x.storeSubmissionAllowed = true),
		(x) => (x.channel = "microsoft-store"),
		(x) => (x.identity = "Another.App"),
		(x) => (x.publisher = "CN=Store"),
		(x) => (x.version = "1.0.0"),
		(x) => (x.version = "65536.0.0.0"),
		(x) => (x.version = "01.0.0.0"),
		(x) => (x.minimumWindowsVersion = "10.0.10240.0"),
		(x) => (x.languages = ["en-US"]),
		(x) => (x.description = "bad\u0000text"),
	]) {
		const modified = structuredClone(c);
		change(modified);
		assert.throws(() => validateMsixConfig(modified));
	}
});
test("MSIX manifest escapes display text and uses the explicit full-trust desktop entry", async () => {
	const c = await msixConfig();
	c.description = '<Injected Name="bad"/> & test';
	const text = msixManifest(c);
	assert.ok(
		text.includes("&lt;Injected Name=&quot;bad&quot;/&gt; &amp; test"),
	);
	assert.ok(!text.includes("<Injected"));
	assert.ok(
		text.includes(
			'Executable="z8-desktop.exe" EntryPoint="Windows.FullTrustApplication"',
		),
	);
	assert.equal((text.match(/<rescap:Capability /g) || []).length, 1);
	assert.ok(!text.includes("broadFileSystemAccess"));
});
test("MSIX icons contain real PNG headers at each required base size", async () => {
	for (const [name, size] of Object.entries(msixAssets)) {
		const bytes = await readFile(
			new URL(
				`../../packaging/desktop/windows/msix/Assets/${name}`,
				import.meta.url,
			),
		);
		validatePng(bytes, size);
		assert.throws(() => validatePng(bytes, size + 1));
		assert.throws(() => validatePng(bytes.subarray(0, 20), size));
	}
});
test("independent MSIX archive verification rejects corruption and unsafe archives", () => {
	const result = execFileSync(
		process.platform === "win32" ? "python" : "python3",
		["desktop/tests/msix-archive.test.py"],
		{ encoding: "utf8", timeout: 30000, stdio: "pipe" },
	);
	assert.equal(result, "");
});
