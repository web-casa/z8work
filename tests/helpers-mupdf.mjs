import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Candidate acceptance uses an isolated copy of the installed JS wrapper with
// the rebuilt WASM. Fixture generation keeps using the original npm engine.
export const mupdf = await import(
	process.env.Z8_MUPDF_CANDIDATE_DIR
		? pathToFileURL(resolve(process.env.Z8_MUPDF_CANDIDATE_DIR, "mupdf.js"))
				.href
		: "mupdf"
);
