interface DownloadFile {
	file: File;
	result: { file: File; to: string } | null;
}

export function downloadSnapshot(files: readonly DownloadFile[]) {
	return files.flatMap(({ file, result }) =>
		result
			? [
					{
						originalName: file.name,
						to: result.to.startsWith(".")
							? result.to
							: `.${result.to}`,
						input: result.file,
					},
				]
			: [],
	);
}

export function downloadName(
	template: string,
	originalName: string,
	to: string,
	date = new Date(),
) {
	return (
		template.replace(/%date%|%name%|%extension%/g, (token) => {
			if (token === "%date%") return date.toISOString();
			if (token === "%name%")
				return originalName.replace(/\.[^/.]+$/, "");
			return originalName.includes(".")
				? originalName.split(".").pop()!
				: "";
		}) + to
	);
}

/** Avoid losing outputs with the same basename when a ZIP is extracted. */
export function zipEntries(snapshot: ReturnType<typeof downloadSnapshot>) {
	const used = new Set<string>();
	return snapshot.map(({ originalName, to, input }) => {
		const base = originalName.replace(/\.[^/.]+$/, "");
		let name = base + to;
		let suffix = 2;
		while (used.has(name.toLowerCase()))
			name = `${base} (${suffix++})${to}`;
		used.add(name.toLowerCase());
		return { name, input, lastModified: input.lastModified };
	});
}

export function saveDownload(blob: Blob, name: string) {
	const url = URL.createObjectURL(
		new Blob([blob], { type: "application/octet-stream" }),
	);
	const anchor = document.createElement("a");
	try {
		anchor.href = url;
		anchor.download = name;
		anchor.hidden = true;
		document.body.append(anchor);
		anchor.click();
	} finally {
		anchor.remove();
		// Let the browser consume the URL before releasing it (including Safari).
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
}
