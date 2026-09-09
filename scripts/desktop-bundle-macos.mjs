// Assemble explicitly prepared ARM64 resources. Relocation/signing must happen
// before this step; no search through PATH/Homebrew and no implicit downloads.
import { parseArgs } from "node:util";
import { readFile, mkdir, writeFile, copyFile, lstat } from "node:fs/promises";
import { resolve, join, relative, dirname, sep } from "node:path";
import { fileInfo, listFiles, relativeName } from "./lib/desktop-sources.mjs";
import { inspectMacBundle } from "./lib/desktop-macos.mjs";
import { assertOutside } from "./lib/desktop-windows-acceptance.mjs";
import { sha256 } from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["resources", "manifest", "record", "output"].map((k) => [
			k,
			{ type: "string" },
		]),
	),
});
for (const key of ["resources", "manifest", "record", "output"])
	if (!values[key]) throw new Error(`--${key} required`);
const root = resolve(values.resources),
	output = resolve(values.output);
await assertOutside(root, output);
if ((await lstat(root)).isSymbolicLink())
	throw new Error("Resource root cannot be a symlink");
const manifestBytes = await readFile(values.manifest),
	recordBytes = await readFile(values.record);
const source = JSON.parse(manifestBytes),
	record = JSON.parse(recordBytes);
if (
	source.schema !== 1 ||
	source.kind !== "development" ||
	Object.keys(source.engines ?? {})
		.sort()
		.join() !== ["ffmpeg", "ffprobe", "magick", "mutool", "pandoc"].join()
)
	throw new Error("Use the explicit five-engine development manifest");
if (
	record.schema !== 1 ||
	record.os !== "macos" ||
	record.arch !== "aarch64" ||
	!Array.isArray(record.sources) ||
	!record.sources.length ||
	record.redistributionApproved !== false
)
	throw new Error(
		"Explicit macOS source/build record required; not distribution approval",
	);
const files = await listFiles(root);
if (files.includes("engines.json") || files.includes("provenance.json"))
	throw new Error(
		"Prepared resources must not contain a previous bundle manifest",
	);
if (
	!files.some((f) => f.startsWith("licenses/")) ||
	!files.includes("validation/bundle-check")
)
	throw new Error("Prepared verifier and notices required");
const manifest = {
	schema: 2,
	kind: "bundled",
	os: "macos",
	arch: "aarch64",
	loader: null,
	engines: {},
	files: {},
};
function local(path) {
	const value = relative(root, resolve(path)).split(sep).join("/");
	relativeName(value);
	return value;
}
for (const [id, entry] of Object.entries(source.engines)) {
	const name = local(entry.path),
		info = await fileInfo(root, name);
	if (
		info.sha256 !== entry.sha256 ||
		typeof entry.version !== "string" ||
		!entry.version.trim()
	)
		throw new Error(`Source engine changed: ${id}`);
	manifest.engines[id] = {
		path: name,
		sha256: info.sha256,
		version: entry.version,
		...(entry.data_dir ? { data_dir: local(entry.data_dir) } : {}),
		...(entry.library_dir ? { library_dir: local(entry.library_dir) } : {}),
	};
}
for (const [key, path] of [
	["magick_modules", "modules"],
	["magick_config", "magick-config"],
	["heif_plugins", "heif-plugins"],
])
	if (files.some((f) => f.startsWith(path + "/"))) manifest[key] = path;
await mkdir(output);
for (const name of files) {
	const before = await fileInfo(root, name);
	await mkdir(dirname(join(output, name)), { recursive: true });
	await copyFile(join(root, name), join(output, name));
	const copied = await fileInfo(output, name);
	if (copied.sha256 !== before.sha256 || copied.bytes !== before.bytes)
		throw new Error("Copied resource changed");
	manifest.files[name] = copied;
}
const provenance = {
	schema: 1,
	kind: "macos-explicit-resources",
	sourceManifestSha256: sha256(manifestBytes),
	buildRecordSha256: sha256(recordBytes),
	buildRecord: record,
	redistributionApproved: false,
	execution: "not-run",
	sourceClosure: "pending",
	signature: "requires-native-verification",
};
await writeFile(
	join(output, "provenance.json"),
	JSON.stringify(provenance, null, 2) + "\n",
	{ flag: "wx" },
);
manifest.files["provenance.json"] = await fileInfo(output, "provenance.json");
await writeFile(
	join(output, "engines.json"),
	JSON.stringify(manifest, null, 2) + "\n",
	{ flag: "wx" },
);
const checked = await inspectMacBundle(output);
console.log(
	JSON.stringify(
		{
			status: "static-layout-checked",
			files: Object.keys(manifest.files).length,
			machObjects: checked.machObjects,
			manifest: checked.manifestInfo,
			redistributionApproved: false,
			execution: "not-run",
		},
		null,
		2,
	),
);
