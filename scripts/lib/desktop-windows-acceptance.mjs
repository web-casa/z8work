import { readFileSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { join, dirname, basename, sep } from "node:path";
import { fileInfo, listFiles } from "./desktop-sources.mjs";
import { windowsResource } from "./desktop-windows-bundle.mjs";

export const processTests = JSON.parse(
	readFileSync(
		new URL(
			"../../packaging/desktop/windows/lifecycle-tests.json",
			import.meta.url,
		),
		"utf8",
	),
);
if (
	!Array.isArray(processTests) ||
	processTests.length !== 8 ||
	new Set(processTests).size !== 8 ||
	processTests.some(
		(name) =>
			typeof name !== "string" || !/^process::tests::[a-z_]+$/.test(name),
	)
)
	throw new Error("Expected eight distinct lifecycle tests");
Object.freeze(processTests);

export async function assertOutside(root, output) {
	const source = await realpath(root);
	const target = join(await realpath(dirname(output)), basename(output));
	// Windows paths are case-insensitive. Conservative on other hosts too.
	if (
		target.toLowerCase() === source.toLowerCase() ||
		target.toLowerCase().startsWith(source.toLowerCase() + sep)
	)
		throw new Error("Output must be outside immutable inputs");
}

export function validateTestResult(text, name) {
	if (
		!processTests.includes(name) ||
		!text.includes(`test ${name} ... ok`) ||
		!/^test result: ok\. 1 passed; 0 failed; 0 ignored; 0 measured; \d+ filtered out;/m.test(
			text,
		)
	)
		throw new Error(
			`Required lifecycle test did not run successfully: ${name}`,
		);
}

export function webviewReadiness(info) {
	if (
		info?.schema !== 1 ||
		info.os !== "windows" ||
		info.arch !== "x86_64" ||
		info.gui !== "not-run" ||
		info.webview?.engine !== "webview2" ||
		!["available", "unavailable"].includes(info.webview.status)
	)
		throw new Error("Invalid Windows runtime report");
	return info.webview.status === "available" &&
		/^[1-9]\d*\.\d+\.\d+\.\d+$/.test(info.webview.version ?? "")
		? "passed"
		: "blocked";
}

export async function verifyHandoff(root) {
	await fileInfo(root, "handoff.json", 2 * 1024 ** 2);
	const manifest = JSON.parse(
		await readFile(join(root, "handoff.json"), "utf8"),
	);
	if (
		manifest.schema !== 1 ||
		manifest.scope !== "windows-x64-native-validation" ||
		manifest.redistributionApproved !== false ||
		!manifest.files ||
		Object.keys(manifest.files).length > 2000
	)
		throw new Error("Invalid Windows handoff inventory");
	const names = Object.keys(manifest.files),
		seen = new Set();
	for (const name of names) {
		windowsResource(name);
		if (seen.has(name.toLowerCase()))
			throw new Error("Case collision in inventory");
		seen.add(name.toLowerCase());
	}
	for (const required of [
		"candidate/z8-desktop.exe",
		"candidate/engines/engines.json",
		"validation/native-tests.exe",
		"validation/validation-run.exe",
		"build-inputs.json",
		"scripts/desktop-windows-acceptance.mjs",
	])
		if (!names.includes(required))
			throw new Error(`Missing handoff input: ${required}`);
	if (
		JSON.stringify(await listFiles(root)) !==
		JSON.stringify([...names, "handoff.json"].sort())
	)
		throw new Error("Missing or unlisted handoff file");
	let total = 0;
	for (const [name, expected] of Object.entries(manifest.files)) {
		if (
			!/^[a-f0-9]{64}$/.test(expected.sha256) ||
			!Number.isSafeInteger(expected.bytes) ||
			expected.bytes < 0
		)
			throw new Error("Invalid handoff fingerprint");
		total += expected.bytes;
		if (total > 4 * 1024 ** 3)
			throw new Error("Handoff exceeds size limit");
		const actual = await fileInfo(root, name, expected.bytes);
		if (
			actual.bytes !== expected.bytes ||
			actual.sha256 !== expected.sha256
		)
			throw new Error(`Handoff integrity mismatch: ${name}`);
	}
	return manifest;
}
