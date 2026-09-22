import {
	formats,
	parseOptions,
	type Format,
	type Options,
} from "./queue-contract.ts";
export type Language = "system" | "en" | "zh_hans";
export type Preferences = {
	language: Language;
	batch_format: Format;
	batch_options: Options;
};
export type PreferenceRecord = {
	schema: 1;
	revision: number;
	preferences: Preferences;
};
export type PreferenceState = {
	record: PreferenceRecord | null;
	draft: Preferences;
	busy: boolean;
	pending: boolean;
	error: string;
};
export const defaults = (): Preferences => ({
	language: "system",
	batch_format: "webp",
	batch_options: { quality: "balanced", keep_metadata: false, pdf_dpi: 144 },
});
export const initialPreferences = (): PreferenceState => ({
	record: null,
	draft: defaults(),
	busy: true,
	pending: false,
	error: "",
});
function object(value: unknown, keys: string[]): Record<string, unknown> {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).length !== keys.length ||
		keys.some((key) => !Object.hasOwn(value, key))
	)
		throw new Error("Invalid desktop preferences");
	return value as Record<string, unknown>;
}
export function parsePreferences(value: unknown): Preferences {
	const p = object(value, ["language", "batch_format", "batch_options"]);
	if (
		typeof p.language !== "string" ||
		!["system", "en", "zh_hans"].includes(p.language) ||
		!formats.includes(p.batch_format as Format)
	)
		throw new Error("Unsupported desktop preference");
	object(p.batch_options, ["quality", "keep_metadata", "pdf_dpi"]);
	const options = parseOptions(p.batch_options);
	if (typeof options.quality !== "string")
		throw new Error("Invalid desktop quality preference");
	// Svelte state may be a Proxy: copy validated scalar fields instead of
	// passing reactive objects into structuredClone or the IPC boundary.
	return {
		language: p.language as Language,
		batch_format: p.batch_format as Format,
		batch_options: {
			quality: options.quality,
			keep_metadata: options.keep_metadata,
			pdf_dpi: options.pdf_dpi,
		},
	};
}
export function parsePreferenceRecord(value: unknown): PreferenceRecord {
	const r = object(value, ["schema", "revision", "preferences"]);
	if (
		r.schema !== 1 ||
		!Number.isSafeInteger(r.revision) ||
		Number(r.revision) < 0
	)
		throw new Error("Unsupported desktop preference record");
	return {
		schema: 1,
		revision: Number(r.revision),
		preferences: parsePreferences(r.preferences),
	};
}
export function preferenceLanguage(
	language: Language,
	languages: readonly string[],
): "en" | "zh-Hans" {
	if (language === "en") return "en";
	if (language === "zh_hans") return "zh-Hans";
	// Match the primary system language, not secondary preferred languages.
	return /^zh(?:-|$)/i.test(languages[0] ?? "") ? "zh-Hans" : "en";
}
export function createPreferences(
	transport: {
		read(): Promise<unknown>;
		save(revision: number, preferences: Preferences): Promise<unknown>;
	},
	changed: (state: PreferenceState) => void,
) {
	let state = initialPreferences();
	state.busy = false;
	let disposed = false;
	const publish = () => {
		if (!disposed) changed(structuredClone(state));
	};
	async function perform(action: () => Promise<unknown>) {
		if (state.busy || disposed) return;
		state.busy = true;
		state.error = "";
		publish();
		try {
			const record = parsePreferenceRecord(await action());
			state = {
				record,
				draft: structuredClone(record.preferences),
				busy: true,
				pending: false,
				error: "",
			};
		} catch (error) {
			state.error = String(error);
		} finally {
			state.busy = false;
			publish();
		}
	}
	return {
		load: () => perform(() => transport.read()),
		save: (preferences: Preferences) => {
			if (state.busy || !state.record || disposed)
				return Promise.resolve();
			const next = parsePreferences(preferences);
			state.draft = next;
			state.pending = true;
			return perform(() => transport.save(state.record!.revision, next));
		},
		dispose: () => {
			disposed = true;
		},
	};
}
