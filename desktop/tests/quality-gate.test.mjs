import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	validateQuality,
	validateConversions,
	validatePdfColor,
} from "../../scripts/lib/desktop-snap-installed.mjs";
test("candidate quality gate rejects old scope, omitted checks, duplicates and bad pixels", async () => {
	const current = JSON.parse(
		await readFile("docs/desktop/evidence/phase27/formats.json", "utf8"),
	);
	// Historical quality data predates the PDF colour gate; it must no longer pass.
	assert.throws(() => validateQuality(current, "linux-aarch64"), /PDF ICC/);
	current.pdfColor = JSON.parse(
		await readFile(
			"docs/desktop/evidence/phase28-pdf-icc/pdf-color.json",
			"utf8",
		),
	);
	validateQuality(current, "linux-aarch64");
	const old = JSON.parse(
		await readFile(
			"docs/desktop/evidence/phase8/final-conversions.json",
			"utf8",
		),
	);
	assert.throws(() => validateConversions(old));
	for (const change of [
		(r) => r.qualityChecks.pop(),
		(r) => (r.qualityChecks[1] = r.qualityChecks[0]),
		(r) => (r.qualityChecks[0].passed = false),
		(r) => (r.imageCalibration[0].semantic.premultipliedRgbRmse = 0.9),
		(r) => (r.imageCalibration[1] = r.imageCalibration[0]),
		(r) => r.routes.pop(),
		(r) => (r.phase = 2),
	]) {
		const changed = structuredClone(current);
		change(changed);
		assert.throws(() => validateQuality(changed, "linux-aarch64"));
	}
	assert.throws(() => validateQuality(current, "windows-x86_64"));
});

test("PDF color gate checks pixels, fixed limits, all formats and negative control", async () => {
	const current = JSON.parse(
		await readFile(
			"docs/desktop/evidence/phase28-pdf-icc/pdf-color.json",
			"utf8",
		),
	);
	validatePdfColor(current);
	for (const change of [
		(r) => r.checks.pop(),
		(r) => (r.checks[1] = r.checks[0]),
		(r) => (r.checks[0].passed = false),
		(r) => (r.checks[0].limit = 255),
		(r) => (r.checks[0].actualRgb[0][2] = 51),
		(r) => (r.checks[0].actualRgb[0][2] = NaN),
		(r) => (r.checks[0].actualRgb = []),
		(r) => (r.checks[0].expectedRgb[0][2] = 51),
		(r) => (r.checks[0].maxChannelError = 999),
		(r) => (r.checks[0].dimensions = [48, 288]),
		(r) => (r.negativeControlMaxChannelError = 0),
		(r) => (r.negativeControlMaxChannelError = Infinity),
		(r) => (r.fixtureSha256 = "old"),
	]) {
		const changed = structuredClone(current);
		change(changed);
		assert.throws(() => validatePdfColor(changed));
	}
});
