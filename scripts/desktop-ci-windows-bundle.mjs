// Assemble the locked Windows x64 native engines on Linux, where cabextract is available.
import { mkdir, cp, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileInfo } from "./lib/desktop-sources.mjs";
import { readWindowsLock } from "./lib/desktop-windows-bundle.mjs";
const root = resolve(".desktop-local/ci");
const lock = await readWindowsLock();
const archives = join(root, "archives");
await mkdir(archives);
for (const source of lock.sources) {
	const response = await fetch(source.archive.url, {
		signal: AbortSignal.timeout(300000),
	});
	if (!response.ok || !response.body)
		throw new Error(`Download failed: ${source.id}: ${response.status}`);
	await pipeline(
		Readable.fromWeb(response.body),
		createWriteStream(join(archives, source.archive.file), { flags: "wx" }),
	);
	const actual = await fileInfo(
		archives,
		source.archive.file,
		source.archive.bytes,
	);
	if (
		actual.bytes !== source.archive.bytes ||
		actual.sha256 !== source.archive.sha256
	)
		throw new Error(`Pinned archive changed: ${source.id}`);
}
const run = (script, args) =>
	execFileSync(process.execPath, [script, ...args], {
		stdio: "inherit",
		timeout: 600000,
	});
const candidate = join(root, "candidate");
await mkdir(candidate);
await cp(
	join(root, "application/z8-desktop.exe"),
	join(candidate, "z8-desktop.exe"),
);
run("scripts/desktop-bundle-windows.mjs", [
	"--archives",
	archives,
	"--output",
	join(candidate, "engines"),
	"--verifier",
	join(root, "validation/bundle-check.exe"),
	"--notices",
	join(root, "application/notices"),
]);
run("scripts/desktop-windows-handoff.mjs", [
	"--candidate",
	candidate,
	"--tests",
	join(root, "validation/native-tests.exe"),
	"--supervisor",
	join(root, "validation/validation-run.exe"),
	"--inputs",
	join(root, "build-inputs.json"),
	"--output",
	join(root, "handoff"),
]);
run("scripts/desktop-msix-prepare.mjs", [
	"--handoff",
	join(root, "handoff"),
	"--output",
	join(root, "msix-prepared"),
]);
await writeFile(
	join(root, "bundle-summary.json"),
	JSON.stringify(
		{
			scope: "development-windows-x64",
			engineManifest: await fileInfo(
				join(candidate, "engines"),
				"engines.json",
			),
			storeSubmissionAllowed: false,
			lockSchema: lock.schema,
		},
		null,
		2,
	) + "\n",
);
