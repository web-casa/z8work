// MIME fallback is only for files without a suffix (for example clipboard images).
// An explicit suffix always wins; an XLSX must not be unpacked as a generic ZIP.
const mimeFormats: Readonly<Record<string, string>> = {
	"image/png": ".png",
	"image/jpeg": ".jpeg",
	"image/webp": ".webp",
	"image/gif": ".gif",
	"image/avif": ".avif",
	"image/bmp": ".bmp",
	"image/tiff": ".tiff",
	"image/heic": ".heic",
	"image/heif": ".heif",
	"image/x-icon": ".ico",
	"image/vnd.microsoft.icon": ".ico",
	"application/pdf": ".pdf",
	"application/zip": ".zip",
	"application/x-zip-compressed": ".zip",
};

export function inputFormat(file: { name: string; type?: string }): string {
	const dot = file.name.lastIndexOf(".");
	if (dot >= 0) return file.name.slice(dot).trimEnd().toLowerCase();
	return mimeFormats[file.type?.toLowerCase() ?? ""] ?? "";
}

export function normalizedInputName(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot < 0
		? name
		: name.slice(0, dot) + name.slice(dot).trimEnd().toLowerCase();
}
