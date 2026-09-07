// Scenario estimates, not measured device energy or verified avoided emissions.
// Decimal units: 1 MB = 1e6 bytes; 1 TB = 1e12 bytes. One continuously powered copy.
export const IMPACT_MODEL = {
	version: "2026-09-07",
	days: 365,
	internetUsers: 6_000_000_000,
	wattsPerTB: { hdd: 0.65, ssd: 1.2 },
	gramsCO2PerKWh: 435,
} as const;

export const IMPACT_SOURCES = {
	storage: "https://www.cloudcarbonfootprint.org/docs/methodology/",
	electricity: "https://www.iea.org/reports/electricity-2026/emissions",
	population:
		"https://www.itu.int/en/mediacentre/Pages/PR-2025-11-17-Facts-and-Figures.aspx",
	materials:
		"https://www.seagate.com/resources/working-toward-the-future-of-circularity/",
	waste: "https://www.itu.int/en/ITU-D/Environment/Pages/Publications/The-Global-E-waste-Monitor-2024.aspx",
} as const;

export type StorageKind = keyof typeof IMPACT_MODEL.wattsPerTB;

function nonnegative(value: number): boolean {
	return Number.isFinite(value) && value >= 0;
}

export function estimateStorage(
	bytes: number,
	days = IMPACT_MODEL.days as number,
	kind: StorageKind = "hdd",
) {
	if (
		!nonnegative(bytes) ||
		!nonnegative(days) ||
		!(kind in IMPACT_MODEL.wattsPerTB)
	) {
		throw new RangeError("Invalid storage scenario");
	}
	const kWh =
		((bytes / 1e12) * days * 24 * IMPACT_MODEL.wattsPerTB[kind]) / 1000;
	return { kWh, gramsCO2: kWh * IMPACT_MODEL.gramsCO2PerKWh };
}

export function estimateGlobal(dailyMB: number, kind: StorageKind = "hdd") {
	if (!nonnegative(dailyMB)) throw new RangeError("Invalid daily saving");
	const dailyBytes = IMPACT_MODEL.internetUsers * dailyMB * 1e6;
	const days = IMPACT_MODEL.days;
	// Each new day's reduction starts at the beginning of that day and remains
	// until year-end: cohorts are retained for 365, 364, ... 1 days, not all 365.
	return {
		dailyBytes,
		yearEndBytes: dailyBytes * days,
		...estimateStorage(dailyBytes, (days * (days + 1)) / 2, kind),
	};
}

interface ImageConversion {
	file: { size: number };
	from: string;
	result: { file: { size: number }; to: string } | null;
	processing?: boolean;
	queued?: boolean;
	cancelled?: boolean;
	failed?: boolean;
	findConverter(): { name: string } | undefined;
}

export function imageSaving(file: ImageConversion) {
	if (
		!file.result ||
		file.processing ||
		file.queued ||
		file.cancelled ||
		file.failed ||
		file.findConverter()?.name !== "imagemagick" ||
		file.from === ".zip" ||
		file.result.to === ".zip"
	)
		return null;
	const inputBytes = file.file.size;
	const outputBytes = file.result.file.size;
	if (
		!nonnegative(inputBytes) ||
		!nonnegative(outputBytes) ||
		inputBytes === 0 ||
		outputBytes === 0
	)
		return null;
	return { inputBytes, outputBytes, savedBytes: inputBytes - outputBytes };
}

export function summarizeImageSavings(files: readonly ImageConversion[]) {
	let count = 0;
	let savedBytes = 0;
	for (const file of files) {
		const saving = imageSaving(file);
		if (!saving) continue;
		count++;
		// Larger results offset smaller ones: this is the current queue's net
		// change, never an accumulated counter that rewards repeated conversions.
		savedBytes += saving.savedBytes;
	}
	return { count, savedBytes, ...estimateStorage(Math.max(0, savedBytes)) };
}

export function formatCarbon(grams: number, locale: string): string {
	const number = (value: number) =>
		new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }).format(
			value,
		);
	if (grams <= 0) return "0 g CO₂";
	if (grams < 0.00001) return `< ${number(0.01)} mg CO₂`;
	if (grams < 1) return `${number(grams * 1000)} mg CO₂`;
	if (grams < 1000) return `${number(grams)} g CO₂`;
	if (grams < 1e6) return `${number(grams / 1000)} kg CO₂`;
	return `${number(grams / 1e6)} t CO₂`;
}
