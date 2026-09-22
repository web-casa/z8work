// Evidence contract for the finite native Linux filesystem suite.
export function validateFaultReport(report, platform) {
	const ids = new Set([
		"readonly-mount",
		"inode-exhaustion",
		"disk-full",
		"permission-revoked",
		"file-size-limit",
		"workspace-cleanup",
	]);
	if (
		!["linux-aarch64", "linux-x86_64"].includes(platform) ||
		report?.schema !== 2 ||
		report.phase !== 29 ||
		report.status !== "passed" ||
		report.platform !== platform ||
		!Array.isArray(report.checks) ||
		report.checks.length !== ids.size ||
		!Number.isSafeInteger(report.elapsedMs) ||
		report.elapsedMs < 0 ||
		report.elapsedMs > 300000
	)
		throw new Error("Incomplete native fault evidence");
	for (const check of report.checks) {
		if (check.status !== "passed" || !ids.delete(check.id))
			throw new Error("Unchecked or duplicate fault");
		if (
			check.id === "readonly-mount" &&
			check.failure !== "output_permission"
		)
			throw new Error("Wrong read-only result");
		if (
			check.id === "inode-exhaustion" &&
			(check.failure !== "storage" ||
				!Number.isSafeInteger(check.createdFiles) ||
				check.createdFiles < 1 ||
				check.createdFiles > 256)
		)
			throw new Error("Missing real inode exhaustion");
		if (
			["disk-full", "permission-revoked", "file-size-limit"].includes(
				check.id,
			)
		) {
			if (
				check.failure !==
					(check.id === "permission-revoked"
						? "output_permission"
						: "storage") ||
				check.saveRetryWithoutSource !== true ||
				check.existingFilesPreserved !== true ||
				check.partialFiles !== 0 ||
				!Number.isSafeInteger(check.savedBytes) ||
				check.savedBytes <=
					(check.id === "file-size-limit" ? 256 : 0) ||
				!/^[a-f0-9]{64}$/.test(check.savedSha256)
			)
				throw new Error("Unverified recovery or file preservation");
			if (
				check.fileSizeLimit !==
				(check.id === "file-size-limit" ? 256 : 0)
			)
				throw new Error("Unverified file-size limit");
			if (
				check.id === "disk-full"
					? !Number.isSafeInteger(check.injectedBytes) ||
						check.injectedBytes < 16 * 1024 ** 2 ||
						check.injectedBytes > 64 * 1024 ** 2
					: check.injectedBytes !== 0
			)
				throw new Error("Unverified bounded fault");
		}
	}
}
