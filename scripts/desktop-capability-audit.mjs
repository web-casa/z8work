import { summarizeInventory } from "./lib/desktop-format-inventory.mjs";
// Inspect only a reviewed, hash-pinned package. No installation or network conversion.
import { validateImageExpansion } from "./lib/desktop-image-expansion.mjs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileInfo } from "./lib/desktop-sources.mjs";
const id = process.argv[2];
const sources = JSON.parse(
	await readFile("packaging/desktop/capability-sources.json", "utf8"),
);
const source = sources.find((s) => s.id === id);
if (!source || source.os !== process.platform || source.arch !== process.arch)
	throw new Error("Unknown target or non-native runner");
const root = resolve(".desktop-local/capabilities");
await mkdir(root, { recursive: true });
const input = resolve(".desktop-local/capability-input");
const artifact = await fileInfo(input, source.file);
if (artifact.sha256 !== source.sha256)
	throw new Error("Reviewed package SHA-256 mismatch");
const run = (cmd, args, timeout = 180000) =>
	execFileSync(cmd, args, {
		encoding: "utf8",
		timeout,
		maxBuffer: 16 * 1024 ** 2,
	});
let engines;
const extracted = join(root, "extracted");
await mkdir(extracted);
if (process.platform === "linux") {
	run("dpkg-deb", ["--extract", join(input, source.file), extracted]);
	engines = join(extracted, "usr/lib/Z8.Work Desktop Dev/engines");
} else if (process.platform === "win32") {
	run("tar", ["-xf", join(input, source.file), "-C", extracted]);
	engines = join(extracted, "engines");
} else {
	run("hdiutil", [
		"attach",
		"-readonly",
		"-nobrowse",
		"-mountpoint",
		extracted,
		join(input, source.file),
	]);
	engines = join(
		extracted,
		"Z8.Work Desktop Dev.app/Contents/Resources/engines",
	);
}
try {
	const tool = resolve(
		"src-tauri/target",
		source.target,
		"release",
		process.platform === "win32" ? "bundle-check.exe" : "bundle-check",
	);
	const report = JSON.parse(run(tool, [engines, "--capabilities"]));
	const expansion = JSON.parse(
		run(tool, [engines, "--image-expansion"], 900000),
	);
	validateImageExpansion(expansion);
	if (
		report.schema !== 1 ||
		report.scope !== "engine-discovery-not-conversion-acceptance" ||
		report.probes.length !== 7
	)
		throw new Error("Invalid inventory report");
	await writeFile(
		join(root, "report.json"),
		JSON.stringify(
			{
				source,
				artifact,
				tool: await fileInfo(
					resolve("src-tauri/target", source.target, "release"),
					process.platform === "win32"
						? "bundle-check.exe"
						: "bundle-check",
				),
				commit: process.env.GITHUB_SHA,
				report,
				expansion,
				summary: summarizeInventory(report),
			},
			null,
			2,
		) + "\n",
	);
	if (report.probes.some((p) => p.status !== "listed"))
		throw new Error(
			"One or more engine inventories unavailable; inspect report",
		);
	console.log(
		`Capability inventory recorded for ${id}; does not enable formats.`,
	);
} finally {
	if (process.platform === "darwin") run("hdiutil", ["detach", extracted]);
}
