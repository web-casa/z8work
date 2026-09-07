import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const { outputText } = ts.transpileModule(
	await readFile(
		new URL("../src/lib/util/engine-resource.ts", import.meta.url),
		"utf8",
	),
	{
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ES2022,
		},
	},
);
const { createEngineResource, fetchEngine } = await import(
	`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("engine downloads are lazy, shared and reused after completion", async () => {
	let calls = 0,
		finish;
	const bytes = new ArrayBuffer(8);
	const resource = createEngineResource(() => {
		calls++;
		return new Promise((resolve) => {
			finish = resolve;
		});
	});
	assert.equal(calls, 0);
	const first = resource.load(new AbortController().signal);
	const second = resource.load(new AbortController().signal);
	await Promise.resolve();
	assert.equal(calls, 1);
	finish(bytes);
	assert.equal(await first, bytes);
	assert.equal(await second, bytes);
	assert.equal(await resource.load(new AbortController().signal), bytes);
	assert.equal(calls, 1);
});

test("cancelling one consumer leaves the other conversion's engine download running", async () => {
	let finish, downloadSignal;
	const resource = createEngineResource((signal) => {
		downloadSignal = signal;
		return new Promise((resolve) => {
			finish = resolve;
		});
	});
	const controller = new AbortController();
	const first = resource.load(controller.signal);
	const rejected = assert.rejects(first, { name: "AbortError" });
	const second = resource.load(new AbortController().signal);
	await Promise.resolve();
	controller.abort();
	await rejected;
	assert.equal(downloadSignal.aborted, false);
	finish(new ArrayBuffer(8));
	await second;
});

test("last cancellation aborts the request and a later conversion starts a fresh download", async () => {
	let calls = 0,
		downloadSignal;
	const resource = createEngineResource((signal) => {
		calls++;
		downloadSignal = signal;
		if (calls === 2) return Promise.resolve(new ArrayBuffer(8));
		return new Promise((resolve, reject) =>
			signal.addEventListener("abort", () => reject(signal.reason), {
				once: true,
			}),
		);
	});
	const controller = new AbortController();
	const result = resource.load(controller.signal);
	const rejected = assert.rejects(result, { name: "AbortError" });
	await Promise.resolve();
	controller.abort();
	await rejected;
	assert.equal(downloadSignal.aborted, true);
	assert.equal(
		(await resource.load(new AbortController().signal)).byteLength,
		8,
	);
	assert.equal(calls, 2);
});

test("failed downloads can be retried and pre-cancelled consumers do not fetch", async () => {
	let calls = 0;
	const resource = createEngineResource(async () => {
		if (++calls === 1) throw new Error("offline");
		return new ArrayBuffer(8);
	});
	const cancelled = new AbortController();
	cancelled.abort();
	await assert.rejects(resource.load(cancelled.signal), {
		name: "AbortError",
	});
	assert.equal(calls, 0);
	await assert.rejects(
		resource.load(new AbortController().signal),
		/offline/,
	);
	assert.equal(
		(await resource.load(new AbortController().signal)).byteLength,
		8,
	);
});

test("engine network deadline aborts a stalled download", async () => {
	const resource = createEngineResource(
		(signal) =>
			new Promise((resolve, reject) =>
				signal.addEventListener("abort", () => reject(signal.reason), {
					once: true,
				}),
			),
		10,
	);
	await assert.rejects(
		resource.load(new AbortController().signal),
		/timed out/,
	);
});

test("engine fetch rejects HTTP errors and HTML fallback responses", async (t) => {
	const original = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = original;
	});
	globalThis.fetch = async () => new Response("no", { status: 404 });
	await assert.rejects(
		fetchEngine("/engine.wasm", new AbortController().signal),
		/HTTP 404/,
	);
	globalThis.fetch = async () => new Response("<!doctype html>");
	await assert.rejects(
		fetchEngine("/engine.wasm", new AbortController().signal),
		/not a WebAssembly/,
	);
	globalThis.fetch = async () =>
		new Response(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
	assert.equal(
		(await fetchEngine("/engine.wasm", new AbortController().signal))
			.byteLength,
		8,
	);
});
