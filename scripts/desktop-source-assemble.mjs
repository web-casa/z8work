// Copy verified exact sources into one auditable directory; never modify input caches.
import { parseArgs } from "node:util";
import {
	readFile,
	mkdir,
	copyFile,
	writeFile,
	realpath,
} from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, dirname, basename, sep } from "node:path";
import { sourceSelector, verifyDsc, fileInfo } from "./lib/desktop-sources.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["audit", "supplement", "output"].map((k) => [k, { type: "string" }]),
	),
});
for (const key of ["audit", "supplement", "output"])
	if (!values[key]) throw new Error(`--${key} required`);
async function readReport(path) {
	await fileInfo(dirname(resolve(path)), basename(path), 16 * 1024 ** 2);
	return JSON.parse(await readFile(path, "utf8"));
}
const audit = await readReport(values.audit),
	added = await readReport(values.supplement);
if (
	audit.schema !== 1 ||
	added.schema !== 1 ||
	audit.sourceDistribution !== "debian-13" ||
	!/^[a-f0-9]{64}$/.test(audit.engineManifestSha256) ||
	audit.engineManifestSha256 !== added.engineManifestSha256 ||
	added.status !== "verified-awaiting-source-review" ||
	!Array.isArray(audit.sources) ||
	!audit.sources.length ||
	audit.sources.length > 1000 ||
	!Array.isArray(added.sources) ||
	added.sources.length > 1000
)
	throw new Error("Unverified or mismatched source supplement");
const root = resolve(values.output);
const inputRoot = await realpath(audit.sourceArchiveRoot),
	supplementRoot = await realpath(
		join(dirname(resolve(values.supplement)), "archives"),
	);
const canonicalOutput = join(await realpath(dirname(root)), basename(root));
for (const input of [inputRoot, supplementRoot])
	if (canonicalOutput === input || canonicalOutput.startsWith(input + sep))
		throw new Error("Output must be outside immutable source inputs");
const selectors = audit.sources.map((s) => sourceSelector(s.source, s.version));
if (new Set(selectors).size !== selectors.length)
	throw new Error("Duplicate source selector");
await mkdir(root); // Never overwrite a previous collection.
const copied = [];
for (const source of audit.sources) {
	let record = source.delivery,
		from = inputRoot;
	const subdirectory =
		source.source + "_" + encodeURIComponent(source.version);
	if (record?.status === "missing") {
		const matching = added.sources.filter(
			(s) =>
				s.source === source.source &&
				s.version === source.version &&
				s.status === "verified",
		);
		if (matching.length !== 1)
			throw new Error("Missing or ambiguous exact source supplement");
		record = matching[0];
		from = join(supplementRoot, subdirectory);
	}
	if (!record?.descriptor || !/^[a-f0-9]{64}$/.test(record.descriptor.sha256))
		throw new Error("Missing descriptor fingerprint");
	const verified = await verifyDsc(from, record.descriptor.file);
	if (
		verified.source !== source.source ||
		verified.sourceVersion !== source.version ||
		verified.descriptor.sha256 !== record.descriptor.sha256 ||
		verified.descriptor.bytes !== record.descriptor.bytes
	)
		throw new Error("Source descriptor changed or wrong version");
	const directory = join(root, subdirectory);
	await mkdir(directory);
	for (const file of [verified.descriptor, ...verified.files]) {
		await copyFile(
			join(from, file.file),
			join(directory, basename(file.file)),
			constants.COPYFILE_EXCL,
		);
		copied.push({
			...file,
			file: subdirectory + "/" + basename(file.file),
		});
	}
	const check = await verifyDsc(
		directory,
		basename(verified.descriptor.file),
	);
	if (check.descriptor.sha256 !== verified.descriptor.sha256)
		throw new Error("Copied descriptor changed");
}
// A separate strict bundle audit is still required; this is a source collection receipt.
const report = {
	schema: 1,
	status: "assembled-awaiting-audit",
	engineManifestSha256: audit.engineManifestSha256,
	sourceVersions: selectors.length,
	bytes: copied.reduce((n, f) => n + f.bytes, 0),
	files: copied,
	redistributionApproved: false,
};
await writeFile(
	join(root, "assembly.json"),
	JSON.stringify(report, null, 2) + "\n",
	{ flag: "wx" },
);
console.log(
	JSON.stringify({
		output: root,
		sourceVersions: report.sourceVersions,
		files: copied.length,
		bytes: report.bytes,
	}),
);
