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
		localProcessing("device-v1", [task({ name: "image.tiff" })]),
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
	const audio =
		"First audio track only. WAV uses PCM 16-bit; MP3/AAC/Opus are lossy. Metadata is removed.";
	assert.equal(resultNote(audio, true), audio);
	assert.match(resultNote(audio, false), /第一条音轨/);
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
