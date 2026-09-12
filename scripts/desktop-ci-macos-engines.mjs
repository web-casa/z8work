// Native preview preparation: capture installed formula receipts, copy the
// dependency closure, relocate private copies, then sign before fingerprinting.
import { execFileSync } from "node:child_process";
import {
	readFile,
	writeFile,
	mkdir,
	copyFile,
	realpath,
	readdir,
	stat,
	chmod,
	cp,
} from "node:fs/promises";
import { resolve, join, dirname, basename, relative, posix } from "node:path";
import { inspectMachO } from "./lib/desktop-macos.mjs";
import { fileInfo } from "./lib/desktop-sources.mjs";
if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch))
	throw new Error("Native macOS required");
const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
const target = `${arch}-apple-darwin`;
const root = resolve(".desktop-local/mac-preview");
await mkdir(root);
const resources = join(root, "resources");
await mkdir(resources);
const run = (cmd, args, timeout = 120000) =>
	execFileSync(cmd, args, {
		encoding: "utf8",
		timeout,
		maxBuffer: 32 * 1024 ** 2,
	});
const pandocArch = process.arch === "arm64" ? "arm64" : "x86_64";
const pandocSource = {
	url: `https://github.com/jgm/pandoc/releases/download/3.11/pandoc-3.11-${pandocArch}-macOS.zip`,
	sha256:
		process.arch === "arm64"
			? "15806bedf9517bfead72e88fe6a6696635c3691efbb6e152173440e9c5bb50b4"
			: "3b1c1b57f160112c821d02f23d946ede8b7f57a6ccf4632a25a512d334a9291f",
};
const response = await fetch(pandocSource.url, {
	signal: AbortSignal.timeout(300000),
});
if (!response.ok) throw new Error(`Pandoc download: ${response.status}`);
await writeFile(
	join(root, "pandoc.zip"),
	Buffer.from(await response.arrayBuffer()),
);
if ((await fileInfo(root, "pandoc.zip")).sha256 !== pandocSource.sha256)
	throw new Error("Pandoc archive changed");
run("/usr/bin/unzip", [
	"-q",
	join(root, "pandoc.zip"),
	"-d",
	join(root, "pandoc"),
]);
const formulae = ["imagemagick", "ffmpeg", "mupdf-tools"];
const prefixes = Object.fromEntries(
	formulae.map((f) => [f, run("brew", ["--prefix", f]).trim()]),
);
prefixes.pandoc = join(root, "pandoc", `pandoc-3.11-${pandocArch}`);
const sources = JSON.parse(
	run("brew", ["info", "--json=v2", "--installed"]),
).formulae;
await writeFile(
	join(root, "brew-receipts.json"),
	JSON.stringify(sources, null, 2) + "\n",
);
const objects = new Map(),
	destinations = new Map(),
	packages = new Set();
