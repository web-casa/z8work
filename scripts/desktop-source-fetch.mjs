// Download exact Debian source packages into a new private workspace; never install them.
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { sourceSelector } from "./lib/desktop-sources.mjs";
const execute = promisify(execFile);
const { values } = parseArgs({
	options: {
		audit: { type: "string" },
		output: { type: "string" },
		only: { type: "string", multiple: true },
		"timeout-seconds": { type: "string", default: "180" },
	},
});
const timeoutSeconds = Number(values["timeout-seconds"]);
if (
	!Number.isInteger(timeoutSeconds) ||
	timeoutSeconds < 30 ||
	timeoutSeconds > 3600
)
	throw new Error("--timeout-seconds must be an integer from 30 to 3600");
if (!values.audit || !values.output)
	throw new Error("--audit and --output required");
if (process.platform !== "linux")
	throw new Error(
		"Source acquisition uses Linux apt-get; offline audit can run elsewhere",
	);
const report = JSON.parse(await readFile(values.audit, "utf8"));
if (
	report.schema !== 1 ||
	report.sourceDistribution !== "debian-13" ||
	!Array.isArray(report.sources) ||
	report.sources.length > 1000
)
	throw new Error("Requires an audited Debian 13 source plan");
const all = report.sources.map((s) => ({
	package: s.source,
	version: s.version,
	selector: sourceSelector(s.source, s.version),
}));
if (values.only?.some((p) => !all.some((s) => s.package === p)))
	throw new Error("--only package is absent from the audited plan");
const requests = all.filter(
	(s) => !values.only || values.only.includes(s.package),
);
const root = resolve(values.output);
await mkdir(root);
for (const path of ["lists/partial", "cache/archives/partial", "archives"])
	await mkdir(join(root, path), { recursive: true });
await writeFile(
	join(root, "sources.list"),
	"deb-src https://deb.debian.org/debian trixie main\ndeb-src https://deb.debian.org/debian-security trixie-security main\ndeb-src https://deb.debian.org/debian trixie-updates main\n",
);
const options = [
	"-o",
	`Dir::Etc::sourcelist=${join(root, "sources.list")}`,
	"-o",
	"Dir::Etc::sourceparts=-",
	"-o",
	`Dir::State::lists=${join(root, "lists")}`,
	"-o",
	`Dir::Cache=${join(root, "cache")}`,
	"-o",
	"Debug::NoLocking=1",
	"-o",
	"Acquire::Retries=1",
	"-o",
	"Acquire::https::Timeout=30",
];
const call = (args, cwd) =>
	execute("apt-get", [...options, ...args], {
		cwd,
		encoding: "utf8",
		timeout: timeoutSeconds * 1000,
		maxBuffer: 1024 ** 2,
	});
const update = await call(["update"], root);
await writeFile(join(root, "index-update.txt"), update.stdout + update.stderr);
const results = [];
let next = 0;
await Promise.all(
	Array.from({ length: Math.min(4, requests.length) }, async () => {
		while (next < requests.length) {
			const item = requests[next++],
				directory = join(
					root,
					"archives",
					item.package + "_" + encodeURIComponent(item.version),
				);
			await mkdir(directory);
			let result;
			try {
				const r = await call(
					[
						"--download-only",
						"--only-source",
						"source",
						item.selector,
					],
					directory,
				);
				result = {
					...item,
					status: "downloaded",
					output: (r.stdout + r.stderr).slice(-5000),
				};
			} catch (error) {
				result = {
					...item,
					status: "unavailable",
					exitCode: error.code,
					output: (
						(error.stdout ?? "") +
						(error.stderr ?? "") +
						error.message
					).slice(-5000),
				};
			}
			results.push(result);
			console.log(`${item.selector}: ${result.status}`);
		}
	}),
);
results.sort((a, b) => a.selector.localeCompare(b.selector));
const incomplete = results.some((r) => r.status !== "downloaded");
await writeFile(
	join(root, "downloads.json"),
	JSON.stringify(
		{
			schema: 1,
			status: incomplete ? "incomplete" : "downloaded-awaiting-audit",
			engineManifestSha256: report.engineManifestSha256,
			scope: values.only ? "selected-packages" : "full-audited-plan",
			sources: results,
		},
		null,
		2,
	) + "\n",
);
if (incomplete) process.exitCode = 1;
