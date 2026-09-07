import type { PdfRequest, PdfResponse } from "$lib/types/pdf-worker";
import { renderPdf } from "$lib/util/pdf-images";
import {
	PdfConversionError,
	PDF_LIMITS,
	isPdfFormat,
	type PdfFormat,
} from "$lib/util/pdf-options";

const send = (message: PdfResponse) => self.postMessage(message);

let encoder: Promise<typeof import("$lib/util/pdf-image-encoder")> | undefined;

async function encodeImage(
	png: Blob,
	to: PdfFormat,
	quality: number,
): Promise<Blob> {
	// Load once per document, only for formats MuPDF cannot write directly.
	// Both WASM engines live in this task's worker, so cancellation stops them.
	encoder ??= (async () => {
		try {
			const [{ initializeImageMagick }, { default: wasmUrl }, module] =
				await Promise.all([
					import("@imagemagick/magick-wasm"),
					import("@imagemagick/magick-wasm/magick.wasm?url"),
					import("$lib/util/pdf-image-encoder"),
				]);
			const response = await fetch(wasmUrl);
			if (!response.ok)
				throw new Error(`Image encoder HTTP ${response.status}`);
			await initializeImageMagick(
				new Uint8Array(await response.arrayBuffer()),
			);
			return module;
		} catch {
			throw new PdfConversionError("encoder_load");
		}
	})();
	return (await encoder).encodePdfImage(png, to, quality);
}

self.onmessage = async ({ data }: MessageEvent<PdfRequest>) => {
	try {
		if (data.type !== "convert" || !isPdfFormat(data.to))
			throw new Error("Unsupported PDF output format");
		if (data.file.size > PDF_LIMITS.inputBytes)
			throw new PdfConversionError("input_size");
		const mupdf = await import("mupdf");
		const result = await renderPdf(
			mupdf,
			new Uint8Array(await data.file.arrayBuffer()),
			data.to,
			data.quality,
			(current, total) => send({ type: "progress", current, total }),
			encodeImage,
		);
		send({ type: "finished", ...result });
	} catch (error) {
		send({
			type: "error",
			error: error instanceof Error ? error.message : String(error),
			code: error instanceof PdfConversionError ? error.code : undefined,
		});
	}
};

send({ type: "ready" });
