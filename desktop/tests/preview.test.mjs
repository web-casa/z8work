import test from "node:test";
import assert from "node:assert/strict";
import {
	createPreview,
	previewBytes,
	previewable,
	previewKind,
} from "../src/platform/preview.ts";
function png(width = 256, height = 128) {
	const b = new ArrayBuffer(33),
		a = new Uint8Array(b);
	a.set([137, 80, 78, 71, 13, 10, 26, 10]);
	a.set([73, 72, 68, 82], 12);
	new DataView(b).setUint32(16, width);
	new DataView(b).setUint32(20, height);
	return b;
}
test("preview contract bounds payload, dimensions and explicit preview routes", () => {
	assert.ok(previewBytes(png()));
	for (const v of [
		png(0),
		png(257),
		png(256, 257),
		new ArrayBuffer(524289),
		new ArrayBuffer(10),
		"data:image/svg+xml,",
		[1, 2],
	])
		assert.throws(() => previewBytes(v));
	assert.equal(previewable("PIC.HEIC", 33554432), true);
	for (const name of ["file.svg", "file.png.exe", "file.m3u8"])
		assert.equal(previewable(name, 10), false);
	assert.equal(previewable("file.png", 33554433), false);
});
test("only one preview URL is retained and every switch or dispose releases it", async () => {
	const revoked = [],
		updates = [];
	let n = 0;
	const p = createPreview(
		async () => png(),
		(s) => updates.push(s),
		{ create: () => `blob:${++n}`, revoke: (u) => revoked.push(u) },
	);
	await p.open("one");
	await p.open("two");
	assert.deepEqual(revoked, ["blob:1"]);
	p.dispose();
	assert.deepEqual(revoked, ["blob:1", "blob:2"]);
	const length = updates.length;
	await p.open("three");
	assert.equal(updates.length, length);
});
test("removal and disposal suppress late responses without creating a blob URL", async () => {
	for (const method of ["clear", "dispose"]) {
		let resolve;
		let created = 0;
		const p = createPreview(
			() => new Promise((r) => (resolve = r)),
			() => {},
			{
				create: () => {
					created++;
					return "blob:test";
				},
				revoke: () => {},
			},
		);
		const pending = p.open("one");
		p[method]();
		resolve(png());
		await pending;
		assert.equal(created, 0);
	}
});
test("duplicate preview starts do not allocate parallel native work; failure can retry", async () => {
	let reject,
		calls = 0,
		state;
	const p = createPreview(
		() => {
			calls++;
			return new Promise((_, r) => (reject = r));
		},
		(s) => (state = s),
	);
	const pending = p.open("one");
	await p.open("two");
	assert.equal(calls, 1);
	reject(new Error("failed"));
	await pending;
	assert.equal(state.busy, false);
	assert.match(state.error, /failed/);
	const retry = p.open("one");
	reject(new Error("retry"));
	await retry;
	assert.equal(calls, 2);
});

test("PDF first-page previews share the image byte budget", () => {
	assert.equal(previewable("document.PDF", 33554432), true);
	assert.equal(previewable("document.pdf", 33554433), false);
	assert.equal(previewable("document.pdf.exe", 10), false);
});

test("media previews classify frames and covers without admitting playlists or invalid sizes", () => {
	for (const ext of ["MP4", "mov", "mkv", "webm"]) {
		assert.equal(previewKind(`file.${ext}`), "video");
		assert.equal(previewable(`file.${ext}`, 33554432), true);
	}
	for (const ext of ["mp3", "wav", "flac", "ogg", "m4a", "opus"]) {
		assert.equal(previewKind(`file.${ext}`), "audio");
		assert.equal(previewable(`file.${ext}`, 33554433), false);
	}
	for (const name of ["list.m3u8", "file.mp4.exe", "file.docx", "file.svg"])
		assert.equal(previewKind(name), undefined);
	for (const size of [-1, NaN, Infinity])
		assert.equal(previewable("file.mp4", size), false);
});
