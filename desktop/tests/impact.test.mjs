import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	localProcessing,
	summarizeSavedImages,
	resultNote,
} from "../src/platform/impact.ts";
import {
	estimateStorage,
	estimateGlobal,
	IMPACT_SOURCES,
} from "../../src/lib/util/environmental-impact.ts";
const task = (patch = {}) => ({
	id: "one",
	name: "image.png",
	format: "avif",
	phase: "saved",
	bytes: 1000,
	result: { bytes: 400, complete: true },
	...patch,
});
const summary = (tasks) => summarizeSavedImages(tasks, "device-v1");
test("impact uses saved image snapshots, offsets growth and resets on clear", () => {
	assert.equal(summary([task()]).savedBytes, 600);
	assert.equal(
		summary([
			task(),
			task({ id: "two", result: { bytes: 1800, complete: true } }),
		]).savedBytes,
		-200,
	);
	assert.equal(
		summary([task({ result: { bytes: 1800, complete: true } })]).gramsCO2,
		0,
	);
	assert.deepEqual(summary([]), {
		count: 0,
		savedBytes: 0,
		kWh: 0,
		gramsCO2: 0,
	});
	for (const phase of [
		"ready",
		"queued",
		"running",
		"saving",
		"awaiting_save",
		"failed",
		"partial",
		"cancelled",
		"interrupted",
	])
		assert.equal(summary([task({ phase })]).count, 0, phase);
	for (const patch of [
		{ result: null },
		{ result: { bytes: 400, complete: false } },
		{ bytes: NaN },
		{ bytes: 0 },
		{ bytes: Infinity },
		{ result: { bytes: -1, complete: true } },
		{ name: "doc.pdf" },
		{ name: "sound.wav", format: "wav" },
	])
		assert.equal(summary([task(patch)]).count, 0);
});
test("duplicate delivery, retries and stale saved results never accumulate", () => {
	assert.equal(summary([task(), task()]).count, 1);
	assert.equal(summary([task(), task({ phase: "running" })]).count, 0);
	assert.equal(
		summary([
			task(),
			task({ attempt: 2, result: { bytes: 100, complete: true } }),
		]).savedBytes,
		900,
	);
	assert.equal(summary([task({ authorized: false })]).count, 1); // restored saved history: historical comparison, not disk measurement
});
test("zero upload capability fails closed for missing backend or unknown routes", () => {
	for (const location of [null, undefined, "device", "cloud"])
		assert.equal(localProcessing(location, [task()]), false);
	assert.equal(localProcessing("device-v1", [task()]), true);
	assert.equal(
		localProcessing("device-v1", [task({ name: "image.svgz" })]),
		false,
	);
	assert.equal(
		localProcessing("device-v1", [task({ format: "txt" })]),
		false,
	);
	assert.equal(summarizeSavedImages([task()], "cloud").count, 0);
});
test("desktop scenario reuses the web model and source allowlist matches", async () => {
	assert.deepEqual(summary([task()]), {
		count: 1,
		savedBytes: 600,
		...estimateStorage(600),
	});
	assert.equal(estimateGlobal(1).yearEndBytes, 6e9 * 1e6 * 365);
	assert.ok(Math.abs(estimateGlobal(1).kWh - 6252012) < 0.000001);
	const rust = await readFile(
		new URL("../../src-tauri/src/impact.rs", import.meta.url),
		"utf8",
	);
	for (const url of Object.values(IMPACT_SOURCES))
		assert.ok(rust.includes(url), url);
});
test("result notes translate application copy without echoing unknown logs", () => {
	const mp3 =
		"First audio track only. MP3 is lossy at 192 kb/s; sources at unsupported MP3 sampling rates are resampled. Metadata is removed.";
	assert.match(resultNote(mp3, false), /MP3/);
	const opus =
		"First audio track only. Opus is lossy at 128 kb/s and uses a 48 kHz clock; sources not at 48 kHz are resampled. Metadata is removed.";
	assert.match(resultNote(opus, false), /48 kHz/);
	const audio =
		"First audio track only. WAV uses PCM 16-bit; FLAC is lossless. Metadata is removed.";
	assert.equal(resultNote(audio, true), audio);
	assert.match(resultNote(audio, false), /第一条音轨/);
	const aac =
		"First audio track only. AAC uses a lossy ADTS stream at 192 kb/s; sources at unsupported AAC sampling rates are resampled. Tags and cover art are removed.";
	assert.match(resultNote(aac, false), /重采样/);
	const heic =
		"First frame only. HEIC/HEIF uses a lossy HEVC 8-bit SDR compatibility profile with 4:2:0 chroma and a white background. Metadata and ICC profiles are omitted. Third-party preview support varies.";
	assert.match(resultNote(heic, false), /有损 HEVC/);
	const pbm =
		"First frame only. PBM/XBM is thresholded at 50% to a 1-bit black-and-white image; metadata and ICC profiles are omitted.";
	assert.match(resultNote(pbm, false), /1 位黑白/);
	const pgm =
		"First frame only. PGM is an 8-bit grayscale image; metadata and ICC profiles are omitted.";
	assert.match(resultNote(pgm, false), /8 位灰度/);
	const org =
		"Text only. Org markup is interpreted by Pandoc; underscores can represent subscripts, so use Org literal/code markup or #+OPTIONS: ^:{} for identifiers that must retain underscores. Images, layout and formatting are omitted.";
	assert.match(resultNote(org, false), /下划线可表示下标/);
	const svg =
		"Static SVG only. Scripts, animation, external files and system fonts are not used; embedded raster data is limited. Output is an 8-bit sRGB bitmap.";
	assert.match(resultNote(svg, false), /静态 SVG/);
	const pdf =
		"PDF: 3 pages, 144 DPI, at most 4000 × 4000 pixels per page. Successfully saved pages are retained on cancellation or failure.";
	assert.match(resultNote(pdf, false), /3 页，144 DPI/);
	for (const english of [true, false])
		assert.ok(
			!resultNote("secret /home/user/password", english).includes(
				"secret",
			),
		);
});
