// Collect notices from the actual frontend module graph and filtered Cargo graph.
// This is conservative material collection, never automatic license approval.
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import {
	mkdir,
	readFile,
	readdir,
	copyFile,
	writeFile,
} from "node:fs/promises";
import { join, resolve, dirname, basename, sep, posix } from "node:path";
import { sha256 } from "./lib/desktop-artifacts.mjs";
import { fileInfo } from "./lib/desktop-sources.mjs";
const { values } = parseArgs({
	options: {
		web: { type: "boolean", default: false },
		output: { type: "string" },
		target: { type: "string" },
		portal: { type: "boolean", default: false },
	},
});
if (
	!values.output ||
	![
		"aarch64-unknown-linux-gnu",
		"x86_64-unknown-linux-gnu",
		"x86_64-pc-windows-msvc",
		"aarch64-pc-windows-msvc",
		"aarch64-apple-darwin",
		"x86_64-apple-darwin",
	].includes(values.target)
)
	throw new Error(
		"Use --output NEW_DIR --target supported-triple [--portal]",
	);
if (values.portal && !values.target.endsWith("linux-gnu"))
	throw new Error("Portal only applies to Linux");
const root = process.cwd(),
	output = resolve(values.output),
	features = [
		...(values.web ? [] : ["packaged-engines"]),
		"custom-protocol",
		...(values.target.endsWith("linux-gnu")
			? [values.portal ? "linux-portal" : "gtk-dialog"]
			: []),
	];
const args = [
	"metadata",
	"--locked",
	...(values.web ? [] : ["--offline"]),
	"--format-version",
	"1",
	"--manifest-path",
	"src-tauri/Cargo.toml",
	"--filter-platform",
	values.target,
	"--no-default-features",
	"--features",
	features.join(","),
];
const metadata = JSON.parse(
	execFileSync("cargo", args, {
		encoding: "utf8",
		timeout: 60000,
		maxBuffer: 32 * 1024 ** 2,
	}),
);
const graphPath = values.web
	? ".desktop-local/web-frontend-modules.json"
	: ".desktop-local/frontend-modules.json";
const graph = JSON.parse(await readFile(graphPath, "utf8"));
if (graph.schema !== 1 || !Array.isArray(graph.modules))
	throw new Error("Build desktop frontend first");
await mkdir(output);
await mkdir(join(output, "licenses"));
const records = [];
const supplementRoot = join(root, "packaging/desktop/notices");
const supplement = JSON.parse(
	await readFile(join(supplementRoot, "supplement.json"), "utf8"),
);
if (supplement.schema !== 1 || supplement.redistributionApproved !== false)
	throw new Error("Invalid notice supplement");
