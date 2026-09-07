// Only real, tested raster output formats; encoder aliases such as PNG24 are
// settings rather than useful download extensions. Keep PNG as the default.
export const PDF_OUTPUT_TYPES = {
	".png": "image/png",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".webp": "image/webp",
	".avif": "image/avif",
	".jxl": "image/jxl",
	".gif": "image/gif",
	".bmp": "image/bmp",
	".tiff": "image/tiff",
	".tif": "image/tiff",
	".ico": "image/vnd.microsoft.icon",
	".jp2": "image/jp2",
	".psd": "image/vnd.adobe.photoshop",
	".qoi": "image/qoi",
	".tga": "image/x-tga",
	".ppm": "image/x-portable-pixmap",
	".pgm": "image/x-portable-graymap",
	".pbm": "image/x-portable-bitmap",
	".pnm": "image/x-portable-anymap",
	".pcx": "image/x-pcx",
	".dds": "image/vnd-ms.dds",
	".exr": "image/x-exr",
	".hdr": "image/vnd.radiance",
} as const;
export type PdfFormat = keyof typeof PDF_OUTPUT_TYPES;
export const PDF_FORMATS = Object.keys(PDF_OUTPUT_TYPES) as PdfFormat[];

export function needsPdfImageEncoder(format: PdfFormat): boolean {
	return ![".png", ".jpeg", ".jpg"].includes(format);
}

export const PDF_LIMITS = {
	dpi: 144,
	inputBytes: 100 * 1024 * 1024,
	pages: 200,
	pagePixels: 16_000_000,
	outputBytes: 256 * 1024 * 1024,
} as const;

export type PdfErrorCode =
	| "password"
	| "invalid"
	| "empty"
	| "input_size"
	| "page_limit"
	| "page_size"
	| "output_size"
	| "encoder_load"
	| "encoder_format";

export class PdfConversionError extends Error {
	constructor(public readonly code: PdfErrorCode) {
		super(code);
		this.name = "PdfConversionError";
	}
}

export function isPdfFormat(format: string): format is PdfFormat {
	return PDF_FORMATS.some((candidate) => candidate === format);
}
