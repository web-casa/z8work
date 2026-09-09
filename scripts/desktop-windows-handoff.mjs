// Local validation inputs only; never install, sign, upload or publish.
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fileInfo, listFiles, inspectBundle } from "./lib/desktop-sources.mjs";
import { inspectWindowsTree } from "./lib/desktop-windows.mjs";
import {
	assertOutside,
	verifyHandoff,
} from "./lib/desktop-windows-acceptance.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["candidate", "tests", "supervisor", "inputs", "output"].map((k) => [
			k,
			{ type: "string" },
		]),
	),
});
for (const key of ["candidate", "tests", "supervisor", "inputs", "output"])
	if (!values[key]) throw new Error(`--${key} required`);
const candidate = resolve(values.candidate),
	output = resolve(values.output),
	tests = resolve(values.tests),
	inputs = resolve(values.inputs);
const repo = fileURLToPath(new URL("../", import.meta.url));
await assertOutside(candidate, output);
await inspectBundle(join(candidate, "engines"), "windows");
const candidateFiles = await listFiles(candidate);
if (
	candidateFiles.some(
		(name) => name !== "z8-desktop.exe" && !name.startsWith("engines/"),
	)
)
	throw new Error("Unexpected candidate resource");
const pe = await inspectWindowsTree(candidate);
if (
	pe.missing.length ||
	!pe.images.some(
		(p) =>
			p.path === "z8-desktop.exe" &&
			p.subsystem === 2 &&
			p.resourcesPresent,
	)
)
	throw new Error("Invalid Windows application candidate");
await fileInfo(dirname(inputs), basename(inputs), 2 * 1024 ** 2);
const receipt = JSON.parse(await readFile(inputs, "utf8"));
if (
	receipt.schema !== 1 ||
	!/^[a-f0-9]{40}$/.test(receipt.head) ||
	!receipt.files?.["src-tauri/src/main.rs"]
)
	throw new Error("Expected working-tree build input receipt");
await mkdir(output);
const copies = [
	...candidateFiles.map((name) => [
		join(candidate, name),
		`candidate/${name}`,
	]),
	[tests, "validation/native-tests.exe"],
	[resolve(values.supervisor), "validation/validation-run.exe"],
	[inputs, "build-inputs.json"],
	...[
		"scripts/desktop-windows-acceptance.mjs",
		"scripts/desktop-windows-engines-check.mjs",
		"scripts/lib/desktop-windows-acceptance.mjs",
		"scripts/lib/desktop-windows-bundle.mjs",
		"scripts/lib/desktop-windows.mjs",
		"scripts/lib/desktop-artifacts.mjs",
		"scripts/lib/desktop-sources.mjs",
		"scripts/lib/desktop-snap-installed.mjs",
		"packaging/desktop/artifacts.json",
		"packaging/desktop/windows/engines.lock.json",
		"packaging/desktop/windows/lifecycle-tests.json",
		"LICENSE",
	].map((name) => [join(repo, name), name]),
];
const files = {};
for (const [source, name] of copies) {
	const before = await fileInfo(dirname(source), basename(source));
	await mkdir(dirname(join(output, name)), { recursive: true });
	await copyFile(source, join(output, name));
	const after = await fileInfo(output, name);
	if (
		JSON.stringify(before) !== JSON.stringify(after) ||
		JSON.stringify(before) !==
			JSON.stringify(await fileInfo(dirname(source), basename(source)))
	)
		throw new Error(`Changed handoff input: ${name}`);
	files[name] = after;
}
if ((await inspectWindowsTree(output)).missing.length)
	throw new Error("Missing validation DLL dependency");
await writeFile(
	join(output, "README.txt"),
	`Z8.Work Windows x64 validation handoff - local development only\n\nRequires Node 22+ and a native Windows x64 test desktop. No npm install needed.\nFrom this directory, first inspect handoff.json against the independently supplied SHA-256,\nthen verify every transferred file before running candidate executables:\n\nnode scripts/desktop-windows-acceptance.mjs --root . --output ../z8-static-check\nnode scripts/desktop-windows-acceptance.mjs --root . --output ../z8-native-check --runtime native\n\nOutputs must be new directories outside this handoff. Missing WebView2 is reported after\ncore checks; the tool never installs it. Stable runtime detection does not prove GUI works.\nThe tool runs eight existing Rust process tests and the 84-route engine matrix.\nWine diagnostics require --runtime wine and never count as native Windows acceptance.\nKeep user files out of testing. Do not install over an existing app with user data.\nGUI, file permissions, restart/upgrade/uninstall, MSIX/WACK and licenses remain pending.\nHashes show byte consistency, not publisher identity. Build inputs are a supplied\nbuild receipt, not a cryptographic proof that an executable came from those sources.\n`,
	{ flag: "wx" },
);
files["README.txt"] = await fileInfo(output, "README.txt");
const manifest = {
	schema: 1,
	scope: "windows-x64-native-validation",
	redistributionApproved: false,
	acceptance: "incomplete",
	files,
};
await writeFile(
	join(output, "handoff.json"),
	JSON.stringify(manifest, null, 2) + "\n",
	{ flag: "wx" },
);
await verifyHandoff(output);
console.log(
	JSON.stringify({
		status: "prepared-for-native-testing",
		output,
		handoff: await fileInfo(output, "handoff.json"),
		acceptance: "incomplete",
	}),
);