async function collect(
	kind,
	name,
	version,
	license,
	packageRoot,
	declaredFile,
	source,
) {
	const key = `${kind}-${name.replaceAll("/", "_").replaceAll("@", "")}-${version}`;
	if (!/^[A-Za-z0-9_.+-]+$/.test(key))
		throw new Error("Unsafe component identifier");
	const paths = (await readdir(packageRoot, { withFileTypes: true }))
		.filter(
			(e) =>
				e.isFile() &&
				/^(?:licen[sc]e|copying|copyright|notice|ofl)(?:[._-]|$)/i.test(
					e.name,
				),
		)
		.map((e) => e.name);
	if (declaredFile && !paths.includes(declaredFile)) paths.push(declaredFile);
	const notices = [];
	for (const path of paths) {
		const info = await fileInfo(packageRoot, path, 2 * 1024 ** 2),
			to = posix.join("licenses", key + "-" + basename(path));
		await copyFile(join(packageRoot, path), join(output, to));
		if ((await fileInfo(output, to)).sha256 !== info.sha256)
			throw new Error("Notice changed while copying");
		notices.push({ file: to, ...info });
	}
	if (!notices.length && values.web && kind === "npm") {
		const overrides = {
			"@ffmpeg/core@0.12.10": "ffmpeg-core-GPL-2.0.txt",
			"@ffmpeg/ffmpeg@0.12.15": "ffmpeg-MIT.txt",
		};
		const file = overrides[`${name}@${version}`];
		if (file) {
			const manifest = JSON.parse(
				await readFile(
					"packaging/desktop-web/notices/provenance.json",
					"utf8",
				),
			);
			const entry = manifest.find((n) => n.file === file);
			const info = await fileInfo(
				"packaging/desktop-web/notices",
				file,
				2 * 1024 ** 2,
			);
			if (!entry || entry.sha256 !== info.sha256)
				throw Error("Web notice provenance mismatch");
			const to = posix.join("licenses", key + "-" + file);
			await copyFile(
				join("packaging/desktop-web/notices", file),
				join(output, to),
			);
			notices.push({ file: to, ...info, url: entry.url });
		}
	}
	if (!notices.length && kind === "cargo") {
		const added = supplement.components.find(
			(p) => p.name === name && p.version === version,
		);
		if (added) {
			const vcs = JSON.parse(
				await readFile(
					join(packageRoot, ".cargo_vcs_info.json"),
					"utf8",
				),
			);
			if (
				vcs.git?.sha1 !== added.commit ||
				license !== added.declaredLicense
			)
				throw new Error(
					"Supplement does not match crate source revision/license",
				);
			for (const notice of added.notices) {
				const info = await fileInfo(
					supplementRoot,
					notice.file,
					2 * 1024 ** 2,
				);
				if (
					info.sha256 !== notice.sha256 ||
					info.bytes !== notice.bytes
				)
					throw new Error("Supplement notice changed");
				const to = posix.join(
					"licenses",
					key + "-" + basename(notice.file),
				);
				await copyFile(
					join(supplementRoot, notice.file),
					join(output, to),
				);
				notices.push({
					file: to,
					...info,
					url: notice.url,
					commit: added.commit,
					basis: notice.basis ?? "Exact source revision notice",
				});
			}
		}
	}
	records.push({
		kind,
		name,
		version,
		declaredLicense: license ?? null,
		source: source ?? null,
		notices,
		status: notices.length
			? "notices-collected-review-pending"
			: "notice-missing",
	});
}
const seen = new Set();
for (const moduleId of graph.modules) {
	if (typeof moduleId !== "string") continue;
	const id = moduleId.replaceAll("\\", "/");
	if (!id.startsWith("node_modules/")) continue;
	let dir = dirname(resolve(root, id));
	while (dir.startsWith(root + sep)) {
		let p;
		try {
			p = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
		} catch (e) {
			if (e.code !== "ENOENT") throw e;
		}
		if (p?.name && p?.version) {
			if (!seen.has(dir)) {
				seen.add(dir);
				await collect(
					"npm",
					p.name,
					p.version,
					p.license,
					dir,
					null,
					p.repository ?? null,
				);
			}
			break;
		}
		dir = dirname(dir);
	}
}
if (!seen.size)
	throw new Error("No frontend dependencies found in module receipt");
const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n])),
	included = new Set(),
	pending = [metadata.resolve.root];
while (pending.length) {
	const id = pending.pop();
	if (included.has(id)) continue;
	included.add(id);
	for (const dep of nodes.get(id)?.deps ?? [])
		if (dep.dep_kinds.some((k) => k.kind !== "dev")) pending.push(dep.pkg);
}
for (const p of metadata.packages)
	if (included.has(p.id) && p.source)
		await collect(
			"cargo",
			p.name,
			p.version,
			p.license,
			dirname(p.manifest_path),
			p.license_file,
			p.source,
		);
