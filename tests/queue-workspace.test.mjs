import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleUrl } from "./helpers-load-ts.mjs";
const { queueSummary, fileState, batchTargets } = await import(
	await moduleUrl(new URL("../src/lib/util/queue-state.ts", import.meta.url))
);
const { outputFormats, commonOutputFormats } = await import(
	await moduleUrl(
		new URL("../src/lib/util/output-formats.ts", import.meta.url),
	)
);
const { downloadSnapshot, downloadName, zipEntries } = await import(
	await moduleUrl(new URL("../src/lib/util/download.ts", import.meta.url))
);
const file = (props = {}) => ({
	processing: false,
	queued: false,
	result: null,
	failed: false,
	cancelled: false,
	blocked: false,
	...props,
});
const summarize = (files) => queueSummary(files, (f) => f.blocked);

test("mixed queues account for each file exactly once; readiness is additive", () => {
	const entries = [
		file({ processing: true, cancelled: true }),
		file({ queued: true }),
		file({ result: {} }),
		file({ failed: true, blocked: true }),
		file({ cancelled: true }),
		file(),
	];
	const summary = summarize(entries);
	assert.equal(summary.action, "running");
	assert.equal(summary.running, 2);
	assert.equal(Object.values(summary.groups).flat().length, 6);
	assert.equal(summary.blocked.length, 1);
	assert.equal(fileState(entries[0]), "processing");
});
test("pending, retry and resume only select their own executable scope", () => {
	const success = file({ result: {} }),
		failed = file({ failed: true }),
		cancelled = file({ cancelled: true }),
		pending = file();
	assert.deepEqual(summarize([success, failed, cancelled, pending]).targets, [
		pending,
	]);
	assert.deepEqual(summarize([success, failed, cancelled]).targets, [failed]);
	assert.deepEqual(summarize([success, cancelled]).targets, [cancelled]);
	assert.equal(summarize([success]).action, "download");
	assert.equal(
		summarize([file({ failed: true, blocked: true })]).action,
		"blocked",
	);
	assert.equal(summarize([]).action, "add");
});
test("one blocked input does not stop valid conversion or downloading partial success", () => {
	const blocked = file({ blocked: true }),
		ready = file();
	assert.deepEqual(summarize([blocked, ready]).targets, [ready]);
	assert.equal(summarize([blocked, file({ result: {} })]).action, "download");
});
test("batch selection uses identity, excludes active/removed entries, snapshots additions", () => {
	const first = file(),
		sameName = file(),
		removed = file(),
		running = file({ processing: true }),
		queued = file({ queued: true });
	const current = [first, sameName, running, queued];
	const snapshot = batchTargets(current, [
		first,
		removed,
		first,
		sameName,
		running,
		queued,
	]);
	current.push(file());
	assert.deepEqual(snapshot, [first, sameName]);
});
const format = (
	name,
	fromSupported = true,
	toSupported = true,
	isNative = true,
) => ({ name, fromSupported, toSupported, isNative });
const converter = {
	name: "imagemagick",
	supportedFormats: [
		format(".png"),
		format(".heic", true, false),
		format(".out", false, true),
		format(".bridge", true, true, false),
		format(".other", true, true, false),
	],
};
const formatFile = (from, props = {}) => ({
	from,
	converters: [converter],
	isZip: () => false,
	isLarge: () => false,
	...props,
});
const candidates = converter.supportedFormats.map((f) => f.name);
test("format candidates enforce input/output direction and native conversion paths", () => {
	assert.deepEqual(outputFormats(formatFile(".out"), candidates), []);
	assert.deepEqual(outputFormats(formatFile(".heic"), candidates), [
		".png",
		".out",
		".bridge",
		".other",
	]);
	assert.deepEqual(outputFormats(formatFile(".bridge"), candidates), [
		".png",
		".out",
	]);
});
test("batch formats are the intersection and large local inputs have no runnable target", () => {
	assert.deepEqual(
		commonOutputFormats(
			[formatFile(".heic"), formatFile(".bridge")],
			candidates,
		),
		[".png", ".out"],
	);
	assert.deepEqual(
		outputFormats(formatFile(".heic", { isLarge: () => true }), candidates),
		[],
	);
	assert.deepEqual(commonOutputFormats([], candidates), []);
});
test("ZIP outputs follow converter direction, without exposing read-only formats", () => {
	assert.ok(
		!outputFormats(
			formatFile(".zip", { isZip: () => true }),
			candidates,
		).includes(".heic"),
	);
});
test("download snapshot retains actual bytes and extension through queue mutations", async () => {
	const original = new File(["source"], "同名.photo.png");
	const output = new File(["actual ZIP bytes"], "misleading.png");
	const source = { file: original, result: { file: output, to: "zip" } };
	const entries = [source];
	const snapshot = downloadSnapshot(entries);
	source.result = null;
	entries.splice(0, 1, {
		file: original,
		result: { file: new File(["new"], "new.webp"), to: ".webp" },
	});
	assert.equal(snapshot[0].input, output);
	assert.equal(snapshot[0].to, ".zip");
	assert.equal(await snapshot[0].input.text(), "actual ZIP bytes");
});
test("download names preserve original template tokens and literal dollar characters", () => {
	assert.equal(
		downloadName("Z8.Work_%name%_%extension%", "holiday.$&.png", ".avif"),
		"Z8.Work_holiday.$&_png.avif",
	);
	assert.equal(
		downloadName("Z8.Work_%name%", "Multi", ".zip"),
		"Z8.Work_Multi.zip",
	);
});

test("ZIP keeps all outputs when extensions converge or source names differ only in case", () => {
	const input = new File(["content"], "output.png");
	const entries = zipEntries(
		["photo.jpg", "PHOTO.webp", "photo (2).gif", "photo.png"].map(
			(originalName) => ({ originalName, to: ".png", input }),
		),
	);
	assert.equal(new Set(entries.map((e) => e.name.toLowerCase())).size, 4);
	assert.deepEqual(
		entries.map((e) => e.input),
		[input, input, input, input],
	);
});
