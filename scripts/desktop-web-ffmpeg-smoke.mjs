// Exercise an isolated single-thread core without changing application assets.
// This supplies the worker location expected by upstream; it is not a browser test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
const { values } = parseArgs({
	options: { "core-dir": { type: "string" }, output: { type: "string" } },
});
if (!values["core-dir"] || !values.output)
	throw Error("Use --core-dir DIRECTORY --output NEW_REPORT.json");
const directory = resolve(values["core-dir"]);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
globalThis.self = { location: { href: import.meta.url } };
const { default: create } = await import(
	pathToFileURL(join(directory, "ffmpeg-core.js"))
);
const wasm = await readFile(join(directory, "ffmpeg-core.wasm"));
const core = await create({ wasmBinary: wasm });
const logs = [];
core.setLogger(({ message }) => logs.push(message));
core.setTimeout(30_000);
const cases = [
	{ name: "PCM WAV", output: "/sine.wav", codec: "pcm_s16le", magic: "RIFF" },
	{ name: "MP3", output: "/sine.mp3", codec: "libmp3lame", magic: "ID3" },
	{
		name: "Ogg Vorbis",
		output: "/sine.ogg",
		codec: "libvorbis",
		magic: "OggS",
	},
	{ name: "FLAC", output: "/sine.flac", codec: "flac", magic: "fLaC" },
];
const checks = [];
for (const test of cases) {
	assert.equal(
		core.exec(
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:sample_rate=8000",
			"-t",
			"0.2",
			"-c:a",
			test.codec,
			test.output,
		),
		0,
		test.name,
	);
	const bytes = Buffer.from(core.FS.readFile(test.output));
	assert.equal(
		bytes.subarray(0, test.magic.length).toString(),
		test.magic,
		test.name,
	);
	core.reset();
	core.setTimeout(30_000);
	assert.equal(
		core.exec(
			"-i",
			test.output,
			"-f",
			"s16le",
			"-acodec",
			"pcm_s16le",
			"/decoded.pcm",
		),
		0,
		test.name + " decode",
	);
	const decoded = core.FS.readFile("/decoded.pcm");
	assert.ok(
		decoded.length >= 1600 && decoded.length <= 8192,
		test.name + " decoded sample count",
	);
	assert.ok(
		decoded.some((byte) => byte !== 0),
		test.name + " non-silent samples",
	);
	checks.push({
		name: test.name,
		bytes: bytes.length,
		sha256: digest(bytes),
		decodedBytes: decoded.length,
	});
	core.reset();
	core.setTimeout(30_000);
}
assert.equal(
	core.exec(
		"-f",
		"lavfi",
		"-i",
		"color=c=red:s=32x32:r=5:d=0.2",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"/video.mp4",
	),
	0,
);
const video = Buffer.from(core.FS.readFile("/video.mp4"));
assert.equal(video.subarray(4, 8).toString(), "ftyp");
core.reset();
core.setTimeout(30_000);
assert.equal(
	core.exec(
		"-i",
		"/video.mp4",
		"-f",
		"rawvideo",
		"-pix_fmt",
		"rgb24",
		"/decoded.rgb",
	),
	0,
);
const pixels = core.FS.readFile("/decoded.rgb");
assert.equal(pixels.length, 32 * 32 * 3);
assert.ok(
	pixels[0] >= 240 && pixels[1] <= 20 && pixels[2] <= 20,
	"decoded red frame",
);
checks.push({ name: "H.264 MP4", bytes: video.length, sha256: digest(video) });
core.reset();
core.setTimeout(30_000);
assert.notEqual(core.exec("-i", "/missing-input.wav", "/invalid.wav"), 0);
checks.push({ name: "missing input rejected", status: "passed" });
const report = {
	schema: 1,
	status: "passed",
	scope: "single-thread core conversion smoke; browser and native packaging not covered",
	wasmSha256: digest(wasm),
	checks,
	releaseReady: false,
};
await writeFile(values.output, JSON.stringify(report, null, 2) + "\n", {
	flag: "wx",
});
console.log(
	JSON.stringify({
		status: report.status,
		checks: checks.length,
		wasmSha256: report.wasmSha256,
	}),
);
