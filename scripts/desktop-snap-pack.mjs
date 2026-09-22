// Pack a local candidate using Snapcraft's expanded GNOME runtime and snap pack.
// This does not install a snap, download a runtime provider, or contact the Store.
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import {
	readFile,
	mkdir,
	cp,
	copyFile,
	writeFile,
	chmod,
	realpath,
} from "node:fs/promises";
import { resolve, join, dirname, basename, sep } from "node:path";
import { stringify } from "yaml";
import {
	snapMetadata,
	validateSnap,
	checkSnapDesktop,
} from "./lib/desktop-snap.mjs";
import { fileInfo, inspectBundle, listFiles } from "./lib/desktop-sources.mjs";
import { artifactMatrix, validateBuild } from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["prepared", "output", "snapcraft-root"].map((k) => [
			k,
			{ type: "string" },
		]),
	),
});
for (const key of ["prepared", "output", "snapcraft-root"])
	if (!values[key]) throw new Error(`--${key} required`);
const prepared = await realpath(values.prepared),
	output = resolve(values.output),
	sdk = await realpath(values["snapcraft-root"]);
const canonicalOutput = join(await realpath(dirname(output)), basename(output));
if (canonicalOutput === prepared || canonicalOutput.startsWith(prepared + sep))
	throw new Error("Output must be outside prepared payload");
await fileInfo(prepared, "prepared.json", 1024 ** 2);
const expected = JSON.parse(
	await readFile(join(prepared, "prepared.json"), "utf8"),
);
const matrix = await artifactMatrix(),
	artifact = matrix.artifacts.find((a) => a.id === "linux-amd64-snap");
if (expected.schema !== 1 || expected.artifact !== artifact.id)
	throw new Error("Prepared target mismatch");
validateBuild(expected.buildInfo, artifact, matrix.version);
const resourceName = expected.buildInfo.resourceDirectoryName;
if (
	!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(resourceName) ||
	resourceName.includes("..")
)
	throw new Error("Unsafe resource directory");
const run = (bin, args, opts = {}) =>
	execFileSync(bin, args, {
		encoding: "utf8",
		timeout: 120000,
		maxBuffer: 2 * 1024 ** 2,
		...opts,
	});
const version = run("snapcraft", ["--version"]).trim();
if (version !== "snapcraft 9.0.1")
	throw new Error(
		"GNOME runtime assembly reviewed against Snapcraft 9.0.1; review before changing toolchain",
	);
await fileInfo(sdk, "meta/snap.yaml", 1024 ** 2);
const sdkMeta = snapMetadata(
	await readFile(join(sdk, "meta/snap.yaml"), "utf8"),
);
if (sdkMeta.name !== "snapcraft" || String(sdkMeta.version) !== "9.0.1")
	throw new Error(
		"Snapcraft runtime root does not match the reviewed tool version",
	);
const expandedText = run("snapcraft", ["expand-extensions"], { cwd: prepared });
const expanded = snapMetadata(expandedText);
const fields = [
	"name",
	"title",
	"version",
	"summary",
	"description",
	"base",
	"license",
	"confinement",
	"grade",
	"apps",
	"hooks",
	"plugs",
	"environment",
	"layout",
	"assumes",
];
const meta = JSON.parse(
	JSON.stringify(
		Object.fromEntries(
			fields
				.filter((k) => expanded[k] !== undefined)
				.map((k) => [k, expanded[k]]),
		),
	).replaceAll("$CRAFT_ARCH_TRIPLET_BUILD_FOR", "x86_64-linux-gnu"),
);
meta.architectures = ["amd64"];
delete meta.apps["z8-work"].desktop;
validateSnap(meta, matrix.version, true);
if (JSON.stringify(meta).includes("$CRAFT_"))
	throw new Error("Unexpanded build variable in Snap runtime metadata");
const allowed = new Set([
	"usr/bin/z8-desktop",
	"usr/share/applications/z8-work.desktop",
	"usr/share/icons/hicolor/192x192/apps/z8-work.png",
	"usr/share/licenses/z8-work/LICENSE",
]);
for (const name of await listFiles(join(prepared, "payload")))
	if (
		!allowed.has(name) &&
		!name.startsWith(`usr/lib/${resourceName}/engines/`)
	)
		throw new Error(`Unlisted prepared payload file: ${name}`);
await mkdir(output);
const prime = join(output, "prime");
await cp(join(prepared, "payload"), prime, {
	recursive: true,
	force: false,
	errorOnExist: true,
});
await mkdir(join(prime, "meta/gui"), { recursive: true });
await copyFile(
	join(prime, "usr/share/applications/z8-work.desktop"),
	join(prime, "meta/gui/z8-work.desktop"),
);
await copyFile(
	join(prime, "usr/share/icons/hicolor/192x192/apps/z8-work.png"),
	join(prime, "meta/gui/icon.png"),
);
const sources = [];
for (const [from, name] of [
	["desktop/command-chain/desktop-launch", "desktop-launch"],
	["desktop/command-chain/run", "run"],
	["desktop/command-chain/hooks-configure-fonts", "hooks-configure-fonts"],
	["gpu/command-chain/gpu-wrapper", "gpu-2404-wrapper"],
]) {
	const source = "share/snapcraft/extensions/" + from;
	const original = await fileInfo(sdk, source, 1024 ** 2);
	const body = (await readFile(join(sdk, source), "utf8")).replaceAll(
		"%GPU_INTERFACE%",
		"gpu-2404",
	);
	await mkdir(join(prime, "snap/command-chain"), { recursive: true });
	await writeFile(join(prime, "snap/command-chain", name), body, {
		flag: "wx",
	});
	await chmod(join(prime, "snap/command-chain", name), 0o755);
	sources.push({
		source,
		original,
		file: "snap/command-chain/" + name,
		...(await fileInfo(prime, "snap/command-chain/" + name)),
	});
}
for (const path of [
	"gnome-platform",
	"gpu-2404",
	"data-dir/themes",
	"data-dir/icons",
	"data-dir/sounds",
])
	await mkdir(join(prime, path), { recursive: true });
await writeFile(join(prime, "meta/snap.yaml"), stringify(meta));
await writeFile(join(output, "expanded.yaml"), expandedText);
await writeFile(
	join(prime, "usr/share/licenses/z8-work/snapcraft-runtime.json"),
	JSON.stringify(
		{ tool: version, files: sources, licenseReview: "pending" },
		null,
		2,
	) + "\n",
);
const bundle = await inspectBundle(
	join(prime, "usr/lib", resourceName, "engines"),
);
if (
	bundle.manifestInfo.sha256 !== expected.engineManifestSha256 ||
	(await fileInfo(prime, "usr/bin/z8-desktop")).sha256 !==
		expected.applicationSha256
)
	throw new Error("Prepared payload changed");
await checkSnapDesktop(join(prime, "meta/gui/z8-work.desktop"));
run("snap", ["pack", "--check-skeleton", prime]);
const filename = `z8-work_${matrix.version}_amd64.snap`;
run("snap", [
	"pack",
	"--compression=lzo",
	`--filename=${filename}`,
	prime,
	output,
]);
const file = await fileInfo(output, filename);
await writeFile(
	join(output, "pack.json"),
	JSON.stringify(
		{
			schema: 1,
			artifact: artifact.id,
			filename,
			...file,
			snapcraft: version,
			runtimeSources: sources,
			redistributionApproved: false,
			status: "packed-awaiting-final-check",
		},
		null,
		2,
	) + "\n",
);
console.log(join(output, filename));