await collect(
	"application",
	"Z8.Work",
	metadata.packages.find((p) => p.id === metadata.resolve.root).version,
	"AGPL-3.0",
	root,
	null,
	"https://github.com/web-casa/z8work",
);
async function collectApplicationAsset(name, license, notice, source) {
	const root = join("packaging", "desktop", "fonts");
	const info = await fileInfo(root, notice, 2 * 1024 ** 2);
	const key = `application-asset-${name}`;
	const target = posix.join("licenses", `${key}-${basename(notice)}`);
	await copyFile(join(root, notice), join(output, target));
	if ((await fileInfo(output, target)).sha256 !== info.sha256)
		throw new Error("Application asset notice changed while copying");
	records.push({
		kind: "application-asset",
		name,
		version: "embedded",
		declaredLicense: license,
		source,
		notices: [{ file: target, ...info }],
		status: "notices-collected-review-pending",
	});
}
await collectApplicationAsset(
	"HostGrotesk-Regular",
	"OFL-1.1",
	"HostGrotesk-OFL.txt",
	"https://github.com/Element-Type/HostGrotesk/tree/ab2ba6769119e7ae71aa2fab46eedcb993c670a3",
);
if (!values.web)
	await collectApplicationAsset(
		"DroidSansFallbackFull",
		"Apache-2.0",
		"Android-Apache-2.0-NOTICE.txt",
		"https://android.googlesource.com/platform/frameworks/base/+/refs/tags/android-15.0.0_r25/data/fonts/DroidSansFallbackFull.ttf",
	);
const inputs = {};
for (const path of [
	"bun.lock",
	"src-tauri/Cargo.lock",
	graphPath,
	"packaging/desktop/fonts/HostGrotesk-Regular.ttf",
	"packaging/desktop/fonts/DroidSansFallbackFull.ttf",
	"packaging/desktop/fonts/HostGrotesk-OFL.txt",
	"packaging/desktop/fonts/Android-Apache-2.0-NOTICE.txt",
].filter((p) => !values.web || !/DroidSans|Android-Apache/.test(p)))
	inputs[path] = sha256(await readFile(path));
if (values.web) {
	for (const name of await readdir("src/lib/assets/font"))
		inputs[`src/lib/assets/font/${name}`] = sha256(
			await readFile(`src/lib/assets/font/${name}`),
		);
	await collect(
		"application-asset",
		"ICC-profiles",
		"embedded",
		"See profile notice",
		"src/lib/assets/profiles",
		"LICENSE.txt",
		"src/lib/assets/profiles/README.md",
	);
}
if (values.web) {
	const provenance = JSON.parse(
		await readFile("packaging/desktop-web/notices/provenance.json", "utf8"),
	);
	const entry = provenance.find((n) => n.file === "pandoc-COPYRIGHT.txt");
	const file = join("packaging/desktop-web/notices", entry.file);
	if (sha256(await readFile(file)) !== entry.sha256)
		throw Error("Pandoc notice changed");
	const to = "licenses/wasm-pandoc-COPYRIGHT.txt";
	await copyFile(file, join(output, to));
	records.push({
		kind: "wasm",
		name: "Pandoc",
		version: "3.5 (binary marker)",
		declaredLicense: "GPL-2.0-or-later",
		source: entry.url,
		notices: [{ file: to, ...(await fileInfo(output, to)) }],
		status: "upstream-version-notice-collected-build-provenance-pending",
	});
	for (const path of [
		"packaging/desktop-web/engines.json",
		"packaging/desktop-web/notices/provenance.json",
	])
		inputs[path] = sha256(await readFile(path));
}
const report = {
	schema: 1,
	target: values.target,
	features,
	cargoCommand: args,
	scope: "Loaded frontend modules and resolved non-dev Cargo graph, including build dependencies; not exact linked-code/source closure",
	redistributionApproved: false,
	inputs,
	components: records,
	missingNotices: records
		.filter((r) => !r.notices.length)
		.map((r) => `${r.kind}:${r.name}@${r.version}`),
	pending: [
		"Review SPDX alternatives and compatibility for the actual linked application",
		"Collect complete corresponding sources, patches and reproducible build inputs",
		values.web
			? "WASM embedded libraries and corresponding sources are tracked in packaging/desktop-web/engines.json"
			: "Native engine/delegate notices and source closure are tracked in the engine dossier",
	],
};
await writeFile(
	join(output, "dossier.json"),
	JSON.stringify(report, null, 2) + "\n",
	{ flag: "wx" },
);
console.log(
	JSON.stringify(
		{
			components: records.length,
			missingNotices: report.missingNotices,
			redistributionApproved: false,
		},
		null,
		2,
	),
);
