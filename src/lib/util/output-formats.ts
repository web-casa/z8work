interface Format {
	name: string;
	fromSupported: boolean;
	toSupported: boolean;
	isNative: boolean;
}
interface FormatConverter {
	name: string;
	supportedFormats: readonly Format[];
}
interface FormatFile {
	from: string;
	converters: readonly FormatConverter[];
	isZip(): boolean;
	isLarge(): boolean;
}

export function converterSupports(
	converter: FormatConverter,
	from: string,
	to: string,
) {
	const input = converter.supportedFormats.find((f) => f.name === from);
	const output = converter.supportedFormats.find((f) => f.name === to);
	return !!(
		input?.fromSupported &&
		output?.toSupported &&
		(input.isNative || output.isNative)
	);
}

export function outputFormats(
	file: FormatFile,
	candidates: readonly string[],
): string[] {
	return candidates.filter((to) =>
		file.converters.some((converter) => {
			if (file.isLarge() && converter.name !== "vertd") return false;
			return file.isZip()
				? converter.supportedFormats.some(
						(f) => f.name === to && f.toSupported,
					)
				: converterSupports(converter, file.from, to);
		}),
	);
}

export function commonOutputFormats(
	files: readonly FormatFile[],
	candidates: readonly string[],
) {
	if (!files.length) return [];
	return files.reduce(
		(common, file) => outputFormats(file, common),
		[...new Set(candidates)],
	);
}
