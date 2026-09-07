import test from "node:test";
import assert from "node:assert/strict";
import { moduleUrl } from "./helpers-load-ts.mjs";
const {
	imageQuality,
	normalizeImageQuality,
	imageQualityMode,
	imageConcurrency,
} = await import(
	await moduleUrl(
		new URL("../src/lib/util/image-quality.ts", import.meta.url),
	)
);
test("new settings use compression; explicit and legacy quality choices are preserved", () => {
	assert.equal(imageQualityMode({}), "balanced");
	assert.equal(imageQualityMode({ magickQuality: 100 }), "custom");
	assert.equal(imageQualityMode({ magickQuality: 60 }), "custom");
	assert.equal(
		imageQualityMode({ magickQuality: 100, magickQualityMode: "balanced" }),
		"balanced",
	);
	assert.equal(imageQuality(".AVIF", "balanced", 100), 60);
	assert.equal(imageQuality(".webp", "balanced", 100), 80);
	assert.equal(imageQuality(".avif", "custom", 100), 100);
});
test("quality rejects click events and invalid stored values, normalizes numeric input", () => {
	assert.equal(normalizeImageQuality(new Event("click"), 60), 60);
	for (const v of [NaN, Infinity, undefined, null, {}, "", true])
		assert.equal(normalizeImageQuality(v), 80);
	assert.equal(normalizeImageQuality("50"), 50);
	assert.equal(normalizeImageQuality(70.5), 71);
	assert.equal(normalizeImageQuality(-10), 1);
	assert.equal(normalizeImageQuality(150), 100);
});
test("image workers are bounded even on many-core machines", () => {
	assert.equal(imageConcurrency(128, 32), 2);
	assert.equal(imageConcurrency(8, 4), 1);
	assert.equal(imageConcurrency(1, 8), 1);
	assert.equal(imageConcurrency(128), 2);
});
