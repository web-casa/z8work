import * as mupdf from "mupdf";

// Synthetic, redistributable PDFs: colored rectangles and vector text. Rotated,
// cropped, empty, password-protected and large-page variants need no user data.
export function pdfFixture({
	pages = 1,
	rotate = 0,
	bounds = [0, 0, 72, 48],
	password = false,
	crop = false,
} = {}) {
	const doc = new mupdf.PDFDocument();
	const font = new mupdf.Font("Helvetica");
	const fontRef = doc.addSimpleFont(font);
	try {
		for (let i = 0; i < pages; i++) {
			const color = i % 2 ? "0 0 1" : "1 0 0";
			const page = doc.addPage(
				bounds,
				rotate,
				{ Font: { F1: fontRef } },
				`${color} rg 8 8 20 20 re f 0 0 0 rg BT /F1 8 Tf 8 36 Td (Page ${i + 1}) Tj ET`,
			);
			try {
				if (crop) page.put("CropBox", [4, 4, 68, 44]);
				doc.insertPage(-1, page);
			} finally {
				page.destroy();
			}
		}
		const buffer = doc.saveToBuffer(
			password
				? "encrypt=aes-256,user-password=fixture-secret,owner-password=fixture-owner"
				: "compress",
		);
		try {
			return new Uint8Array(buffer.asUint8Array());
		} finally {
			buffer.destroy();
		}
	} finally {
		fontRef.destroy();
		font.destroy();
		doc.destroy();
	}
}
