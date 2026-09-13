// These are discovery facts, never an authorization to expose conversion routes.
export function imageInventory(raw) {
	const entries = new Map();
	for (const line of raw.split(/\r?\n/)) {
		const row = line.trim().split(/\s+/);
		if (
			row.length < 4 ||
			!/^[A-Z0-9]+\*?$/.test(row[0]) ||
			!/^[r-][w-][+-]$/.test(row[2])
		)
			continue;
		entries.set(row[0].replace(/\*$/, ""), {
			read: row[2][0] === "r",
			write: row[2][1] === "w",
			multiImage: row[2][2] === "+",
		});
	}
	return entries;
}
export function codecInventory(raw) {
	const entries = new Set();
	for (const line of raw.split(/\r?\n/)) {
		const row = line.trim().split(/\s+/);
		if (
			/^[VAS][A-Z.]{5}$/.test(row[0] ?? "") &&
			/^[a-zA-Z0-9_]+$/.test(row[1] ?? "")
		)
			entries.add(row[1]);
	}
	return entries;
}
export function summarizeInventory(report) {
	const find = (kind) =>
		report.probes.find((p) => p.kind === kind && p.status === "listed")
			?.raw;
	const imagesRaw = find("image-formats"),
		encodersRaw = find("encoders");
	const images = imagesRaw === undefined ? null : imageInventory(imagesRaw);
	const encoders =
		encodersRaw === undefined ? null : codecInventory(encodersRaw);
	return {
		scope: "listed-capabilities-not-tested-routes",
		images: Object.fromEntries(
			[
				"PNG",
				"JPEG",
				"WEBP",
				"AVIF",
				"BMP",
				"GIF",
				"TIFF",
				"ICO",
				"TGA",
				"QOI",
				"JXL",
				"JP2",
				"EXR",
				"SVG",
				"PSD",
				"HEIC",
			].map((id) => [
				id,
				images === null
					? { status: "unknown" }
					: images.has(id)
						? { status: "listed", ...images.get(id) }
						: { status: "not-listed" },
			]),
		),
		encoders: Object.fromEntries(
			[
				"libx264",
				"libx265",
				"libvpx-vp9",
				"libsvtav1",
				"libaom-av1",
				"aac",
				"libvorbis",
				"alac",
				"pcm_s16be",
			].map((id) => [
				id,
				encoders === null
					? "unknown"
					: encoders.has(id)
						? "listed"
						: "not-listed",
			]),
		),
	};
}
