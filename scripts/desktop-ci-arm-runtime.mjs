// Extract the ARM64 OpenMP DLL from the same pinned Microsoft redistributable
// already used by the x64 bundle. This step runs on Linux with cabextract.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileInfo } from "./lib/desktop-sources.mjs";
const root = resolve(".desktop-local/arm-runtime");
await mkdir(dirname(root), { recursive: true });
await mkdir(root);
const lock = JSON.parse(
	await readFile("packaging/desktop/windows/engines.lock.json", "utf8"),
);
const source = lock.sources.find((s) => s.id === "vcredist");
const response = await fetch(source.archive.url, {
	signal: AbortSignal.timeout(300000),
});
if (!response.ok) throw new Error(`Runtime download: ${response.status}`);
await writeFile(
	join(root, "vc.exe"),
	Buffer.from(await response.arrayBuffer()),
);
const actual = await fileInfo(root, "vc.exe");
if (
	actual.sha256 !== source.archive.sha256 ||
	actual.bytes !== source.archive.bytes
)
	throw new Error("Pinned runtime changed");
for (const [archive, output] of [
	[join(root, "vc.exe"), join(root, "outer")],
	[join(root, "outer/a3"), join(root, "inner")],
])
	execFileSync("cabextract", ["-q", "-d", output, archive], {
		stdio: "inherit",
		timeout: 60000,
	});
const runtime = JSON.parse(
	await readFile("packaging/desktop/windows/arm-runtime.json", "utf8"),
);
const dll = await fileInfo(join(root, "inner"), runtime.file);
if (dll.sha256 !== runtime.sha256 || dll.bytes !== runtime.bytes)
	throw new Error("ARM64 OpenMP runtime changed");
await copyFile(join(root, "inner", runtime.file), join(root, "vcomp140.dll"));
await writeFile(
	join(root, "runtime.json"),
	JSON.stringify({ source: source.archive, runtime }, null, 2) + "\n",
);
