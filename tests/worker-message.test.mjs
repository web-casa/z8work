import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
	new URL("../src/lib/util/worker-message.ts", import.meta.url),
	"utf8",
);
const { outputText } = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.ESNext,
		target: ts.ScriptTarget.ES2022,
	},
});
const { waitForWorkerMessage } = await import(
	`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

class TestWorker extends EventTarget {
	listeners = new Set();
	addEventListener(type, fn, options) {
		this.listeners.add(fn);
		super.addEventListener(type, fn, options);
	}
	removeEventListener(type, fn, options) {
		this.listeners.delete(fn);
		super.removeEventListener(type, fn, options);
	}
	message(data) {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}
}

test("cancelling a message wait settles the promise and releases its listeners", async () => {
	const worker = new TestWorker(),
		controller = new AbortController();
	const result = waitForWorkerMessage(worker, undefined, controller.signal);
	const rejected = assert.rejects(result, { name: "AbortError" });
	controller.abort();
	await rejected;
	assert.equal(worker.listeners.size, 0);
});

test("an already cancelled operation installs no listeners", async () => {
	const worker = new TestWorker(),
		controller = new AbortController();
	controller.abort();
	await assert.rejects(
		waitForWorkerMessage(worker, "loaded", controller.signal),
		{ name: "AbortError" },
	);
	assert.equal(worker.listeners.size, 0);
});

test("ready messages do not incorrectly satisfy a loaded wait", async () => {
	const worker = new TestWorker();
	let completed = false;
	const result = waitForWorkerMessage(worker, "loaded").then((value) => {
		completed = true;
		return value;
	});
	worker.message({ type: "ready" });
	await Promise.resolve();
	assert.equal(completed, false);
	worker.message({ type: "loaded", id: "file-1" });
	assert.deepEqual(await result, { type: "loaded", id: "file-1" });
	assert.equal(worker.listeners.size, 0);
});

test("initialization errors reject instead of leaving a conversion queued", async () => {
	const worker = new TestWorker();
	const result = waitForWorkerMessage(worker, "loaded");
	worker.message({ type: "error", error: "WASM unavailable" });
	await assert.rejects(result, /WASM unavailable/);
	assert.equal(worker.listeners.size, 0);
});

test("conversion error responses retain converter-specific error details", async () => {
	const worker = new TestWorker(),
		response = {
			type: "error",
			error: "Bad document",
			errorKind: "PandocParseError",
		};
	const result = waitForWorkerMessage(worker);
	worker.message(response);
	assert.deepEqual(await result, response);
	assert.equal(worker.listeners.size, 0);
});

test("worker crashes and unreadable messages reject and clean up", async () => {
	for (const event of [
		Object.assign(new Event("error"), { message: "Worker crashed" }),
		new Event("messageerror"),
	]) {
		const worker = new TestWorker(),
			result = waitForWorkerMessage(worker);
		worker.dispatchEvent(event);
		await assert.rejects(result);
		assert.equal(worker.listeners.size, 0);
	}
});

test("initialization timeout releases listeners", async () => {
	const worker = new TestWorker();
	await assert.rejects(
		waitForWorkerMessage(worker, "loaded", undefined, 5),
		/timeout/,
	);
	assert.equal(worker.listeners.size, 0);
});

test("a cancelled wait cannot consume responses for the next attempt", async () => {
	const worker = new TestWorker(),
		controller = new AbortController();
	const first = waitForWorkerMessage(worker, undefined, controller.signal);
	const cancelled = assert.rejects(first);
	controller.abort();
	await cancelled;
	const second = waitForWorkerMessage(worker);
	const response = { type: "finished", output: new Uint8Array([1, 2]) };
	worker.message(response);
	assert.deepEqual(await second, response);
	assert.equal(worker.listeners.size, 0);
});

test("phase messages do not complete a conversion or stop its deadline", async () => {
	const worker = new TestWorker();
	const promise = waitForWorkerMessage(worker, "finished", undefined, 10);
	const rejected = assert.rejects(promise, { name: "WorkerTimeoutError" });
	worker.message({ type: "phase", phase: "decoding" });
	worker.message({ type: "phase", phase: "encoding" });
	await rejected;
	assert.equal(worker.listeners.size, 0);
});
test("finished conversion messages settle after intermediate phases", async () => {
	const worker = new TestWorker();
	const promise = waitForWorkerMessage(worker, "finished", undefined, 100);
	worker.message({ type: "phase", phase: "decoding" });
	worker.message({ type: "finished", output: new Uint8Array([1, 2]) });
	assert.deepEqual((await promise).output, new Uint8Array([1, 2]));
	assert.equal(worker.listeners.size, 0);
});
