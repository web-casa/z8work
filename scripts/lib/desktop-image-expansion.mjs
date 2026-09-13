import assert from "node:assert/strict";
export function validateImageExpansion(report) {
	assert.equal(report.schema, 1);
	assert.equal(report.scope, "static-raster-expansion-2");
	const extra = ["bmp", "tga", "qoi"];
	assert.deepEqual(
		report.controls.map((r) => r.input).sort(),
		[...extra].sort(),
	);
	assert.ok(
		report.controls.every(
			(r) =>
				r.preview === true &&
				r.cancel === true &&
				r.corruptRejected === true,
		),
	);
	const images = [
		"png",
		"jpg",
		"jpeg",
		"webp",
		"avif",
		"heic",
		"heif",
		...extra,
	];
	const outputs = ["png", "jpeg", "webp", "avif", ...extra];
	const expected = images.flatMap((input) =>
		outputs
			.filter((output) => extra.includes(input) || extra.includes(output))
			.map((output) => `${input}:${output}`),
	);
	expected.push(...extra.map((f) => `pdf:${f}`));
	assert.deepEqual(
		report.routes.map((r) => `${r.input}:${r.output}`).sort(),
		expected.sort(),
	);
	assert.ok(
		report.routes.every(
			(r) =>
				r.decoded &&
				r.bytes > 0 &&
				(r.input !== "pdf" || r.pages === 3),
		),
	);
	assert.deepEqual(
		report.presets.map((r) => `${r.format}:${r.quality}`).sort(),
		extra
			.flatMap((f) =>
				["small", "balanced", "high"].map((q) => `${f}:${q}`),
			)
			.sort(),
	);
	assert.ok(report.presets.every((r) => r.passed === true));
	assert.deepEqual(
		report.semantics
			.map((r) => `${r.check}:${r.format}:${r.keep_metadata}`)
			.sort(),
		["16-bit", "ICC to sRGB", "EXIF orientation 6"]
			.flatMap((c) =>
				extra.flatMap((f) =>
					[false, true].map((m) => `${c}:${f}:${m}`),
				),
			)
			.sort(),
	);
	assert.ok(report.semantics.every((r) => r.passed === true));
}
