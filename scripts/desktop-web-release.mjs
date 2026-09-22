// Read-only preflight by default. `prepare` builds frontend assets, never an installer.
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256 } from "./lib/desktop-artifacts.mjs";
import { fileInfo } from "./lib/desktop-sources.mjs";
const mode = process.argv[2] ?? "check";
if (!["check", "prepare"].includes(mode))
	throw Error("Expected check or prepare");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const base = await read("src-tauri/tauri.conf.json");
const release = await read("packaging/desktop-web/tauri.release.json");
const manifest = await read("packaging/desktop-web/engines.json");
const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
const issues = [];
if (release.productName !== "Z8.Work" || release.identifier !== base.identifier)
	issues.push("Release name or upgrade identity changed unexpectedly");
if (cargo.match(/^version = "([^"]+)"/m)?.[1] !== base.version)
	issues.push("Cargo and Tauri versions differ");
if (manifest.schema !== 2 || manifest.engines.length !== 5)
	throw Error("Invalid engine catalog");
for (const engine of manifest.engines) {
	if (sha256(await readFile(engine.file)) !== engine.sha256)
		issues.push(`${engine.name}: WASM digest mismatch`);
	if (engine.sourceStatus === "blocked" || !engine.sourceEvidence) {
		issues.push(
			`${engine.name}: ${engine.pending || "corresponding-source evidence missing"}`,
		);
		continue;
	}
	if (
		![
			"verified-rebuilt",
			"verified-rebuilt-replacement",
			"verified-upstream",
		].includes(engine.sourceStatus)
	) {
		issues.push(`${engine.name}: invalid source verification status`);
		continue;
	}
	// A status flag alone never approves bytes. Evidence must bind the exact WASM
	// to reviewed source/build inputs and the distribution archive's actual digest.
	let evidence;
	try {
		evidence = await read(engine.sourceEvidence);
	} catch (error) {
		issues.push(
			`${engine.name}: source evidence unavailable: ${error.message}`,
		);
		continue;
	}
	let valid = true;
	const incomplete = () => {
		valid = false;
		issues.push(`${engine.name}: incomplete source evidence`);
	};
	if (
		evidence.wasmSha256 !== engine.sha256 ||
		!evidence.reviewedBy ||
		!evidence.buildInputs?.length ||
		!evidence.archive ||
		!evidence.archiveSha256
	)
		incomplete();
	if (
		engine.sourceStatus === "verified-rebuilt" &&
		(evidence.verificationMethod !== "rebuilt" ||
			evidence.wasmByteIdentical !== true)
	)
		incomplete();
	if (
		engine.sourceStatus === "verified-rebuilt-replacement" &&
		(evidence.verificationMethod !== "replacement-rebuild" ||
			evidence.replacementArtifact !== true ||
			evidence.wasmByteIdentical !== false ||
			evidence.independentBuilds < 2 ||
			evidence.buildNetwork !== "none" ||
			evidence.runtimeValidation?.status !== "passed" ||
			evidence.nondeterminismReview?.status !== "documented" ||
			!Array.isArray(evidence.nondeterminismReview?.builds) ||
			evidence.nondeterminismReview.builds.length < 2 ||
			evidence.independentBuilds !==
				evidence.nondeterminismReview.builds.length ||
			new Set(
				evidence.nondeterminismReview.builds.map(
					(build) => build.optimizedSha256,
				),
			).size < 2 ||
			evidence.nondeterminismReview.builds.some(
				(build) =>
					!build.name ||
					!/^[a-f0-9]{64}$/.test(build.rawSha256 || "") ||
					!/^[a-f0-9]{64}$/.test(build.optimizedSha256 || ""),
			) ||
			!evidence.nondeterminismReview.builds.some(
				(build) => build.optimizedSha256 === engine.sha256,
			))
	)
		incomplete();
	if (
		engine.sourceStatus === "verified-upstream" &&
		(evidence.verificationMethod !== "upstream-release" ||
			evidence.upstreamAsset?.wasmSha256 !== engine.sha256 ||
			!evidence.upstreamAsset?.url?.startsWith("https://") ||
			!evidence.upstreamAsset?.release ||
			!evidence.upstreamAsset?.archiveSha256 ||
			evidence.dependenciesReviewed !== true)
	)
		incomplete();
	if (valid) {
		try {
			if (
				(await fileInfo(".", evidence.archive)).sha256 !==
				evidence.archiveSha256
			)
				issues.push(`${engine.name}: source archive digest mismatch`);
		} catch (error) {
			issues.push(
				`${engine.name}: source archive unavailable: ${error.message}`,
			);
		}
	}
	for (const input of evidence.buildInputs || []) {
		if (!input?.file || !input?.sha256) {
			issues.push(`${engine.name}: incomplete build input evidence`);
			continue;
		}
		try {
			if ((await fileInfo(".", input.file)).sha256 !== input.sha256)
				issues.push(
					`${engine.name}: changed build input: ${input.file}`,
				);
		} catch (error) {
			issues.push(
				`${engine.name}: build input unavailable: ${input.file}: ${error.message}`,
			);
		}
	}
	if (
		engine.sourceDelivery?.status !== "published" ||
		!engine.sourceDelivery?.url?.startsWith("https://")
	)
		issues.push(
			`${engine.name}: corresponding source is not publicly delivered`,
		);
	if (engine.distributionReview?.status !== "approved")
		issues.push(
			`${engine.name}: distribution license review is not approved`,
		);
}
if (mode === "prepare" && !issues.length) {
	const result = spawnSync(
		process.execPath,
		["scripts/desktop-web.mjs", "build"],
		{ stdio: "inherit" },
	);
	if (result.status !== 0) process.exit(result.status || 1);
}
try {
	const { directory, offlineSha256 } = await read(
		".desktop-local/web-notices-current.json",
	);
	const dossier = await read(join(directory, "dossier.json"));
	if (
		process.env.Z8_DESKTOP_TARGET &&
		process.env.Z8_DESKTOP_TARGET !== dossier.target
	)
		issues.push("Notice target does not match requested release target");
	if (dossier.missingNotices.length)
		issues.push("Missing dependency notices");
	for (const [path, digest] of Object.entries(dossier.inputs))
		if (sha256(await readFile(path)) !== digest)
			issues.push(`Stale notices: ${path}`);
	for (const component of dossier.components)
		for (const notice of component.notices)
			if (
				(await fileInfo(directory, notice.file)).sha256 !==
				notice.sha256
			)
				issues.push(`Changed notice: ${notice.file}`);
	if (
		sha256(await readFile("desktop/dist/desktop-notices.json")) !==
		offlineSha256
	)
		issues.push("Offline notice content digest mismatch");
	const offline = await read("desktop/dist/desktop-notices.json");
	if (
		offline.target !== dossier.target ||
		offline.components.length !== dossier.components.length
	)
		issues.push("Offline notices differ from dossier");
	const walk = async (path) =>
		(
			await Promise.all(
				(await readdir(path)).map(async (name) => {
					const file = join(path, name);
					return (await stat(file)).isDirectory()
						? walk(file)
						: [file];
				}),
			)
		).flat();
	const actual = new Set();
	for (const file of (await walk("desktop/dist")).filter((p) =>
		p.endsWith(".wasm"),
	)) {
		const digest = sha256(await readFile(file));
		actual.add(digest);
		if (!manifest.engines.some((e) => e.sha256 === digest))
			issues.push(`Unknown bundled WASM: ${file}`);
	}
	for (const engine of manifest.engines)
		if (!actual.has(engine.sha256))
			issues.push(`Missing bundled engine: ${engine.name}`);
} catch (error) {
	issues.push(`Frontend/notices unavailable: ${error.message}`);
}
console.log(
	JSON.stringify(
		{
			ready: !issues.length,
			version: base.version,
			product: release.productName,
			issues,
		},
		null,
		2,
	),
);
if (issues.length) process.exitCode = 1;
