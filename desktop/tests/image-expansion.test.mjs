import test from "node:test";
import assert from "node:assert/strict";
import { validateImageExpansion } from "../../scripts/lib/desktop-image-expansion.mjs";
import { formats } from "../src/platform/queue-contract.ts";
import { defaults, parsePreferences } from "../src/platform/preferences.ts";
test("new output preferences survive validation and old preferences remain valid", () => {
	for (const format of formats)
		assert.equal(
			parsePreferences({ ...defaults(), batch_format: format })
				.batch_format,
			format,
		);
});
test("image expansion gate rejects a partial or duplicate route report", () => {
	assert.throws(() =>
		validateImageExpansion({
			schema: 1,
			scope: "static-raster-expansion-2",
			controls: ["bmp", "tga", "qoi"].map((input) => ({
				input,
				preview: true,
				cancel: true,
				corruptRejected: true,
			})),
			routes: [],
		}),
	);
	assert.throws(() =>
		validateImageExpansion({
			schema: 1,
			scope: "static-raster-expansion-2",
			controls: ["bmp", "tga", "qoi"].map((input) => ({
				input,
				preview: true,
				cancel: true,
				corruptRejected: true,
			})),
			routes: Array.from({ length: 45 }, () => ({
				input: "png",
				output: "bmp",
				decoded: true,
				bytes: 100,
			})),
		}),
	);
});
