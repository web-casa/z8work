import { parseArgs } from "node:util";
import {
	mkdir,
	readFile,
	writeFile,
	lstat,
	copyFile,
	rmdir,
	rename,
	unlink,
	realpath,
} from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve, join, basename, dirname, sep } from "node:path";
import { sourceSelector, listFiles, fileInfo } from "./lib/desktop-sources.mjs";
import {
	snapshotMetadata,
	acquireSnapshot,
} from "./lib/desktop-source-snapshot.mjs";
const { values } = parseArgs({
	options: {
		audit: { type: "string" },
		output: { type: "string" },
		cache: { type: "string" },
		only: { type: "string", multiple: true },
		resume: { type: "boolean", default: false },
		"timeout-seconds": { type: "string", default: "900" },
	},
});
const timeout = Number(values["timeout-seconds"]);
if (
	!values.audit ||
	!values.output ||
	!Number.isInteger(timeout) ||
	timeout < 30 ||
	timeout > 3600
)
	throw new Error(
		"Requires --audit, --output and timeout from 30 to 3600 seconds",
	);
const auditRoot = dirname(resolve(values.audit));
await fileInfo(auditRoot, basename(values.audit), 16 * 1024 ** 2);
const audit = JSON.parse(await readFile(values.audit, "utf8"));
if (
	audit.schema !== 1 ||
	audit.sourceDistribution !== "debian-13" ||
	!/^[a-f0-9]{64}$/.test(audit.engineManifestSha256) ||
	!Array.isArray(audit.sources) ||
	!audit.sources.length ||
	audit.sources.length > 1000
)
	throw new Error("Requires an audited Debian 13 source plan");
const all = audit.sources.map((s) => ({
	source: s.source,
	version: s.version,
	selector: sourceSelector(s.source, s.version),
	missing: s.delivery?.status === "missing",
}));
if (
	new Set(all.map((s) => s.selector)).size !== all.length ||
	values.only?.some((p) => !all.some((s) => s.source === p))
)
	throw new Error("Invalid/duplicate source selection");
const requests = all.filter((s) =>
	values.only ? values.only.includes(s.source) : s.missing,
);
if (!requests.length)
	throw new Error(
		"No missing sources selected; use --only to fetch a particular source",
	);
const binding = {
	schema: 1,
	engineManifestSha256: audit.engineManifestSha256,
	selectors: requests.map((s) => s.selector).sort(),
};
const root = resolve(values.output);
const canonicalOutput = join(await realpath(dirname(root)), basename(root));
const cache = values.cache ? await realpath(values.cache) : null;
if (
	cache &&
	(canonicalOutput === cache || canonicalOutput.startsWith(cache + sep))
)
	throw new Error("Output must be outside the read-only source cache");
if (!values.resume) await mkdir(root);
else if (
	(await lstat(root)).isSymbolicLink() ||
	!(await lstat(root)).isDirectory()
)
	throw new Error("Unsafe resume directory");
