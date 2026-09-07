// Leave room below the 2 GiB boundary used by the local WASM conversion path.
// Smaller devices can still run out of memory; conversion errors remain handled.
export const SUPPORTED_BUFFER_LIMIT = 2 ** 31 - 2 * 1024 * 1024;

export function supportedBufferLimit(cached: string | null): number {
	const value = Number(cached);
	return Number.isSafeInteger(value) && value > 0
		? Math.min(value, SUPPORTED_BUFFER_LIMIT)
		: SUPPORTED_BUFFER_LIMIT;
}
