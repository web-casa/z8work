import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
export const sha256 = (bytes) =>
	createHash("sha256").update(bytes).digest("hex");
export async function artifactMatrix() {
	return JSON.parse(
		await readFile(
			new URL("../../packaging/desktop/artifacts.json", import.meta.url),
			"utf8",
		),
	);
}
export function assertElf(bytes, arch) {
	if (
		bytes.length < 64 ||
		bytes.subarray(0, 4).toString("hex") !== "7f454c46" ||
		bytes[4] !== 2 ||
		bytes[5] !== 1 ||
		bytes.readUInt16LE(18) !== { aarch64: 183, x86_64: 62 }[arch]
	)
		throw new Error("ELF architecture mismatch");
}
export function requiredEvidenceChecks(artifact) {
	const required = [
		"integrity",
		"conversion",
		"gui",
		"install",
		"upgrade",
		"uninstall",
		"licenses",
		"faults",
		"performance",
	];
	if (artifact.channel === "snap")
		required.push("strict-confinement", "portal");
	if (artifact.channel === "microsoft-store")
		required.push("identity", "webview2", "wack");
	if (artifact.os === "macos") required.push("signature");
	return required;
}
export function validateEvidence(evidence, digest, artifact) {
	if (
		evidence?.schema !== 1 ||
		evidence.artifact !== artifact.id ||
		!/^[a-f0-9]{64}$/.test(digest) ||
		evidence.sha256 !== digest
	)
		throw new Error("Evidence does not match the exact candidate bytes");
	if (
		typeof evidence.sourceCommit !== "string" ||
		!/^[a-f0-9]{40}$/.test(evidence.sourceCommit)
	)
		throw new Error("Candidate source commit is missing or invalid");
	const required = requiredEvidenceChecks(artifact);
	const pending = required.filter(
		(check) =>
			evidence.checks?.[check]?.status !== "passed" ||
			!evidence.checks[check].report,
	);
	if (pending.length)
		throw new Error(
			`Candidate acceptance incomplete: ${pending.join(", ")}`,
		);
	return true;
}

// This binds a review report to one check and target. Raw evidence must still
// be read and hashed by the caller; metadata does not prove native execution.
export function validateCheckReport(report, check, evidence, artifact) {
	if (
		report?.schema !== 1 ||
		report.status !== "passed" ||
		report.check !== check ||
		report.artifact !== artifact.id ||
		report.artifactSha256 !== evidence.sha256 ||
		report.sourceCommit !== evidence.sourceCommit ||
		report.os !== artifact.os ||
		report.arch !== artifact.arch
	)
		throw new Error(
			"Acceptance check identity, platform, source or package mismatch",
		);
	const native = !["integrity", "licenses", "identity", "signature"].includes(
		check,
	);
	if (
		native
			? report.execution !== "native"
			: !["native", "static", "manual"].includes(report.execution)
	)
		throw new Error(
			"Required native acceptance cannot use emulated or static evidence",
		);
	if (
		!Array.isArray(report.evidence) ||
		!report.evidence.length ||
		report.evidence.length > 64
	)
		throw new Error(
			"Check report requires bounded raw evidence references",
		);
}

export function validateBuild(info, artifact, version) {
	if (
		info?.schema !== 1 ||
		info.engines !== "bundled" ||
		info.debug !== false ||
		info.customProtocol !== true ||
		info.processLifetime !==
			(artifact.os === "windows" ? "job-close-v1" : "watchdog-pipe-v1") ||
		info.updater !== false ||
		info.os !== artifact.os ||
		info.arch !== artifact.arch ||
		info.version !== version ||
		(artifact.channel === "snap" && info.fileDialog !== "xdg-portal")
	)
		throw new Error(
			"Candidate requires matching release build, packaged engines and custom protocol, with process lifetime protection, no updater, and portal dialogs for Snap",
		);
}
