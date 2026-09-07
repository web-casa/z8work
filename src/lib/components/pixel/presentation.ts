import type { VertFile } from "$lib/types";
import { m } from "$lib/paraglide/messages";
import { getLocale } from "$lib/paraglide/runtime";
import { MAX_ARRAY_BUFFER_SIZE } from "$lib/store/index.svelte";
import { queueSummary } from "$lib/util/queue-state";
import { GB } from "$lib/util/consts";

export function formatSize(bytes: number): string {
	const units = ["B", "KB", "MB", "GB"];
	const exponent =
		bytes > 0
			? Math.min(3, Math.floor(Math.log(bytes) / Math.log(1000)))
			: 0;
	return `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(bytes / 1000 ** exponent)} ${units[exponent]}`;
}

export function formatLabel(format: string): string {
	const value = format.replace(/^\./, "");
	return value.toLowerCase() === "webp" ? "WebP" : value.toUpperCase();
}

export function fileIssue(file: VertFile, videoReady: boolean): string | null {
	if (
		!file.isZip() &&
		file.converters.length &&
		file.converters.every(
			(converter) =>
				!converter.supportedFormats.some(
					(format) =>
						format.name === file.from && format.fromSupported,
				),
		)
	)
		return m["convert.errors.format_output_only"]();
	const converter = file.findConverter();
	if (!converter) {
		if (file.converters.length) return m["pixel.input_only"]();
		if (file.from === ".xlxs") return m["file_support.xlsx_typo"]();
		if (
			[".xlsx", ".xls", ".xlsm", ".xlsb", ".ods", ".numbers"].includes(
				file.from,
			)
		)
			return m["file_support.spreadsheet"]({
				format: formatLabel(file.from),
			});
		if (!file.from || file.from === ".") return m["file_support.unknown"]();
		return m["file_support.unsupported"]({
			format: formatLabel(file.from),
		});
	}
	const input = converter.supportedFormats.find((f) => f.name === file.from);
	if (input && !input.fromSupported)
		return m["convert.errors.format_output_only"]();
	if (file.isLarge() && !file.supportsStreaming())
		return m["workers.errors.file_too_large"]({
			limit: (MAX_ARRAY_BUFFER_SIZE / GB).toFixed(2),
		});
	const type =
		converter.name === "imagemagick"
			? m["upload.cards.images"]()
			: converter.name === "ffmpeg"
				? m["upload.cards.audio"]()
				: ["pandoc", "pdf"].includes(converter.name)
					? m["upload.cards.documents"]()
					: m["upload.cards.video"]();
	if (converter.status === "downloading")
		return m["convert.errors.worker_downloading"]({ type });
	if (converter.status === "error")
		return m["convert.errors.worker_error"]({ type });
	if (converter.status !== "ready")
		return m["convert.errors.worker_timeout"]({ type });
	if (converter.name === "vertd" && !videoReady)
		return m["convert.errors.vertd_not_found"]();
	return null;
}

export function summarizeQueue(
	files: readonly VertFile[],
	videoReady: boolean,
) {
	return queueSummary(files, (file) => !!fileIssue(file, videoReady));
}

export function queueStatus(summary: ReturnType<typeof summarizeQueue>) {
	if (!summary.total) return m["pixel.ready"]();
	const pieces = [
		m["pixel.summary"]({
			count: summary.groups.complete.length,
			total: summary.total,
		}),
	];
	if (summary.running) pieces.push(m["pixel.processing"]());
	if (summary.groups.failed.length)
		pieces.push(
			m["workspace.failed_count"]({
				count: summary.groups.failed.length,
			}),
		);
	if (summary.groups.cancelled.length)
		pieces.push(
			m["workspace.cancelled_count"]({
				count: summary.groups.cancelled.length,
			}),
		);
	if (summary.blocked.length)
		pieces.push(
			m["workspace.blocked_count"]({ count: summary.blocked.length }),
		);
	return pieces.join(" · ");
}
