export type ImageQualityMode = "balanced" | "custom";

export function normalizeImageQuality(value: unknown, fallback = 80): number {
	const number =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim() !== ""
				? Number(value)
				: NaN;
	return Number.isFinite(number)
		? Math.min(100, Math.max(1, Math.round(number)))
		: fallback;
}

export function imageQuality(
	to: string,
	mode: ImageQualityMode,
	custom: unknown,
): number {
	if (mode === "custom") return normalizeImageQuality(custom);
	return to.toLowerCase().replace(/^\./, "") === "avif" ? 60 : 80;
}

// Older settings did not distinguish a saved default of 100 from an explicit
// lossless choice. Preserve both; the UI offers the recommended preset clearly.
export function imageQualityMode(settings: {
	magickQualityMode?: unknown;
	magickQuality?: unknown;
}): ImageQualityMode {
	if (
		settings.magickQualityMode === "balanced" ||
		settings.magickQualityMode === "custom"
	)
		return settings.magickQualityMode;
	return settings.magickQuality === undefined ? "balanced" : "custom";
}

export function imageConcurrency(cores = 2, memoryGB?: number): number {
	return cores < 2 || (memoryGB !== undefined && memoryGB <= 4) ? 1 : 2;
}
