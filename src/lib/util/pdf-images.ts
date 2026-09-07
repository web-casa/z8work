import type * as MuPDF from "mupdf";
import { downloadZip } from "client-zip";
import {
	PDF_LIMITS,
	PDF_OUTPUT_TYPES,
	PdfConversionError,
	needsPdfImageEncoder,
	type PdfFormat,
} from "./pdf-options";

// Runs only in a dedicated worker in the app. Inject the engine so tests can
// exercise the same rendering and archive path with the actual WASM in Node.
export async function renderPdf(
	mupdf: typeof MuPDF,
	input: Uint8Array,
	to: PdfFormat,
	quality: number,
	onProgress: (current: number, total: number) => void,
	encodeImage: (png: Blob, to: PdfFormat, quality: number) => Promise<Blob>,
): Promise<{ output: Blob; pages: number; zip: boolean }> {
	if (input.byteLength > PDF_LIMITS.inputBytes)
		throw new PdfConversionError("input_size");
	let doc: MuPDF.Document;
	try {
		doc = mupdf.Document.openDocument(input, "application/pdf");
	} catch {
		throw new PdfConversionError("invalid");
	}
	try {
		if (!doc.isPDF()) throw new PdfConversionError("invalid");
		if (doc.needsPassword()) throw new PdfConversionError("password");
		const pages = doc.countPages();
		if (!pages) throw new PdfConversionError("empty");
		if (pages > PDF_LIMITS.pages)
			throw new PdfConversionError("page_limit");
		onProgress(0, pages);
		let outputBytes = 0;
		const renderPage = async (index: number) => {
			const page = doc.loadPage(index);
			let image: Blob;
			try {
				const bounds = page.getBounds();
				const scale = PDF_LIMITS.dpi / 72;
				// Match the renderer's outward-rounded pixel bounds, including
				// rotated pages and CropBoxes with a nonzero origin.
				const width =
					Math.ceil(bounds[2] * scale) -
					Math.floor(bounds[0] * scale);
				const height =
					Math.ceil(bounds[3] * scale) -
					Math.floor(bounds[1] * scale);
				if (
					!Number.isFinite(width * height) ||
					width <= 0 ||
					height <= 0 ||
					width * height > PDF_LIMITS.pagePixels
				)
					throw new PdfConversionError("page_size");
				const pixmap = page.toPixmap(
					mupdf.Matrix.scale(scale, scale),
					mupdf.ColorSpace.DeviceRGB,
					false, // White paper, including pages without a painted background.
					true, // Include annotations and form appearances; never enable PDF JS.
				);
				try {
					const jpeg = to === ".jpeg" || to === ".jpg";
					image = new Blob(
						[
							new Uint8Array(
								jpeg ? pixmap.asJPEG(quality) : pixmap.asPNG(),
							),
						],
						{ type: jpeg ? "image/jpeg" : "image/png" },
					);
				} finally {
					pixmap.destroy();
				}
			} finally {
				page.destroy();
			}
			if (needsPdfImageEncoder(to)) {
				image = await encodeImage(image, to, quality);
				if (image.type !== PDF_OUTPUT_TYPES[to])
					throw new PdfConversionError("encoder_format");
			}
			outputBytes += image.size;
			if (outputBytes > PDF_LIMITS.outputBytes)
				throw new PdfConversionError("output_size");
			onProgress(index + 1, pages);
			return image;
		};
		if (pages === 1)
			return { output: await renderPage(0), pages, zip: false };
		// Consume one page at a time; keep encoded output, never all page pixels.
		async function* entries() {
			for (let index = 0; index < pages; index++) {
				yield {
					name: `page-${String(index + 1).padStart(3, "0")}${to}`,
					input: await renderPage(index),
				};
			}
		}
		return {
			output: await downloadZip(entries()).blob(),
			pages,
			zip: true,
		};
	} finally {
		doc.destroy();
	}
}
