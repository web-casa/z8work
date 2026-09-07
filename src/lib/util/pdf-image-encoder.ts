import { convertImage } from "./magick-image";
import { PDF_OUTPUT_TYPES, type PdfFormat } from "./pdf-options";

// MuPDF has already released the page pixmap before we decode this PNG. Use
// the same codecs, AVIF lossless fix and ICO size limit as ordinary images.
export async function encodePdfImage(
	png: Blob,
	to: PdfFormat,
	quality: number,
): Promise<Blob> {
	const output = convertImage(
		new Uint8Array(await png.arrayBuffer()),
		".png",
		to,
		false, // PDF metadata is not image metadata; these are rendered pixels.
		quality,
	);
	return new Blob([new Uint8Array(output)], { type: PDF_OUTPUT_TYPES[to] });
}