const cellar = await realpath(run("brew", ["--cellar"]).trim());
async function stage(source, name) {
	source = await realpath(source);
	if (objects.has(source)) return objects.get(source).name;
	if (destinations.has(name) && destinations.get(name) !== source)
		throw new Error(`Duplicate code destination: ${name}`);
	const bytes = await readFile(source);
	const object = inspectMachO(bytes);
	if (object.arch !== arch)
		throw new Error(`Wrong engine architecture: ${source}`);
	if (source.startsWith(cellar + "/"))
		packages.add(relative(cellar, source).split("/")[0]);
	const item = { source, name, object, dependencies: [] };
	objects.set(source, item);
	destinations.set(name, source);
	await mkdir(dirname(join(resources, name)), { recursive: true });
	await copyFile(source, join(resources, name));
	await chmod(join(resources, name), 0o755);
	for (const dependency of object.dependencies) {
		if (/^(\/usr\/lib\/|\/System\/Library\/)/.test(dependency)) continue;
		let candidates;
		if (dependency.startsWith("/")) candidates = [dependency];
		else if (dependency.startsWith("@loader_path/"))
			candidates = [join(dirname(source), dependency.slice(13))];
		else if (dependency.startsWith("@rpath/"))
			candidates = object.rpaths.map((p) =>
				join(
					p.replace("@loader_path", dirname(source)),
					dependency.slice(7),
				),
			);
		else throw new Error(`Unresolved source dependency: ${dependency}`);
		const matches = [];
		for (const p of candidates) {
			try {
				const r = await realpath(p);
				if (!matches.includes(r)) matches.push(r);
			} catch (e) {
				if (e.code !== "ENOENT") throw e;
			}
		}
		if (matches.length !== 1)
			throw new Error(
				`Ambiguous/missing dependency: ${source} -> ${dependency}`,
			);
		const resolved = matches[0];
		if (!resolved.startsWith(cellar + "/"))
			throw new Error(
				`Non-system dependency outside recorded Cellar: ${resolved}`,
			);
		const local = await stage(
			resolved,
			"lib/" + relative(cellar, resolved),
		);
		item.dependencies.push({
			from: dependency,
			to: "@loader_path/" + posix.relative(posix.dirname(name), local),
		});
	}
	return name;
}
for (const [id, formula] of Object.entries({
	magick: "imagemagick",
	ffmpeg: "ffmpeg",
	ffprobe: "ffmpeg",
	pandoc: "pandoc",
	mutool: "mupdf-tools",
}))
	await stage(join(prefixes[formula], "bin", id), "bin/" + id);
await stage(
	resolve(`src-tauri/target/${target}/release/bundle-check`),
	"validation/bundle-check",
);
// Modules/plugins are loaded dynamically and are not discoverable via load commands.
async function optionalTree(source, destination) {
	let entries;
	try {
		entries = await readdir(source, { withFileTypes: true });
	} catch (e) {
		if (e.code === "ENOENT") return;
		throw e;
	}
	for (const entry of entries) {
		const input = join(source, entry.name),
			output = join(destination, entry.name);
		const info = await stat(input);
		if (info.isDirectory()) await optionalTree(input, output);
		else if (info.isFile()) {
			if (entry.name.endsWith(".la") || entry.name.endsWith(".a"))
				continue;
			const b = await readFile(input);
			if (b.subarray(0, 4).toString("hex") === "cffaedfe")
				await stage(input, output);
			else {
				await mkdir(dirname(join(resources, output)), {
					recursive: true,
				});
				await copyFile(input, join(resources, output));
			}
		}
	}
}
for (const entry of await readdir(join(prefixes.imagemagick, "lib")))
	if (entry.startsWith("ImageMagick-")) {
		for (const mod of await readdir(
			join(prefixes.imagemagick, "lib", entry),
		))
			if (mod.startsWith("modules-"))
				await optionalTree(
					join(prefixes.imagemagick, "lib", entry, mod, "coders"),
					"modules",
				);
	}
