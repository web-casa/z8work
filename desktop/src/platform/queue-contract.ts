import { failureCodes, type Failure } from "./runtime.ts";
export type Format =
	| "png"
	| "jpeg"
	| "webp"
	| "avif"
	| "wav"
	| "mp3"
	| "flac"
	| "opus"
	| "m4a"
	| "txt";
export type Phase =
	| "ready"
	| "queued"
	| "running"
	| "saved"
	| "failed"
	| "cancelled"
	| "interrupted"
	| "partial"
	| "saving"
	| "awaiting_save";
export type Options = {
	quality: "small" | "balanced" | "high";
	keep_metadata: boolean;
	pdf_dpi: 72 | 96 | 144;
};
export type SavedFile = {
	path: string;
	bytes: number;
	page: number;
	sha256: string;
};
export type Result = {
	path: string;
	bytes: number;
	note: string;
	files: SavedFile[];
	fingerprint: string;
	total: number;
	complete: boolean;
};
export type Task = {
	id: string;
	name: string;
	bytes: number;
	formats: Format[];
	format: Format;
	phase: Phase;
	attempt: number;
	authorized: boolean;
	result: Result | null;
	options: Options;
	error: string | null;
};
export const importReasons = [
	"unreadable",
	"not_regular",
	"too_large",
	"unsupported",
	"queue_full",
] as const;
export type ImportReason = (typeof importReasons)[number];
export type ImportReport = {
	id: string;
	accepted: number;
	issues: { name: string; reason: ImportReason }[];
};
export type TaskProgress = {
	id: string;
	attempt: number;
	value: {
		stage: "encoding" | "validating" | "publishing";
		percent: number | null;
	};
};
export type Snapshot = {
	progress?: TaskProgress | null;
	failures?: Record<string, Failure>;
	import_report?: ImportReport | null;
	schema: 2 | 3;
	epoch: string;
	revision: number;
	tasks: Task[];
	output: string | null;
	output_authorized: boolean;
	processing: boolean;
	clearing: boolean;
	closing: boolean;
	persistence_error: string | null;
	recovery_notice: string | null;
};
export type Change = { epoch: string; revision: number };
export type Submission = {
	epoch: string;
	request_id: string;
	items: {
		id: string;
		format: Format;
		expected_attempt: number;
		options: Options;
		save_only?: boolean;
	}[];
};
export const formats: Format[] = [
	"png",
	"jpeg",
	"webp",
	"avif",
	"wav",
	"mp3",
	"flac",
	"opus",
	"m4a",
	"txt",
];
const phases: string[] = [
	"ready",
	"queued",
	"running",
	"saved",
	"failed",
	"cancelled",
	"interrupted",
	"partial",
	"saving",
	"awaiting_save",
];
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Invalid queue response");
	return value as Record<string, unknown>;
}
function integer(value: unknown) {
	return (
		typeof value === "number" && Number.isSafeInteger(value) && value >= 0
	);
}
function nullableString(value: unknown) {
	return value === null || typeof value === "string";
}
export function parseOptions(value: unknown): Options {
	const options = object(value);
	if (
		!["small", "balanced", "high"].includes(String(options.quality)) ||
		typeof options.keep_metadata !== "boolean" ||
		![72, 96, 144].includes(Number(options.pdf_dpi)) ||
		typeof options.pdf_dpi !== "number"
	)
		throw new Error("Invalid conversion settings");
	return options as unknown as Options;
}
function parseImportReport(value: unknown): ImportReport {
	const report = object(value);
	if (
		typeof report.id !== "string" ||
		!report.id ||
		report.id.length > 64 ||
		!integer(report.accepted) ||
		Number(report.accepted) > 100 ||
		!Array.isArray(report.issues) ||
		report.issues.length > 100 ||
		Number(report.accepted) + report.issues.length > 100 ||
		Number(report.accepted) + report.issues.length === 0
	)
		throw new Error("Invalid import report");
	for (const value of report.issues) {
		const issue = object(value);
		if (
			typeof issue.name !== "string" ||
			issue.name.length > 512 ||
			!importReasons.includes(issue.reason as ImportReason)
		)
			throw new Error("Invalid import issue");
	}
	return report as unknown as ImportReport;
}
export function parseSnapshot(value: unknown): Snapshot {
	const s = object(value);
	if (
		(s.schema !== 2 && s.schema !== 3) ||
		typeof s.epoch !== "string" ||
		!integer(s.revision) ||
		!Array.isArray(s.tasks) ||
		s.tasks.length > 100
	)
		throw new Error("Unsupported queue contract");
	for (const key of [
		"processing",
		"output_authorized",
		"clearing",
		"closing",
	])
		if (typeof s[key] !== "boolean")
			throw new Error(`Invalid queue ${key}`);
	for (const key of ["output", "persistence_error", "recovery_notice"])
		if (!nullableString(s[key])) throw new Error(`Invalid queue ${key}`);
	if (s.import_report !== undefined && s.import_report !== null)
		parseImportReport(s.import_report);
	const ids = new Set<string>();
	for (const value of s.tasks) {
		const task = object(value);
		if (
			typeof task.id !== "string" ||
			ids.has(task.id) ||
			typeof task.name !== "string" ||
			!integer(task.bytes) ||
			!integer(task.attempt) ||
			typeof task.authorized !== "boolean" ||
			!nullableString(task.error) ||
			!phases.includes(String(task.phase)) ||
			(s.schema === 2 &&
				["saving", "awaiting_save"].includes(String(task.phase))) ||
			!Array.isArray(task.formats) ||
			!task.formats.length ||
			!task.formats.every((f) => formats.includes(f)) ||
			!task.formats.includes(task.format)
		)
			throw new Error("Invalid queue task");
		ids.add(task.id);
		parseOptions(task.options);
		if (task.result !== null) {
			const result = object(task.result);
			if (
				typeof result.path !== "string" ||
				!integer(result.bytes) ||
				typeof result.note !== "string" ||
				typeof result.fingerprint !== "string" ||
				typeof result.complete !== "boolean" ||
				!integer(result.total) ||
				Number(result.total) < 1 ||
				Number(result.total) > 200 ||
				!Array.isArray(result.files) ||
				result.files.length > 200
			)
				throw new Error("Invalid saved result");
			const pages = new Set<number>();
			for (const value of result.files as unknown[]) {
				const f = object(value);
				if (
					typeof f.path !== "string" ||
					!integer(f.bytes) ||
					!integer(f.page) ||
					Number(f.page) < 1 ||
					Number(f.page) > Number(result.total) ||
					pages.has(Number(f.page)) ||
					typeof f.sha256 !== "string" ||
					!/^[a-f0-9]{64}$/.test(f.sha256)
				)
					throw new Error("Invalid saved page");
				pages.add(Number(f.page));
			}
		}
	}
	const tasks = s.tasks;
	if (s.failures !== undefined) {
		const values = object(s.failures);
		if (
			Object.keys(values).length > 100 ||
			Object.keys(values).some(
				(id) => !tasks.some((t: Task) => t.id === id),
			) ||
			Object.values(values).some(
				(v) => !failureCodes.includes(v as Failure),
			)
		)
			throw new Error("Invalid failure categories");
	}
	if (s.progress != null) {
		const p = object(s.progress),
			v = object(p.value);
		if (
			s.schema !== 3 ||
			Object.keys(p).some(
				(k) => !["id", "attempt", "value"].includes(k),
			) ||
			Object.keys(v).some((k) => !["stage", "percent"].includes(k)) ||
			typeof p.id !== "string" ||
			!integer(p.attempt) ||
			!["encoding", "validating", "publishing"].includes(
				String(v.stage),
			) ||
			(v.percent !== null && v.stage !== "encoding") ||
			(v.percent !== null &&
				(!integer(v.percent) || Number(v.percent) > 99)) ||
			!tasks.some(
				(t: Task) =>
					t.id === p.id &&
					t.attempt === p.attempt &&
					t.phase === "running",
			)
		)
			throw new Error("Invalid task progress");
	}
	return s as unknown as Snapshot;
}

export function submissionItems(tasks: Task[]): Submission["items"] {
	return tasks.map((task) => ({
		id: task.id,
		format: task.format,
		expected_attempt: task.attempt,
		options: task.options,
		save_only: task.phase === "awaiting_save",
	}));
}
