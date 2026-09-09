// Creates a relocatable local validation bundle from explicitly supplied, trusted binaries.
// It does not download, publish, install, or certify licenses for redistribution.
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import {
	readFile,
	writeFile,
	mkdir,
	realpath,
	readdir,
	stat,
	copyFile,
	chmod,
} from "node:fs/promises";
import { basename, dirname, join, resolve, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";

const { values } = parseArgs({
	options: Object.fromEntries(
		[
			"manifest",
			"output",
			"magick-modules",
			"magick-config",
			"heif-plugins",
			"extracted-root",
			"extra-license-dir",
			"verifier",
		].map((k) => [k, { type: "string" }]),
	),
});
if (process.platform !== "linux")
	throw new Error("This assembler supports Linux only");
for (const key of [
	"manifest",
	"output",
	"magick-modules",
	"magick-config",
	"heif-plugins",
	"verifier",
])
	if (!values[key] || !isAbsolute(values[key]))
		throw new Error(`An absolute --${key} is required`);
const output = resolve(values.output);
// Refuse overwriting any previous candidate, even an empty one.
await mkdir(output);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (bin, args, env = {}) =>
	execFileSync(bin, args, {
		encoding: "utf8",
		timeout: 30000,
		maxBuffer: 2 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
		env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", ...env },
	}).trim();
const source = JSON.parse(await readFile(values.manifest, "utf8"));
if (source.schema !== 1 || source.kind !== "development")
	throw new Error("Expected explicit development source manifest");
const rustArch = { arm64: "aarch64", x64: "x86_64" }[process.arch];
if (!rustArch) throw new Error("Unsupported Linux architecture");
const machine = { arm64: 183, x64: 62 }[process.arch];
const origins = new Map();
const elfSources = new Map();
const copied = new Map();
let loader;
async function copy(sourcePath, destination, elf = false) {
	const original = await realpath(sourcePath);
	const bytes = await readFile(original);
	if (
		elf &&
		(bytes.length < 64 ||
			bytes.subarray(0, 4).toString("hex") !== "7f454c46" ||
			bytes[4] !== 2 ||
			bytes[5] !== 1 ||
			bytes.readUInt16LE(18) !== machine)
	)
		throw new Error(`Wrong ELF architecture: ${original}`);
	const sha256 = hash(bytes);
	if (copied.has(destination)) {
		if (copied.get(destination) !== sha256)
			throw new Error(`Conflicting dependency bytes for ${destination}`);
		return;
	}
	const target = join(output, destination);
	await mkdir(dirname(target), { recursive: true });
	await copyFile(original, target);
	// Registry archives may contain group-only notices (e.g. mode 0640).
	// A package must be readable by the installing account, not just its builder.
	await chmod(target, elf ? 0o755 : 0o644);
	copied.set(destination, sha256);
	origins.set(destination, { source: original, sha256, bytes: bytes.length });
	if (elf) elfSources.set(original, destination);
}
const manifest = {
	schema: 2,
	kind: "bundled",
	os: "linux",
	arch: rustArch,
	engines: {},
	files: {},
	loader: null,
	magick_modules: "modules",
	magick_config: "magick-config",
	heif_plugins: "heif-plugins",
};
for (const id of ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]) {
	const entry = source.engines[id];
	if (
		!entry ||
		!isAbsolute(entry.path) ||
		hash(await readFile(entry.path)) !== entry.sha256
	)
		throw new Error(`Invalid source engine: ${id}`);
	await copy(entry.path, `bin/${id}`, true);
	manifest.engines[id] = {
		path: `bin/${id}`,
		sha256: entry.sha256,
		version: entry.version,
		library_dir: "lib",
		...(entry.data_dir ? { data_dir: `data/${id}` } : {}),
	};
	if (entry.data_dir) await copyTree(entry.data_dir, `data/${id}`);
}
async function copyTree(root, target) {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const from = join(root, entry.name),
			to = `${target}/${entry.name}`;
		if (entry.isDirectory()) await copyTree(from, to);
		else if (entry.isFile()) await copy(from, to);
		else throw new Error(`Non-regular data resource: ${from}`);
	}
}
// Include only conversion and fixture coders. Delegates remain disabled by the job policy.
for (const name of [
	"png",
	"jpeg",
	"webp",
	"heic",
	"xc",
	"gradient",
	"plasma",
	"rgb",
	"null",
	"info",
	"meta",
	"magick",
	"pnm",
]) {
	await copy(
		join(values["magick-modules"], `${name}.so`),
		`modules/${name}.so`,
		true,
	);
}
for (const name of await readdir(join(output, "modules"))) {
	const la = name.replace(/\.so$/, ".la");
	await copy(join(values["magick-modules"], la), `modules/${la}`);
	const target = join(output, "modules", la);
	const original = await readFile(target, "utf8");
	await writeFile(target, original.replace(/^libdir=.*$/m, "libdir=''"));
	origins.get(`modules/${la}`).transformation =
		"Clear absolute build-time libdir; load adjacent module";
}
if (!values["magick-config"]) throw new Error("--magick-config is required");
await copy(
	join(values["magick-config"], "colors.xml"),
	"magick-config/colors.xml",
);
for (const file of await readdir(values["heif-plugins"])) {
	if (file.endsWith(".so"))
		await copy(
			join(values["heif-plugins"], file),
			`heif-plugins/${file}`,
			true,
		);
}
// The verifier is a separate test executable, not part of the GUI or its IPC surface.
await copy(values.verifier, "validation/bundle-check", true);
const libraryDirs = [
	...new Set(
		Object.values(source.engines)
			.map((e) => e.library_dir)
			.filter(Boolean),
	),
];
for (const [original] of elfSources) {
	const listing = run("/usr/bin/ldd", [original], {
		LD_LIBRARY_PATH: libraryDirs.join(":"),
	});
	if (/not found/.test(listing))
		throw new Error(`Unresolved dependencies: ${original}\n${listing}`);
	for (const line of listing.split("\n")) {
		const match = line.match(/(?:=>\s+)?(\/[^\s]+)\s+\(0x/);
		if (!match) continue;
		const dependency = match[1];
		const name = basename(dependency);
		await copy(dependency, `lib/${name}`, true);
		if (/^ld-linux.*\.so/.test(name)) {
			if (loader && loader !== name)
				throw new Error("Multiple ELF loaders");
			loader = name;
		}
	}
}
if (!loader) throw new Error("Missing ELF loader");
manifest.loader = `lib/${loader}`;
// Package-owned provenance + license notices; source delivery review stays explicitly pending.
const packages = new Map(),
	unresolved = [];
for (const [resource, origin] of [...origins]) {
	if (
		values["extracted-root"] &&
		origin.source.startsWith(`${await realpath(values["extracted-root"])}/`)
	) {
		origin.package = "extracted-deb-see-provenance";
		continue;
	}
	let owner;
	try {
		owner = run("/usr/bin/dpkg-query", ["-S", origin.source])
			.split("\n")[0]
			.split(": ")[0]
			.split(", ")
			.sort(
				(a, b) =>
					Number(
						b.endsWith(
							`:${process.arch === "arm64" ? "arm64" : "amd64"}`,
						),
					) -
					Number(
						a.endsWith(
							`:${process.arch === "arm64" ? "arm64" : "amd64"}`,
						),
					),
			)[0];
	} catch {
		/* Extracted .deb resources are resolved below. */
	}
	if (owner) {
		const metadata = run("/usr/bin/dpkg-query", [
			"-W",
			"-f=${binary:Package}\t${Version}\t${source:Package}\t${source:Version}",
			owner,
		]);
		packages.set(owner, metadata);
		const doc = `/usr/share/doc/${owner.split(":")[0]}/copyright`;
		try {
			await copy(doc, `licenses/${owner.replace(":", "_")}.copyright`);
		} catch {
			unresolved.push({
				resource,
				reason: "Package copyright not found",
				owner,
			});
		}
		origin.package = owner;
	} else if (
		values["extracted-root"] &&
		origin.source.startsWith(`${await realpath(values["extracted-root"])}/`)
	) {
		origin.package = "extracted-deb-see-provenance";
	} else if (!resource.startsWith("validation/"))
		unresolved.push({ resource, reason: "Package ownership unresolved" });
}
if (values["extracted-root"]) {
	const docRoot = join(values["extracted-root"], "usr/share/doc");
	for (const dir of await readdir(docRoot)) {
		try {
			await copy(
				join(docRoot, dir, "copyright"),
				`licenses/extracted-${dir}.copyright`,
			);
		} catch {
			/* Report source archive audit as pending below, not approved. */
		}
	}
}
if (values["extra-license-dir"])
	await copyTree(
		await realpath(values["extra-license-dir"]),
		"licenses/source-build",
	);
for (const name of await readdir("/usr/share/common-licenses")) {
	await copy(`/usr/share/common-licenses/${name}`, `licenses/common/${name}`);
}
const provenance = {
	schema: 1,
	scope: "local-validation-only",
	redistributionApproved: false,
	pending: [
		"Review complete corresponding source, patches and build instructions for every binary and dependency",
		"Native installer, permissions, update and uninstall acceptance",
	],
	host: await readFile("/etc/os-release", "utf8"),
	applicationCommit: run("/usr/bin/git", [
		"-c",
		`safe.directory=${process.cwd()}`,
		"rev-parse",
		"HEAD",
	]),
	applicationDirty: !!run("/usr/bin/git", [
		"-c",
		`safe.directory=${process.cwd()}`,
		"--no-optional-locks",
		"status",
		"--porcelain",
	]),
	toolchain: {
		node: process.version,
		rust: run("rustc", ["--version"], {
			PATH: process.env.PATH,
			...(process.env.RUSTUP_TOOLCHAIN
				? { RUSTUP_TOOLCHAIN: process.env.RUSTUP_TOOLCHAIN }
				: {}),
		}),
	},
	sourceManifestSha256: hash(await readFile(values.manifest)),
	packages: Object.fromEntries(packages),
	unresolved,
	resources: Object.fromEntries(origins),
};
await writeFile(
	join(output, "provenance.json"),
	`${JSON.stringify(provenance, null, 2)}\n`,
);
async function inventory(dir, prefix = "") {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name),
			name = `${prefix}${entry.name}`;
		if (entry.isDirectory()) await inventory(path, `${name}/`);
		else
			manifest.files[name] = {
				sha256: hash(await readFile(path)),
				bytes: (await stat(path)).size,
			};
	}
}
await inventory(output);
await writeFile(
	join(output, "engines.json"),
	`${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
	JSON.stringify(
		{
			output,
			files: Object.keys(manifest.files).length,
			bytes: Object.values(manifest.files).reduce(
				(n, f) => n + f.bytes,
				0,
			),
			loader: manifest.loader,
			redistributionApproved: false,
		},
		null,
		2,
	),
);
