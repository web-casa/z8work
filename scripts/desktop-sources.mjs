import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, copyFile, realpath } from "node:fs/promises";
import { resolve, join, dirname, basename, sep } from "node:path";
import {
	inspectBundle,
	auditSources,
	listFiles,
	verifyDsc,
	fileInfo,
} from "./lib/desktop-sources.mjs";
const { values } = parseArgs({
	options: {
		...Object.fromEntries(
			["engines", "debs", "extracted-root", "sources", "output"].map(
				(k) => [k, { type: "string" }],
			),
		),
		"require-complete": { type: "boolean", default: false },
		"installed-metadata": { type: "boolean", default: false },
	},
});
for (const name of ["engines", "output"])
	if (!values[name]) throw new Error(`--${name} required`);
if (Boolean(values.debs) !== Boolean(values["extracted-root"]))
	throw new Error("--debs and --extracted-root must be supplied together");
const root = resolve(values.engines),
	output = resolve(values.output);
const canonicalRoot = await realpath(root);
const canonicalOutput = join(await realpath(dirname(output)), basename(output));
if (
	canonicalOutput === canonicalRoot ||
	canonicalOutput.startsWith(canonicalRoot + sep)
)
	throw new Error("Audit output must be outside the immutable engine bundle");
const bundle = await inspectBundle(root);
await mkdir(output); // Refuse to overwrite an existing reviewed dossier.
let catalog = { schema: 1, debs: [] };
if (values.debs) {
	catalog = JSON.parse(
		execFileSync(
			"python3",
			[
				"scripts/desktop-deb-catalog.py",
				"--provenance",
				join(root, "provenance.json"),
				"--debs",
				resolve(values.debs),
				"--extracted-root",
				resolve(values["extracted-root"]),
			],
			{ encoding: "utf8", timeout: 300000, maxBuffer: 8 * 1024 ** 2 },
		),
	);
	await writeFile(
		join(output, "deb-catalog.json"),
		JSON.stringify(catalog, null, 2) + "\n",
	);
}
if (values["installed-metadata"]) {
	const owners = Object.keys(bundle.provenance.packages);
	if (
		owners.length > 1000 ||
		owners.some((p) => !/^[a-z0-9][a-z0-9+.-]+(?::[a-z0-9]+)?$/.test(p))
	)
		throw new Error("Invalid recorded system package names");
	const control = execFileSync("dpkg-query", ["--status", ...owners], {
		encoding: "utf8",
		timeout: 30000,
		maxBuffer: 8 * 1024 ** 2,
	});
	catalog.system = control.trim().split(/\n\n+/);
}
await writeFile(
	join(output, "deb-catalog.json"),
	JSON.stringify(catalog, null, 2) + "\n",
);
const archives = [],
	invalidSources = [];
if (values.sources) {
	const sourceRoot = resolve(values.sources);
	for (const name of await listFiles(sourceRoot))
		if (name.endsWith(".dsc"))
			try {
				archives.push(await verifyDsc(sourceRoot, name));
			} catch (error) {
				invalidSources.push({ file: name, error: error.message });
			}
}
const report = await auditSources(bundle, catalog, archives);
report.sourceArchiveRoot = values.sources ? resolve(values.sources) : null;
report.invalidSources = invalidSources;
if (invalidSources.length) report.status = "incomplete";
for (const source of report.sources)
	for (const notice of source.notices ?? []) {
		const destination = join(output, notice.file);
		await mkdir(dirname(destination), { recursive: true });
		await copyFile(join(root, notice.file), destination);
		if ((await fileInfo(output, notice.file)).sha256 !== notice.sha256)
			throw new Error("Copied license notice changed");
	}
// Notices can refer to the standard license bodies; include those verbatim as well.
for (const name of Object.keys(bundle.manifest.files).filter((n) =>
	n.startsWith("licenses/common/"),
)) {
	const destination = join(output, name);
	await mkdir(dirname(destination), { recursive: true });
	await copyFile(join(root, name), destination);
	if (
		(await fileInfo(output, name)).sha256 !==
		bundle.manifest.files[name].sha256
	)
		throw new Error("Copied common license changed");
}
const rows = report.sources.map(
	(s) =>
		`| ${s.source} | ${s.version} | ${s.resources.length} | ${s.notices?.length ?? 0} | ${s.delivery.status === "missing" ? "缺失" : "SHA-256 已核对；签名/构建未验收"} |`,
);
await writeFile(
	join(output, "README.md"),
	`# Z8.Work 原生引擎源码材料\n\n绑定 engines.json SHA-256：${report.engineManifestSha256}\n\n状态：${report.status}。再分发审查未批准。此目录不含应用/Rust/前端的完整源码闭包。\n\n逐文件对应关系、变换记录、缺项见 audit.json。许可证正文在 licenses/；外部源码归档位置记录在 audit.json，未复制到本目录。\n\n| 源码包 | 精确版本 | 运行资源数 | 版权文件数 | 源码文件 |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n仍需审查：\n${report.remainingReviews.map((r) => "- " + r).join("\n")}\n`,
);
// These are reviewable package selectors, never executed by this audit command.
await writeFile(
	join(output, "source-requests.json"),
	JSON.stringify(
		report.sources.map((s) => ({
			package: s.source,
			version: s.version,
			selector: s.source + "=" + s.version,
		})),
		null,
		2,
	) + "\n",
);
// Publish the report only after copying and verifying all attached notices.
if (
	(await fileInfo(root, "engines.json", 2 * 1024 ** 2)).sha256 !==
	report.engineManifestSha256
)
	throw new Error("Engine manifest changed during audit");
await writeFile(
	join(output, "audit.json"),
	JSON.stringify(report, null, 2) + "\n",
);
console.log(
	JSON.stringify(
		{
			output,
			status: report.status,
			...report.counts,
			redistributionApproved: false,
		},
		null,
		2,
	),
);
if (values["require-complete"] && report.status !== "ready-for-source-review")
	process.exitCode = 1;