await mkdir(join(root, ".lock")); // Refuse simultaneous writers; never break another run's lock.
const interrupted = new AbortController();
const stop = () =>
	interrupted.abort(new Error("Source acquisition interrupted"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
	await writeFile(
		join(root, ".lock", "owner.json"),
		JSON.stringify({
			pid: process.pid,
			started: new Date().toISOString(),
		}) + "\n",
		{ flag: "wx" },
	);
	if (values.resume) {
		await fileInfo(root, "plan.json", 1024 ** 2);
		if (
			JSON.stringify(
				JSON.parse(await readFile(join(root, "plan.json"), "utf8")),
			) !== JSON.stringify(binding)
		)
			throw new Error(
				"Resume plan does not match the original engine/source selection",
			);
	} else
		await writeFile(
			join(root, "plan.json"),
			JSON.stringify(binding, null, 2) + "\n",
			{ flag: "wx" },
		);
	const cacheFiles = cache ? await listFiles(cache) : [];
	await mkdir(join(root, "archives"), { recursive: true });
	if ((await lstat(join(root, "archives"))).isSymbolicLink())
		throw new Error("Symlink archives directory rejected");
	const results = [];
	let reportWrites = Promise.resolve();
	const saveReport = () => {
		const text =
			JSON.stringify(
				{
					...binding,
					status:
						results.length === requests.length &&
						results.every((r) => r.status === "verified")
							? "verified-awaiting-source-review"
							: "incomplete",
					redistributionApproved: false,
					signatureVerification: "not-performed",
					sources: [...results],
				},
				null,
				2,
			) + "\n";
		reportWrites = reportWrites.then(async () => {
			const temp = join(root, ".downloads-" + randomUUID() + ".json");
			await writeFile(temp, text, { flag: "wx" });
			await rename(temp, join(root, "downloads.json"));
		});
		return reportWrites;
	};
	// Check a resumed report path before writing; all other inputs are checked by fileInfo.
	try {
		if (
			!(await lstat(join(root, "downloads.json"))).isFile() ||
			(await lstat(join(root, "downloads.json"))).isSymbolicLink()
		)
			throw new Error("Unsafe report path");
	} catch (e) {
		if (e.code !== "ENOENT") throw e;
	}
	await saveReport();
	let next = 0;
	const workers = await Promise.allSettled(
		Array.from({ length: Math.min(2, requests.length) }, async () => {
			while (next < requests.length) {
				const item = requests[next++],
					directory = join(
						root,
						"archives",
						item.source + "_" + encodeURIComponent(item.version),
					);
				const started = Date.now();
				try {
					await mkdir(directory, { recursive: true });
					if ((await lstat(directory)).isSymbolicLink())
						throw new Error("Symlink package directory rejected");
					const signal = AbortSignal.any([
						interrupted.signal,
						AbortSignal.timeout(timeout * 1000),
					]);
					signal.throwIfAborted();
					const metadata = await snapshotMetadata(
						item.source,
						item.version,
						signal,
					);
					for (const spec of metadata.files) {
						try {
							await lstat(join(directory, spec.name));
							continue;
						} catch (e) {
							if (e.code !== "ENOENT") throw e;
						}
						let candidates = cacheFiles.filter(
							(p) => basename(p) === spec.name,
						);
						if (!candidates.length)
							candidates = cacheFiles.filter(
								(p) => basename(p) === spec.name + ".part",
							);
						if (candidates.length === 1) {
							// Cache bytes are untrusted, including partial downloads; final hashes always run.
							await fileInfo(cache, candidates[0], 4 * 1024 ** 3);
							try {
								await copyFile(
									join(cache, candidates[0]),
									join(directory, spec.name + ".part"),
									constants.COPYFILE_EXCL,
								);
							} catch (e) {
								if (e.code !== "EEXIST") throw e;
							}
						}
					}
					const verified = await acquireSnapshot(
						directory,
						item.source,
						item.version,
						metadata,
						signal,
					);
					results.push({
						...item,
						status: "verified",
						metadataUrl: metadata.url,
						snapshotFiles: metadata.files,
						seconds: (Date.now() - started) / 1000,
						...verified,
					});
				} catch (error) {
					results.push({
						...item,
						status: "failed",
						seconds: (Date.now() - started) / 1000,
						error: error.message,
					});
				}
				console.log(
					`${item.selector}: ${results.find((r) => r.selector === item.selector).status}`,
				);
				try {
					await saveReport();
				} catch (error) {
					stop();
					throw error;
				} // Keep the lock until all workers settle.
			}
		}),
	);
	const failedWorker = workers.find((r) => r.status === "rejected");
	if (failedWorker) throw failedWorker.reason;
	results.sort((a, b) => a.selector.localeCompare(b.selector));
	await saveReport();
	if (results.some((r) => r.status !== "verified")) process.exitCode = 1;
} finally {
	process.off("SIGINT", stop);
	process.off("SIGTERM", stop);
	await unlink(join(root, ".lock", "owner.json"));
	await rmdir(join(root, ".lock"));
}
