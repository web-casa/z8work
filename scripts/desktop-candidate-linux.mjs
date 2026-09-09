// Local candidate only. Resources are copied to Tauri's actual ../lib/<package> layout.
import { parseArgs } from "node:util";
import {
	mkdir,
	readFile,
	writeFile,
	cp,
	copyFile,
	chmod,
	mkdtemp,
	rm,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
	artifactMatrix,
	assertElf,
	sha256,
	validateBuild,
} from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["binary", "engines", "output"].map((k) => [k, { type: "string" }]),
	),
});
for (const key of ["binary", "engines", "output"])
	if (!values[key]) throw new Error(`--${key} is required`);
if (process.platform !== "linux") throw new Error("Linux host required");
const matrix = await artifactMatrix();
const artifact = matrix.artifacts.find(
	(a) => a.id === "linux-arm64-validation",
);
if (process.arch !== "arm64")
	throw new Error(
		"This local validation target requires ARM64; use a target-specific build for other artifacts",
	);
const binary = await readFile(values.binary);
assertElf(binary, artifact.arch);
const engines = resolve(values.engines);
const manifest = JSON.parse(
	await readFile(join(engines, "engines.json"), "utf8"),
);
if (
	manifest.os !== artifact.os ||
	manifest.arch !== artifact.arch ||
	manifest.kind !== "bundled"
)
	throw new Error("Engine bundle target mismatch");
const run = (bin, args) =>
	execFileSync(bin, args, {
		encoding: "utf8",
		timeout: 60000,
		maxBuffer: 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
		env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
	});
const buildInfo = JSON.parse(run(resolve(values.binary), ["--build-info"]));
validateBuild(buildInfo, artifact, matrix.version);
const resourceName = buildInfo.resourceDirectoryName;
if (
	typeof resourceName !== "string" ||
	!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(resourceName) ||
	resourceName.includes("..")
)
	throw new Error("Unsafe resource directory name");
// Invoke the verifier through the bundled loader, with no development engine environment.
run(join(engines, manifest.loader), [
	"--library-path",
	join(engines, "lib"),
	join(engines, "validation/bundle-check"),
	engines,
]);
const output = resolve(values.output);
await mkdir(output); // Never overwrite a previous candidate.
const stage = join(output, "z8-work");
await mkdir(join(stage, "usr/bin"), { recursive: true });
await mkdir(join(stage, "usr/lib", resourceName), { recursive: true });
await copyFile(values.binary, join(stage, "usr/bin/z8-desktop"));
await chmod(join(stage, "usr/bin/z8-desktop"), 0o755);
await cp(engines, join(stage, "usr/lib", resourceName, "engines"), {
	recursive: true,
	errorOnExist: true,
	force: false,
});
await copyFile("LICENSE", join(stage, "LICENSE"));
await writeFile(
	join(stage, "README.txt"),
	"Z8.Work 0.1.0 — Linux ARM64 local validation candidate\nRun usr/bin/z8-desktop on Debian 13 with GTK 3 and WebKitGTK 4.1.\nEngines and their loader/libraries are bundled; the GUI still requires system GTK/WebKit.\nThis is not a Snap/MSIX or a publicly redistributable release. See provenance.json in the engine directory.\nNo auto-updater. Removing this extracted directory removes this copy; user-selected output files and application history remain.\n",
);
const filename = `z8-work-${matrix.version}-${artifact.id}.tar.gz`;
const archive = join(output, filename);
run("tar", [
	"--sort=name",
	"--mtime=@0",
	"--owner=0",
	"--group=0",
	"--numeric-owner",
	"-czf",
	archive,
	"-C",
	output,
	"z8-work",
]);
const digest = sha256(await readFile(archive));
// Verify the extracted final archive, not only the pre-archive staging directory.
const check = await mkdtemp(join(output, "unpack-check-"));
try {
	run("tar", ["-xzf", archive, "-C", check]);
	const root = join(check, "z8-work/usr/lib", resourceName, "engines");
	run(join(root, manifest.loader), [
		"--library-path",
		join(root, "lib"),
		join(root, "validation/bundle-check"),
		root,
	]);
	if (
		sha256(await readFile(join(check, "z8-work/usr/bin/z8-desktop"))) !==
		sha256(binary)
	)
		throw new Error("Archived application changed");
} finally {
	await rm(check, { recursive: true, force: true });
}
const report = {
	schema: 1,
	artifact: artifact.id,
	filename,
	sha256: digest,
	applicationSha256: sha256(binary),
	engineManifestSha256: sha256(await readFile(join(engines, "engines.json"))),
	redistributionApproved: false,
	buildInfo,
	checks: {
		integrity: {
			status: "passed",
			report: "Final archive extracted; application hash and complete engine inventory checked",
		},
		conversion: { status: "not-run" },
		gui: { status: "not-run" },
		install: { status: "not-run" },
		upgrade: { status: "not-run" },
		uninstall: { status: "not-run" },
		licenses: {
			status: "not-run",
			reason: "Source delivery and dependency review pending",
		},
	},
};
await writeFile(
	join(output, "candidate.json"),
	JSON.stringify(report, null, 2) + "\n",
);
await writeFile(join(output, "SHA256SUMS"), `${digest}  ${filename}\n`);
console.log(JSON.stringify(report, null, 2));
