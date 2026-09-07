export type ProcessingLocation = "local" | "remote" | "unknown";

// A capability statement, not a browser-wide traffic measurement. Fail closed
// for a future converter that has not explicitly declared local processing.
export function usesOnlyLocalConverters(
	converters: readonly { processingLocation?: ProcessingLocation }[],
): boolean {
	return (
		converters.length > 0 &&
		converters.every(
			(converter) => converter.processingLocation === "local",
		)
	);
}
