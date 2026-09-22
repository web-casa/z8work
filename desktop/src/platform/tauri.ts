import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parseSnapshot, type Change, type Snapshot } from "./queue-contract.ts";
import type { QueueTransport } from "./queue-sync.ts";
export const queueTransport: QueueTransport = {
	subscribe: async (callback) =>
		listen<Change>("queue-changed", (event) => callback(event.payload)),
	snapshot: () => invoke("queue_snapshot"),
};
export async function queueCommand(
	command: string,
	args?: Record<string, unknown>,
): Promise<Snapshot> {
	return parseSnapshot(await invoke(command, args));
}

export const preferenceTransport = {
	read: () => invoke("read_preferences"),
	save: (
		revision: number,
		preferences: import("./preferences").Preferences,
	) =>
		invoke("save_preferences", { expectedRevision: revision, preferences }),
};
