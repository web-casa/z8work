import { parseSnapshot, type Change, type Snapshot } from "./queue-contract.ts";
export type QueueTransport = {
	subscribe: (listener: (change: Change) => void) => Promise<() => void>;
	snapshot: () => Promise<unknown>;
};
// Subscribe first, then read the authoritative snapshot. Coalesce notifications,
// ignore older responses, and release a late subscription if the component unmounts.
export function connectQueue(
	transport: QueueTransport,
	apply: (snapshot: Snapshot) => void,
	report: (error: unknown) => void,
) {
	let disposed = false;
	let unlisten: (() => void) | undefined;
	let flight: Promise<void> | undefined;
	let dirty = false;
	let wanted = -1;
	let applied = -1;
	function refresh(): Promise<void> {
		if (disposed) return Promise.resolve();
		dirty = true;
		if (flight) return flight;
		flight = (async () => {
			let reads = 0;
			while (!disposed && dirty) {
				dirty = false;
				const state = parseSnapshot(await transport.snapshot());
				if (disposed) return;
				if (state.revision >= applied) {
					applied = state.revision;
					apply(state);
				}
				if (wanted > applied) {
					if (++reads >= 4)
						throw new Error(
							"Queue changed during synchronization; reconnect to refresh",
						);
					dirty = true;
				}
			}
		})()
			.catch((error) => {
				if (!disposed) report(error);
				throw error;
			})
			.finally(() => {
				flight = undefined;
			});
		return flight;
	}
	const ready = (async () => {
		unlisten = await transport.subscribe((change) => {
			if (!Number.isSafeInteger(change.revision) || change.revision < 0)
				return;
			wanted = Math.max(wanted, change.revision);
			void refresh().catch(() => {});
		});
		if (disposed) {
			unlisten();
			unlisten = undefined;
			return;
		}
		await refresh();
	})();
	return {
		ready,
		refresh,
		dispose() {
			disposed = true;
			unlisten?.();
			unlisten = undefined;
		},
	};
}
