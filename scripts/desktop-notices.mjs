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
import { join, resolve, dirname, basename, sep } from "node:path";
import { sha256 } from "./lib/desktop-artifacts.mjs";
import { fileInfo } from "./lib/desktop-sources.mjs";
const { values } = parseArgs({
	options: {
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
		"aarch64-apple-darwin",
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
		"packaged-engines",
		"custom-protocol",
		...(values.target.endsWith("linux-gnu")
			? [values.portal ? "linux-portal" : "gtk-dialog"]
			: []),
	];
const args = [
	"metadata",
	"--locked",
	"--offline",
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
const graph = JSON.parse(
	await readFile(".desktop-local/frontend-modules.json", "utf8"),
);
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
			to = join("licenses", key + "-" + basename(path));
		await copyFile(join(packageRoot, path), join(output, to));
		if ((await fileInfo(output, to)).sha256 !== info.sha256)
			throw new Error("Notice changed while copying");
		notices.push({ file: to, ...info });
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
				const to = join("licenses", key + "-" + basename(notice.file));
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
for (const id of graph.modules) {
	if (typeof id !== "string" || !id.startsWith("node_modules/")) continue;
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
const inputs = {};
for (const path of [
	"bun.lock",
	"src-tauri/Cargo.lock",
	".desktop-local/frontend-modules.json",
])
	inputs[path] = sha256(await readFile(path));
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
		"Native engine/delegate notices and source closure are tracked in the engine dossier",
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
