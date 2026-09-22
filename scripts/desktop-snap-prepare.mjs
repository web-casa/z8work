import { parseArgs } from "node:util";
import { checkVersions } from "./lib/desktop-versions.mjs";
import { execFileSync } from "node:child_process";
import {
	readFile,
	mkdir,
	cp,
	copyFile,
	chmod,
	writeFile,
	realpath,
} from "node:fs/promises";
import { resolve, join, dirname, basename, sep } from "node:path";
import { artifactMatrix, assertElf } from "./lib/desktop-artifacts.mjs";
import { inspectBundle, fileInfo } from "./lib/desktop-sources.mjs";
import {
	snapMetadata,
	validateSnap,
	validateSnapPayload,
} from "./lib/desktop-snap.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["binary", "engines", "output"].map((k) => [k, { type: "string" }]),
	),
});
for (const key of ["binary", "engines", "output"])
	if (!values[key]) throw new Error(`--${key} required`);
await checkVersions();
const root = resolve(values.output),
	engines = await realpath(values.engines);
const canonicalOutput = join(await realpath(dirname(root)), basename(root));
if (canonicalOutput === engines || canonicalOutput.startsWith(engines + sep))
	throw new Error("Output must be outside immutable engine bundle");
const matrix = await artifactMatrix(),
	artifact = matrix.artifacts.find((a) => a.id === "linux-amd64-snap");
const binary = resolve(values.binary),
	binaryInfo = await fileInfo(dirname(binary), basename(binary));
assertElf(await readFile(binary), artifact.arch);
const info = JSON.parse(
	execFileSync(binary, ["--build-info"], {
		encoding: "utf8",
		timeout: 30000,
		maxBuffer: 1024 ** 2,
	}),
);
const bundle = await inspectBundle(engines);
validateSnapPayload(bundle, info, artifact, matrix.version);
const recipe = await readFile("packaging/desktop/snap/snapcraft.yaml", "utf8");
validateSnap(snapMetadata(recipe), matrix.version);
await mkdir(root);
await writeFile(join(root, "snapcraft.yaml"), recipe, { flag: "wx" });
const payload = join(root, "payload"),
	resource = join(payload, "usr/lib", info.resourceDirectoryName, "engines");
await mkdir(join(payload, "usr/bin"), { recursive: true });
await cp(engines, resource, {
	recursive: true,
	errorOnExist: true,
	force: false,
});
await copyFile(binary, join(payload, "usr/bin/z8-desktop"));
await chmod(join(payload, "usr/bin/z8-desktop"), 0o755);
for (const [from, to] of [
	[
		"packaging/desktop/snap/z8-work.desktop",
		"usr/share/applications/z8-work.desktop",
	],
	[
		"src-tauri/icons/icon.png",
		"usr/share/icons/hicolor/192x192/apps/z8-work.png",
	],
	["LICENSE", "usr/share/licenses/z8-work/LICENSE"],
]) {
	await mkdir(dirname(join(payload, to)), { recursive: true });
	await copyFile(from, join(payload, to));
}
const copied = await inspectBundle(resource);
if (
	copied.manifestInfo.sha256 !== bundle.manifestInfo.sha256 ||
	(await fileInfo(payload, "usr/bin/z8-desktop")).sha256 !== binaryInfo.sha256
)
	throw new Error("Copied Snap payload changed");
await writeFile(
	join(root, "prepared.json"),
	JSON.stringify(
		{
			schema: 1,
			artifact: artifact.id,
			version: matrix.version,
			buildInfo: info,
			applicationSha256: binaryInfo.sha256,
			engineManifestSha256: bundle.manifestInfo.sha256,
			status: "prepared-awaiting-pack",
			redistributionApproved: false,
		},
		null,
		2,
	) + "\n",
);
console.log(root);
