import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateAudioExpansion } from "../../scripts/lib/desktop-audio-expansion.mjs";
import { previewKind } from "../src/platform/preview.ts";
import { defaults, parsePreferences } from "../src/platform/preferences.ts";
test("audio acceptance rejects incomplete routes, wrong codecs, lost tones and altered samples", async () => {
	const r = JSON.parse(
		await readFile(
			"docs/desktop/evidence/format-phase3b-20260913/local-audio.json",
			"utf8",
		),
	);
	validateAudioExpansion(r);
	for (const mutate of [
		(r) => r.routes.pop(),
		(r) => r.routes.push(r.routes[0]),
		(r) => (r.routes[0].decoded = "true"),
		(r) => (r.routes[0].sourceUnchanged = false),
		(r) => (r.routes[0].semantic.durationDeltaSeconds = 0.3),
		(r) => (r.routes[0].semantic.left440HzRight880HzAmplitude[0] = 0),
		(r) => (r.routes[0].encoding.codec = "opus"),
		(r) => (r.routes[0].encoding.tagsRemoved = false),
		(r) => r.boundaries.pop(),
		(r) => (r.boundaries[0].peak = 0),
		(r) =>
			(r.boundaries.find((b) => b.check === "pcm16").decodedSamples = 1),
		(r) =>
			(r.boundaries.find(
				(b) => b.check === "first-track",
			).rejectedTrackAmplitude[0] = 0.2),
		(r) => (r.controls[0].cancel = false),
		(r) => (r.controls[0].playlistRejected = false),
	]) {
		const bad = structuredClone(r);
		mutate(bad);
		assert.throws(() => validateAudioExpansion(bad));
	}
});
test("AIFF aliases get audio previews and new output preferences survive restart", () => {
	for (const name of ["input.aiff", "input.AIF", "input.ogg"])
		assert.equal(previewKind(name), "audio");
	for (const format of ["ogg", "aiff"]) {
		const prefs = { ...defaults(), batch_format: format };
		assert.equal(
			parsePreferences(JSON.parse(JSON.stringify(prefs))).batch_format,
			format,
		);
	}
});
