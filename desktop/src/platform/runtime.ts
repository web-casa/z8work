import type { Task } from "./queue-contract";
export const failureCodes = [
	"preparing",
	"engine_unavailable",
	"cancelled",
	"timed_out",
	"input_unavailable",
	"import_limit",
	"cache_expired",
	"cache_invalid",
	"cache_full",
	"storage",
	"publish",
	"output_permission",
	"conversion",
	"history",
	"closing",
] as const;
export type Failure = (typeof failureCodes)[number];
export type EngineStatus = {
	id: string;
	phase: "preparing" | "ready" | "failed";
	failure: Failure | null;
};
const copy: Record<Failure, [string, string]> = {
	preparing: [
		"正在准备，请稍候；已选择的文件会保留。",
		"Preparing; selected files will be kept.",
	],
	engine_unavailable: [
		"所需引擎不可用。其他已就绪格式仍可使用，请检查下方引擎状态。",
		"A required engine is unavailable. Other ready formats remain usable; see engine status below.",
	],
	cancelled: ["任务已取消。", "Task cancelled."],
	timed_out: [
		"操作超时，请重试或使用较小文件。",
		"Operation timed out. Retry or use a smaller file.",
	],
	input_unavailable: [
		"无法读取原文件，请重新选择文件授权。",
		"Input unavailable; choose the file again.",
	],
	import_limit: [
		"一次最多接收 100 个文件，请等待本次导入结束后再试。",
		"Receive at most 100 files at a time. Wait for this import, then retry.",
	],
	cache_expired: [
		"暂存结果已过期或不可用，请重新转换。",
		"Cached result expired or unavailable; convert again.",
	],
	cache_invalid: [
		"暂存结果已变化或受损，请重新转换。",
		"Cached result changed or is unreadable; convert again.",
	],
	cache_full: [
		"暂存额度已满，请保存或移除其他任务后重新转换。",
		"Cache is full. Save or remove other tasks, then convert again.",
	],
	storage: [
		"磁盘空间或写入权限不足，请检查后重试。",
		"Check free space and write permissions, then retry.",
	],
	output_permission: [
		"保存目录无法写入。请检查权限或选择其他目录后重试。",
		"The output folder is not writable. Check its permissions or choose another folder, then retry.",
	],
	publish: [
		"无法保存结果，请检查保存目录或更换目录后重试。",
		"Could not save the result. Check or change the output folder and retry.",
	],
	conversion: [
		"处理失败。请检查文件是否完好、格式是否受支持，然后重试。",
		"Processing failed. Check the file and supported format, then retry.",
	],
	history: [
		"任务记录不可用，请保留原记录并检查磁盘和权限。",
		"Task history is unavailable. Preserve it and check storage permissions.",
	],
	closing: [
		"应用正在退出，无法接收新的任务。",
		"The app is closing and cannot accept tasks.",
	],
};
export function failureMessage(code: Failure, english: boolean): string {
	return copy[code]?.[english ? 1 : 0] ?? copy.conversion[english ? 1 : 0];
}
export function commandError(value: unknown, english: boolean): string {
	const message = String(value);
	const code = message.startsWith("Z8:")
		? message.slice(3)
		: message === "Cancelled"
			? "cancelled"
			: message === "Timed out"
				? "timed_out"
				: "conversion";
	return failureMessage(
		failureCodes.includes(code as Failure)
			? (code as Failure)
			: "conversion",
		english,
	);
}
export function taskReadiness(
	task: Task,
	states: EngineStatus[],
): "preparing" | "ready" | "failed" {
	if (task.phase === "awaiting_save") return "ready";
	const ext = task.name.split(".").at(-1)?.toLowerCase();
	const ids =
		ext === "pdf"
			? ["magick", "mutool"]
			: ext === "md" || ext === "docx"
				? ["pandoc"]
				: [
							"png",
							"jpg",
							"jpeg",
							"webp",
							"avif",
							"heic",
							"heif",
					  ].includes(ext ?? "")
					? ["magick"]
					: ["ffmpeg", "ffprobe"];
	if (ids.some((id) => states.find((s) => s.id === id)?.phase === "failed"))
		return "failed";
	return ids.every((id) => states.find((s) => s.id === id)?.phase === "ready")
		? "ready"
		: "preparing";
}
