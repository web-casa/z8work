import type { PixelIconName } from "$lib/components/pixel/PixelIcon.svelte";

type IconEntry = {
	group?: string;
};

/** Icon for a tool or hub entry in directory and related-link sections. */
export function toolIcon(entry: IconEntry): PixelIconName {
	switch (entry.group) {
		case "audio":
			return "music";
		case "video":
			return "video";
		case "doc":
		case "pdf":
			return "file";
		default:
			return "picture";
	}
}
