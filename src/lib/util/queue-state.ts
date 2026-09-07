/** One mutually exclusive state per file; readiness is a separate property. */
export interface QueueFile {
	processing: boolean;
	queued: boolean;
	result: unknown;
	failed: boolean;
	cancelled: boolean;
}

export function fileState(file: QueueFile) {
	if (file.processing) return "processing";
	if (file.queued) return "queued";
	if (file.result) return "complete";
	if (file.failed) return "failed";
	if (file.cancelled) return "cancelled";
	return "pending";
}

export function queueSummary<T extends QueueFile>(
	files: readonly T[],
	isBlocked: (file: T) => boolean,
) {
	const groups: Record<ReturnType<typeof fileState>, T[]> = {
		processing: [],
		queued: [],
		complete: [],
		failed: [],
		cancelled: [],
		pending: [],
	};
	const blocked: T[] = [];
	const runnable: Record<"pending" | "failed" | "cancelled", T[]> = {
		pending: [],
		failed: [],
		cancelled: [],
	};
	for (const file of files) {
		const state = fileState(file);
		groups[state].push(file);
		if (
			state === "pending" ||
			state === "failed" ||
			state === "cancelled"
		) {
			if (isBlocked(file)) blocked.push(file);
			else runnable[state].push(file);
		}
	}
	const running = groups.processing.length + groups.queued.length;
	const action = !files.length
		? "add"
		: running
			? "running"
			: runnable.pending.length
				? "pending"
				: runnable.failed.length
					? "failed"
					: runnable.cancelled.length
						? "cancelled"
						: groups.complete.length
							? "download"
							: "blocked";
	const targets =
		action === "pending" || action === "failed" || action === "cancelled"
			? runnable[action]
			: [];
	return {
		total: files.length,
		groups,
		blocked,
		runnable,
		running,
		action,
		targets,
	};
}

/** Capture by identity, so additions, removals and repeated names cannot change a batch. */
export function batchTargets<T extends QueueFile>(
	files: readonly T[],
	targets: readonly T[],
) {
	const current = new Set(files);
	return [...new Set(targets)].filter(
		(file) => current.has(file) && !file.processing && !file.queued,
	);
}
