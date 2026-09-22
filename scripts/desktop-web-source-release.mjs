// Verify and stage the public corresponding-source delivery plan. Local only: no upload.
// `check` validates the manifest against the engine catalog; `stage` assembles a
// reviewable release directory with SHA256SUMS from the local archives.
import { parseArgs } from "node:util";
import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileInfo } from "./lib/desktop-sources.mjs";

export const releaseManifestPath = "packaging/desktop-web/source-release.json";

// Pure manifest/catalog consistency. Evidence digest binding and archive bytes
// stay with the release gate; this adds the delivery layer on top.
export function verifyRelease(catalog, manifest) {
	const issues = [];
	const engines = new Map(catalog.engines.map((e) => [e.name, e]));
	if (manifest.schema !== 1) issues.push("Unexpected manifest schema");
	const published = manifest.status === "published";
	if (!published && manifest.status !== "draft-local-only")
		issues.push("Unexpected manifest status");
	if (published) {
		if (manifest.urlPlan?.status !== "published")
			issues.push("Published manifest requires a published URL plan");
		if (typeof manifest.urlPlan?.pattern !== "string")
			issues.push("Published URL plan lacks its pattern");
		if (typeof manifest.urlPlan?.releaseTag !== "string")
			issues.push("Published URL plan lacks its release tag");
	} else if (manifest.urlPlan?.status === "published") {
		issues.push("URL plan claims publication for a local draft");
	} else {
		for (const artifact of manifest.artifacts)
			if (artifact.publishedUrl || artifact.publishedAt)
				issues.push(
					`${artifact.engine}: claims publication while the plan is not published`,
				);
	}
	const seen = new Set();
	for (const artifact of manifest.artifacts) {
		seen.add(artifact.engine);
		const engine = engines.get(artifact.engine);
		if (!engine) {
			issues.push(`${artifact.engine}: not present in engines.json`);
			continue;
		}
		if (!artifact.releaseFileName?.match(/^[a-z0-9][a-z0-9.-]*\.tar\.gz$/))
			issues.push(`${artifact.engine}: unsafe release file name`);
		if (artifact.wasmSha256 !== engine.sha256)
			issues.push(
				`${artifact.engine}: wasmSha256 does not bind the catalog`,
			);
		if (artifact.version !== engine.version)
			issues.push(`${artifact.engine}: version differs from the catalog`);
		if (artifact.sourceCommit !== engine.sourceCommit)
			issues.push(
				`${artifact.engine}: sourceCommit differs from the catalog`,
			);
		if (artifact.verificationStatus !== engine.sourceStatus)
			issues.push(
				`${artifact.engine}: verification status differs from the catalog`,
			);
		if (artifact.evidence !== engine.sourceEvidence)
			issues.push(
				`${artifact.engine}: evidence path differs from the catalog`,
			);
		if (typeof artifact.bytes !== "number" || artifact.bytes <= 0)
			issues.push(`${artifact.engine}: missing archive size`);
		if (published) {
			if (
				!artifact.publishedUrl?.startsWith("https://") ||
				!artifact.publishedAt
			)
				issues.push(
					`${artifact.engine}: published manifest lacks its published URL/timestamp`,
				);
			if (
				artifact.publishedUrl &&
				typeof manifest.urlPlan.pattern === "string" &&
				manifest.urlPlan.releaseTag &&
				artifact.publishedUrl !==
					manifest.urlPlan.pattern
						.replaceAll("<tag>", manifest.urlPlan.releaseTag)
						.replaceAll("<file>", artifact.releaseFileName)
			)
				issues.push(
					`${artifact.engine}: publishedUrl does not match the URL plan`,
				);
		}
	}
	if (seen.size !== engines.size)
		issues.push("Manifest must cover exactly the five catalog engines");
	return issues;
}

