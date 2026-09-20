/** Runtime detection keeps the public web build usable without Tauri. */
export function isDesktop(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let saving = false;
export const isSavingDesktop = () => saving;

export async function saveDesktopBlob(
	blob: Blob,
	name: string,
): Promise<boolean> {
	if (saving)
		throw new Error("A save is already in progress / 正在保存，请稍候");
	saving = true;
	try {
		return await writeDesktopBlob(blob, name);
	} finally {
		saving = false;
	}
}

async function writeDesktopBlob(blob: Blob, name: string): Promise<boolean> {
	const { invoke } = await import("@tauri-apps/api/core");
	const token = await invoke<string | null>("begin_save", {
		name,
		size: blob.size,
	});
	if (token === null) return false;
	try {
		const chunkSize = 1024 * 1024;
		for (let offset = 0; offset < blob.size; offset += chunkSize) {
			await invoke(
				"append_save",
				await blob.slice(offset, offset + chunkSize).arrayBuffer(),
				{
					headers: { "x-save-token": token },
				},
			);
		}
		await invoke("finish_save", { token });
		return true;
	} catch (error) {
		// The result Blob stays in the queue, so the user can choose another destination.
		await invoke("abort_save", { token }).catch(() => {});
		throw error;
	}
}

export async function guardDesktopClose(hasWork: () => boolean) {
	const [{ getCurrentWindow }, { invoke }] = await Promise.all([
		import("@tauri-apps/api/window"),
		import("@tauri-apps/api/core"),
	]);
	let asking = false;
	return getCurrentWindow().onCloseRequested(async (event) => {
		if (!hasWork()) return;
		event.preventDefault();
		if (asking) return;
		asking = true;
		try {
			if (await invoke<boolean>("confirm_close"))
				await getCurrentWindow().destroy();
		} finally {
			asking = false;
		}
	});
}
