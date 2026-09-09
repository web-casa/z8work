import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	validateQuality,
	validateConversions,
} from "../../scripts/lib/desktop-snap-installed.mjs";
test("candidate quality gate rejects old scope, omitted checks, duplicates and bad pixels", async () => {
	const current = JSON.parse(
		await readFile("docs/desktop/evidence/phase27/formats.json", "utf8"),
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
