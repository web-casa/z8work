import type { WorkerMessage } from "$lib/types";

export class WorkerTimeoutError extends Error {
	constructor(type: string | undefined, timeoutMs: number) {
		super(`Worker ${type ?? "response"} timeout after ${timeoutMs}ms`);
		this.name = "WorkerTimeoutError";
	}
}

// Terminating a Worker does not settle pending message promises. Cancellation
// must reject the wait as well so conversion queues can release their slot.
export function waitForWorkerMessage<
	T extends { type: string } = WorkerMessage,
>(
	worker: Worker,
	type?: string,
	signal?: AbortSignal,
	timeoutMs?: number,
): Promise<T> {
	return new Promise((resolve, reject) => {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const cleanup = () => {
			clearTimeout(timeout);
			worker.removeEventListener("message", onMessage);
			worker.removeEventListener("error", onError);
			worker.removeEventListener("messageerror", onMessageError);
			signal?.removeEventListener("abort", onAbort);
		};
		const fail = (error: unknown) => {
			cleanup();
			reject(error);
		};
		const onAbort = () =>
			fail(signal?.reason ?? new Error("Conversion cancelled"));
		const onError = (event: ErrorEvent) =>
			fail(new Error(event.message || "Worker failed"));
		const onMessageError = () =>
			fail(new Error("Could not read worker message"));
		const onMessage = (event: MessageEvent<T>) => {
			if (type && event.data.type === "error" && type !== "error") {
				fail(
					new Error(
						String((event.data as T & { error?: unknown }).error),
					),
				);
			} else if (!type || event.data.type === type) {
				cleanup();
				resolve(event.data);
			}
		};
		if (signal?.aborted) {
			onAbort();
			return;
		}
		worker.addEventListener("message", onMessage);
		worker.addEventListener("error", onError);
		worker.addEventListener("messageerror", onMessageError);
		signal?.addEventListener("abort", onAbort, { once: true });
		if (timeoutMs !== undefined) {
			timeout = setTimeout(
				() => fail(new WorkerTimeoutError(type, timeoutMs)),
				timeoutMs,
			);
		}
	});
}
