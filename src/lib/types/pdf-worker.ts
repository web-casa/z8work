import type { PdfErrorCode, PdfFormat } from "$lib/util/pdf-options";

export type PdfRequest = {
	type: "convert";
	file: File;
	to: PdfFormat;
	quality: number;
};

export type PdfResponse =
	| { type: "ready" }
	| { type: "progress"; current: number; total: number }
	| { type: "finished"; output: Blob; pages: number; zip: boolean }
	| { type: "error"; error: string; code?: PdfErrorCode };
