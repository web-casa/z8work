import assert from "node:assert/strict";
const outputs = ["wav", "mp3", "flac", "opus", "m4a", "ogg", "aiff"];
const inputs = [
	"mp3",
	"wav",
	"flac",
	"ogg",
	"m4a",
	"opus",
	"mp4",
	"mov",
	"mkv",
	"webm",
	"aiff",
	"aif",
];
const codecs = {
	wav: "pcm_s16le",
	mp3: "mp3",
	flac: "flac",
	opus: "opus",
	m4a: "aac",
	ogg: "vorbis",
	aiff: "pcm_s16be",
};
const extra = ["ogg", "aiff"];
function encoding(value, format, rate, channels) {
	assert.deepEqual(value, {
		codec: codecs[format],
		container: format,
		sampleRate: rate,
		channels,
		tagsRemoved: true,
	});
}
export function validateAudioExpansion(report) {
	assert.equal(report?.schema, 1);
	assert.equal(report.scope, "audio-expansion-3b");
	const expected = inputs.flatMap((input) =>
		outputs
			.filter(
				(output) =>
					["aiff", "aif"].includes(input) || extra.includes(output),
			)
			.map((output) => `${input}:${output}`),
	);
	assert.deepEqual(
		report.routes.map((r) => `${r.input}:${r.output}`).sort(),
		expected.sort(),
	);
	for (const r of report.routes) {
		assert.equal(r.decoded, true);
		assert.equal(r.sourceUnchanged, true);
		assert.ok(Number.isSafeInteger(r.bytes) && r.bytes > 0);
		const s = r.semantic;
		assert.equal(s.durationLimitSeconds, 0.15);
		assert.ok(
			Number.isFinite(s.durationDeltaSeconds) &&
				s.durationDeltaSeconds >= 0 &&
				s.durationDeltaSeconds <= 0.15,
		);
		assert.equal(s.input.streams[0].channels, 2);
		assert.equal(s.output.streams[0].channels, 2);
		assert.equal(s.output.streams[0].codec_name, codecs[r.output]);
		assert.equal(s.left440HzRight880HzAmplitude.length, 2);
		assert.ok(
			s.left440HzRight880HzAmplitude.every(
				(v) => Number.isFinite(v) && v >= 0.08 && v < 0.3,
			),
		);
		if (extra.includes(r.output)) encoding(r.encoding, r.output, 48000, 2);
	}
	assert.deepEqual(
		report.boundaries
			.map(
				(r) =>
					`${r.check}:${r.format ?? r.sourceDepth}:${r.sampleRate ?? ""}`,
			)
			.sort(),
		[
			"mono:ogg:8000",
			"mono:aiff:8000",
			"mono:ogg:44100",
			"mono:aiff:44100",
			"pcm16:16:",
			"pcm16:24:",
			"first-track:ogg:",
			"first-track:aiff:",
			"no-audio:ogg:",
			"no-audio:aiff:",
		].sort(),
	);
	for (const r of report.boundaries) {
		assert.equal(r.passed, true);
		if (r.check === "mono") {
			encoding(r.encoding, r.format, r.sampleRate, 1);
			assert.ok(
				Number.isSafeInteger(r.peak) &&
					r.peak >= 3000 &&
					r.peak <= 15000,
			);
			assert.ok(
				Number.isSafeInteger(r.decodedSamples) &&
					Math.abs(r.decodedSamples - r.sampleRate) <=
						r.sampleRate / 10,
			);
		}
		if (r.check === "pcm16") assert.equal(r.decodedSamples, 48000);
		if (r.check === "first-track") {
			assert.equal(r.rejectedTrackAmplitude.length, 2);
			assert.ok(
				r.rejectedTrackAmplitude.every(
					(v) => Number.isFinite(v) && v >= 0 && v < 0.01,
				),
			);
		}
	}
	assert.deepEqual(report.controls.map((r) => r.input).sort(), [
		"aif",
		"aiff",
	]);
	assert.ok(
		report.controls.every(
			(r) =>
				r.cancel === true &&
				r.collision === true &&
				r.playlistRejected === true,
		),
	);
}
