import scope from "../../../packaging/desktop/v1-scope.json" with { type: "json" };
import { estimateStorage } from "../../../src/lib/util/environmental-impact.ts";
import type { Task } from "./queue-contract.ts";

export function localRoute(task: Task): boolean {
	const extension = task.name.split(".").pop()?.toLowerCase() ?? "";
	return scope.groups.some(
		(g) => g.inputs.includes(extension) && g.outputs.includes(task.format),
	);
}
// Explicit backend capability plus frozen route coverage, not network telemetry.
export function localProcessing(
	location: unknown,
	tasks: readonly Task[],
): boolean {
	return location === "device-v1" && tasks.every(localRoute);
}
export function summarizeSavedImages(
	tasks: readonly Task[],
	location: unknown,
) {
	let count = 0;
	let savedBytes = 0;
	// A newer occurrence replaces a stale saved event, including a running retry.
	const latest = new Map(tasks.map((task) => [task.id, task]));
	const images = scope.groups.find((g) => g.id === "images")!;
	for (const task of latest.values()) {
		const result = task.result;
		if (
			!localProcessing(location, [task]) ||
			task.phase !== "saved" ||
			!result?.complete ||
			!images.inputs.includes(
				task.name.split(".").pop()?.toLowerCase() ?? "",
			) ||
			!images.outputs.includes(task.format) ||
			!Number.isSafeInteger(task.bytes) ||
			!Number.isSafeInteger(result.bytes) ||
			task.bytes <= 0 ||
			result.bytes <= 0
		)
			continue;
		count++;
		savedBytes += task.bytes - result.bytes;
	}
	return { count, savedBytes, ...estimateStorage(Math.max(0, savedBytes)) };
}

// Translate only known application notes; never echo arbitrary engine messages.
export function resultNote(note: string, english: boolean): string {
	const notes = [
		[
			"First audio track only. WAV uses PCM 16-bit; MP3/AAC/Opus are lossy. Metadata is removed.",
			"仅保留第一条音轨。WAV 使用 16 位 PCM；MP3/AAC/Opus 为有损编码。元数据会移除。",
		],
		[
			"Text only; images, layout and formatting are omitted.",
			"仅保留纯文本，不保留图片、版式和格式。",
		],
		[
			"First frame only. JPEG uses a white background; PNG preserves pixels. EXIF/XMP/IPTC are optional; ICC is retained. Output may be larger.",
			"仅转换首帧。JPEG 使用白色背景；PNG 保留像素。EXIF/XMP/IPTC 可选保留；保留 ICC。输出可能变大。",
		],
	];
	const known = notes.find(([en]) => en === note);
	if (known) return known[english ? 0 : 1];
	const pdf =
		/^PDF: (\d{1,3}) pages, (72|96|144) DPI, at most 4000 × 4000 pixels per page\. Successfully saved pages are retained on cancellation or failure\.$/.exec(
			note,
		);
	if (pdf)
		return english
			? note
			: `PDF：${pdf[1]} 页，${pdf[2]} DPI，每页最多 4000 × 4000 像素。取消或失败时保留已保存的页面。`;
	return note
		? english
			? "Saved with the selected format. Review the output before using it."
			: "已按所选格式保存，使用前请检查输出。"
		: "";
}
