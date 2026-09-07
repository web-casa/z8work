// One download per engine, shared by active conversions. A cancelled consumer
// does not stop other consumers; the last cancellation aborts the download.
export function createEngineResource(
	loader: (signal: AbortSignal) => Promise<ArrayBuffer>,
	timeoutMs = 180000,
) {
	let value: ArrayBuffer | undefined;
	let pending:
		| {
				controller: AbortController;
				promise: Promise<ArrayBuffer>;
				users: number;
		  }
		| undefined;
	return {
		load(signal: AbortSignal): Promise<ArrayBuffer> {
			if (signal.aborted) return Promise.reject(signal.reason);
			if (value) return Promise.resolve(value);
			if (!pending) {
				const controller = new AbortController();
				const timeout = setTimeout(
					() =>
						controller.abort(
							new Error("Engine download timed out"),
						),
					timeoutMs,
				);
				const request = {
					controller,
					users: 0,
					promise: Promise.resolve(new ArrayBuffer(0)),
				};
				pending = request;
				request.promise = Promise.resolve()
					.then(() => loader(controller.signal))
					.then((bytes) => {
						controller.signal.throwIfAborted();
						value = bytes;
						return bytes;
					})
					.finally(() => {
						clearTimeout(timeout);
						if (pending === request) pending = undefined;
					});
			}
			const request = pending;
			request.users++;
			return new Promise((resolve, reject) => {
				let settled = false;
				const finish = (error?: unknown, bytes?: ArrayBuffer) => {
					if (settled) return;
					settled = true;
					signal.removeEventListener("abort", abort);
					request.users--;
					if (!request.users && pending === request && !value) {
						pending = undefined;
						request.controller.abort();
					}
					if (bytes) resolve(bytes);
					else reject(error);
				};
				const abort = () => finish(signal.reason);
				signal.addEventListener("abort", abort, { once: true });
				request.promise.then(
					(bytes) => finish(undefined, bytes),
					(error) => finish(error),
				);
			});
		},
	};
}

export async function fetchEngine(
	url: string | URL,
	signal: AbortSignal,
	cache?: RequestCache,
) {
	const response = await fetch(url, { signal, cache });
	if (!response.ok)
		throw new Error(`Engine download failed: HTTP ${response.status}`);
	const bytes = await response.arrayBuffer();
	const magic = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
	if (magic.join(",") !== "0,97,115,109")
		throw new Error("Engine download is not a WebAssembly file");
	return bytes;
}