export async function stageRelease({ catalog, manifest, output, root = "." }) {
	const issues = verifyRelease(catalog, manifest);
	if (issues.length) throw Error(`Refusing to stage: ${issues.join("; ")}`);
	const existing = await readdir(output).catch(() => null);
	if (existing && existing.length)
		throw Error(`Refusing to stage into a non-empty directory: ${output}`);
	// Bind everything first so a failed stage creates no output directory.
	const verified = [];
	for (const artifact of manifest.artifacts)
		verified.push({
			artifact,
			info: await verifyArchiveBinding(root, artifact),
		});
	await mkdir(output, { recursive: true });
	const staged = [];
	for (const { artifact, info } of verified) {
		const target = join(output, artifact.releaseFileName);
		await copyFile(join(root, artifact.localArchive), target);
		// Hash the staged copy so SHA256SUMS can never record bytes that
		// differ from what was actually staged (TOCTOU between verify and copy).
		const stagedInfo = await fileInfo(output, artifact.releaseFileName);
		if (stagedInfo.sha256 !== info.sha256)
			throw Error(`${artifact.engine}: staged copy digest mismatch`);
		staged.push({
			engine: artifact.engine,
			file: artifact.releaseFileName,
			sha256: info.sha256,
			bytes: info.bytes,
			wasmSha256: artifact.wasmSha256,
			sourceCommit: artifact.sourceCommit,
			verificationStatus: artifact.verificationStatus,
		});
	}
	await writeFile(
		join(output, "SHA256SUMS"),
		staged
			.map((f) => `${f.sha256}  ${f.file}`)
			.sort()
			.join("\n") + "\n",
	);
	await writeFile(
		join(output, "README.txt"),
		[
			"Z8.Work desktop corresponding-source staging directory",
			"",
			`Generated by scripts/desktop-web-source-release.mjs stage.`,
			`Manifest status: ${manifest.status}.`,
			manifest.status === "published"
				? "These bytes are published per source-release.json; treat the"
				: "This is a reviewable draft; nothing here is published until the",
			manifest.status === "published"
				? "published assets as immutable and stage replacements elsewhere."
				: "owner selects a hosting location and performs the external release action.",
			"",
			"Each archive below is the corresponding source for the exact WASM",
			"binary shipped in the desktop app (wasmSha256) at the recorded",
			"sourceCommit. SHA256SUMS lists the archive digests that the public",
			"download page must reproduce byte for byte.",
			"",
			...staged.map(
				(f) =>
					`${f.file}\n  engine: ${f.engine} ${f.verificationStatus}\n  wasmSha256: ${f.wasmSha256}\n  sourceCommit: ${f.sourceCommit}\n  sha256: ${f.sha256}\n  bytes: ${f.bytes}`,
			),
			"",
		].join("\n"),
	);
	return staged;
}

// The manifest's archive digest must equal the digest recorded in the engine's
// source evidence, and the actual local archive must match both.
export async function verifyArchiveBinding(root, artifact) {
	let evidence;
	try {
		evidence = JSON.parse(
			await readFile(resolve(root, artifact.evidence), "utf8"),
		);
	} catch (error) {
		throw Error(
			`${artifact.engine}: evidence unreadable: ${error.message}`,
		);
	}
	if (evidence.archiveSha256 !== artifact.sha256)
		throw Error(`${artifact.engine}: archive digest differs from evidence`);
	if (evidence.wasmSha256 !== artifact.wasmSha256)
		throw Error(`${artifact.engine}: evidence binds a different WASM`);
	const info = await fileInfo(root, artifact.localArchive);
	if (info.sha256 !== artifact.sha256)
		throw Error(`${artifact.engine}: local archive digest mismatch`);
	if (info.bytes !== artifact.bytes)
		throw Error(`${artifact.engine}: local archive size mismatch`);
	return info;
}

async function runCli() {
	const mode = process.argv[2] ?? "check";
	if (!["check", "stage"].includes(mode))
		throw Error("Expected check or stage");
	if (mode === "stage") {
		const { values } = parseArgs({
			options: { output: { type: "string" } },
			args: process.argv.slice(3),
		});
		if (!values.output) throw Error("stage requires --output DIRECTORY");
		const [catalog, manifest] = await Promise.all([
			readFile("packaging/desktop-web/engines.json", "utf8").then(
				JSON.parse,
			),
			readFile(releaseManifestPath, "utf8").then(JSON.parse),
		]);
		const staged = await stageRelease({
			catalog,
			manifest,
			output: values.output,
		});
		console.log(
			`Staged ${staged.length} archives into ${values.output}; nothing was uploaded.`,
		);
	} else {
		const [catalog, manifest] = await Promise.all([
			readFile("packaging/desktop-web/engines.json", "utf8").then(
				JSON.parse,
			),
			readFile(releaseManifestPath, "utf8").then(JSON.parse),
		]);
		const issues = verifyRelease(catalog, manifest);
		for (const artifact of manifest.artifacts) {
			try {
				await verifyArchiveBinding(".", artifact);
			} catch (error) {
				issues.push(error.message);
			}
		}
		console.log(
			JSON.stringify(
				{
					ready: !issues.length,
					status: manifest.status,
					urlPlan: manifest.urlPlan?.status,
					artifacts: manifest.artifacts.length,
					issues,
				},
				null,
				2,
			),
		);
		if (issues.length) process.exitCode = 1;
	}
}

// CLI entry point only; importing this module must not run the check.
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	await runCli();
}