await optionalTree(
	join(prefixes.imagemagick, "etc/ImageMagick-7"),
	"magick-config",
);
const heif = run("brew", ["--prefix", "libheif"]).trim();
await optionalTree(join(heif, "lib/libheif"), "heif-plugins");
let minimum = 11 * 65536;
for (const item of objects.values()) {
	if (item.object.deployment?.platform !== 1)
		throw new Error(`Missing macOS deployment: ${item.source}`);
	minimum = Math.max(minimum, item.object.deployment.minimum);
	const path = join(resources, item.name);
	const args = [];
	for (const d of item.dependencies) args.push("-change", d.from, d.to);
	for (const r of item.object.rpaths) args.push("-delete_rpath", r);
	if (item.object.fileType === 6)
		args.push("-id", "@loader_path/" + basename(item.name));
	if (args.length) run("/usr/bin/install_name_tool", [...args, path]);
	run("/usr/bin/codesign", ["--force", "--sign", "-", path]);
	run("/usr/bin/codesign", ["--verify", "--strict", path]);
}
for (const pkg of packages) {
	const prefix = await realpath(run("brew", ["--prefix", pkg]).trim());
	const info = sources.find((s) => s.name === pkg);
	if (!info) throw new Error(`Missing formula receipt: ${pkg}`);
	const out = join(resources, "licenses", pkg);
	await mkdir(out, { recursive: true });
	await writeFile(
		join(out, "formula.json"),
		JSON.stringify(info, null, 2) + "\n",
	);
	for (const name of await readdir(prefix))
		if (
			/^(LICENSE|COPYING|NOTICE|AUTHORS|COPYRIGHT)/i.test(name) &&
			(await stat(join(prefix, name))).isFile()
		)
			await copyFile(join(prefix, name), join(out, name));
	await optionalTree(join(prefix, ".brew"), "licenses/" + pkg + "/formula");
}
await mkdir(join(resources, "licenses/pandoc"), { recursive: true });
await copyFile(
	"packaging/desktop/notices/pandoc-3.11-COPYING.md",
	join(resources, "licenses/pandoc/COPYING.md"),
);
await cp(
	resolve(".desktop-local/ci/application/notices/licenses"),
	join(resources, "licenses/application"),
	{ recursive: true },
);
const engines = {};
for (const id of ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]) {
	const path = join(resources, "bin", id);
	// mutool writes its version to stderr.
	let version;
	if (id === "mutool") {
		const { spawnSync } = await import("node:child_process");
		const result = spawnSync(path, ["-v"], {
			encoding: "utf8",
			timeout: 15000,
		});
		if (result.error || result.status !== 0)
			throw new Error(result.stderr || String(result.error));
		version = (result.stdout || result.stderr).trim().split("\n")[0];
	} else
		version = run(path, [id === "pandoc" ? "--version" : "-version"])
			.trim()
			.split("\n")[0];
	engines[id] = {
		path,
		sha256: (await fileInfo(resources, "bin/" + id)).sha256,
		version,
	};
}
const minimumSystemVersion = `${minimum >>> 16}.${(minimum >>> 8) & 255}.${minimum & 255}`;
const record = {
	schema: 1,
	os: "macos",
	arch,
	minimumSystemVersion,
	sources: [...sources.filter((s) => packages.has(s.name)), pandocSource],
	redistributionApproved: false,
};
await writeFile(
	join(root, "record.json"),
	JSON.stringify(record, null, 2) + "\n",
);
await writeFile(
	join(root, "development.json"),
	JSON.stringify({ schema: 1, kind: "development", engines }, null, 2) + "\n",
);
const config = JSON.parse(
	await readFile("packaging/desktop/macos/development.json", "utf8"),
);
config.architecture = arch;
config.minimumSystemVersion = minimumSystemVersion;
await writeFile(
	join(root, "config.json"),
	JSON.stringify(config, null, 2) + "\n",
);
run(process.execPath, [
	"scripts/desktop-bundle-macos.mjs",
	"--resources",
	resources,
	"--manifest",
	join(root, "development.json"),
	"--record",
	join(root, "record.json"),
	"--output",
	join(root, "engines"),
]);
run(
	process.execPath,
	[
		"scripts/desktop-candidate-macos.mjs",
		"--binary",
		resolve(".desktop-local/ci/application/z8-desktop"),
		"--engines",
		join(root, "engines"),
		"--config",
		join(root, "config.json"),
		"--output",
		join(root, "candidate"),
	],
	2100000,
);
const app = join(root, "candidate", config.name + ".app");
const downloads = join(root, "downloads");
await mkdir(downloads);
const dmg = `Z8.Work-macos-${process.arch === "arm64" ? "arm64" : "amd64"}-preview.dmg`;
run(
	"/usr/bin/hdiutil",
	[
		"create",
		"-volname",
		"Z8.Work",
		"-srcfolder",
		app,
		"-format",
		"UDZO",
		join(downloads, dmg),
	],
	300000,
);
run("/usr/bin/hdiutil", ["verify", join(downloads, dmg)], 300000);
await writeFile(
	join(downloads, "SHA256SUMS"),
	`${(await fileInfo(downloads, dmg)).sha256}  ${dmg}\n`,
);
console.log(
	JSON.stringify({
		dmg,
		minimumSystemVersion,
		arch,
		signing: "ad-hoc-preview",
		gui: "not-run",
	}),
);
