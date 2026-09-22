import { test } from "node:test";
import assert from "node:assert/strict";
import { connectQueue } from "../src/platform/queue-sync.ts";
import { parseSnapshot, parseOptions } from "../src/platform/queue-contract.ts";
const state = (revision) => ({
	schema: 2,
	epoch: "queue",
	revision,
	tasks: [],
	output: null,
	output_authorized: false,
	processing: false,
	clearing: false,
	closing: false,
	persistence_error: null,
	recovery_notice: null,
});
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((a, b) => {
		resolve = a;
		reject = b;
	});
	return { promise, resolve, reject };
}
test("subscribes before snapshot and catches a completion during the first read", async () => {
	let event;
	const first = deferred();
	let reads = 0;
	const observed = [];
	const connection = connectQueue(
		{
			subscribe: async (cb) => {
				event = cb;
				return () => {};
			},
			snapshot: async () => {
				assert.ok(event);
				return ++reads === 1 ? first.promise : state(2);
			},
		},
		(s) => observed.push(s.revision),
		(e) => {
			throw e;
		},
	);
	await new Promise((r) => setImmediate(r));
	event({ epoch: "queue", revision: 2 });
	first.resolve(state(1));
	await connection.ready;
	assert.deepEqual(observed, [1, 2]);
	connection.dispose();
});
test("late subscription is released after unmount", async () => {
	const subscription = deferred();
	let removed = 0;
	let reads = 0;
	const connection = connectQueue(
		{
			subscribe: () => subscription.promise,
			snapshot: async () => {
				reads++;
				return state(1);
			},
		},
		() => {},
		() => {},
	);
	connection.dispose();
	subscription.resolve(() => removed++);
	await connection.ready;
	assert.equal(removed, 1);
	assert.equal(reads, 0);
});
test("old snapshots cannot replace a newer task state", async () => {
	let revision = 5;
	const observed = [];
	const connection = connectQueue(
		{
			subscribe: async () => () => {},
			snapshot: async () => state(revision),
		},
		(s) => observed.push(s.revision),
		() => {},
	);
	await connection.ready;
	revision = 3;
	await connection.refresh();
	assert.deepEqual(observed, [5]);
	connection.dispose();
});
test("unmount while reading does not update the UI", async () => {
	const first = deferred();
	let applied = 0;
	const connection = connectQueue(
		{ subscribe: async () => () => {}, snapshot: () => first.promise },
		() => applied++,
		() => {},
	);
	await new Promise((r) => setImmediate(r));
	connection.dispose();
	first.resolve(state(1));
	await connection.ready;
	assert.equal(applied, 0);
});
test("a failed request can recover on the next refresh", async () => {
	let broken = true;
	const errors = [];
	const observed = [];
	const connection = connectQueue(
		{
			subscribe: async () => () => {},
			snapshot: async () => {
				if (broken) throw new Error("offline");
				return state(4);
			},
		},
		(s) => observed.push(s.revision),
		(e) => errors.push(String(e)),
	);
	await assert.rejects(connection.ready, /offline/);
	broken = false;
	await connection.refresh();
	assert.deepEqual(observed, [4]);
	assert.equal(errors.length, 1);
	connection.dispose();
});
test("contract rejects incompatible schema, duplicate tasks and malformed results", () => {
	assert.throws(() => parseSnapshot({ ...state(1), schema: 99 }));
	const task = {
		id: "one",
		options: { quality: "balanced", keep_metadata: false, pdf_dpi: 144 },
		name: "image.png",
		bytes: 12,
		formats: ["png"],
		format: "png",
		phase: "ready",
		attempt: 0,
		authorized: true,
		result: null,
		error: null,
	};
	assert.throws(() => parseSnapshot({ ...state(1), tasks: [task, task] }));
	assert.throws(() =>
		parseSnapshot({
			...state(1),
			tasks: [
				{ ...task, result: { path: "image.png", bytes: -1, note: "" } },
			],
		}),
	);
	assert.equal(
		parseSnapshot({ ...state(1), tasks: [task] }).tasks[0].name,
		"image.png",
	);
});
test("reads the same contract fixture as Rust", async () => {
	const { readFile } = await import("node:fs/promises");
	const fixture = JSON.parse(
		await readFile(
			new URL("./fixtures/queue-snapshot.json", import.meta.url),
			"utf8",
		),
	);
	assert.deepEqual(parseSnapshot(fixture), fixture);
});

test("conversion settings reject unsupported DPI and unknown quality", () => {
	const options = { quality: "balanced", keep_metadata: false, pdf_dpi: 144 };
	assert.deepEqual(parseOptions(options), options);
	for (const invalid of [
		{ ...options, pdf_dpi: 600 },
		{ ...options, pdf_dpi: "144" },
		{ ...options, quality: "lossless" },
		{ ...options, keep_metadata: "false" },
	])
		assert.throws(() => parseOptions(invalid));
});
test("partial page contract rejects duplicate and out-of-range pages", async () => {
	const { readFile } = await import("node:fs/promises");
	const fixture = JSON.parse(
		await readFile(
			new URL("./fixtures/queue-snapshot.json", import.meta.url),
			"utf8",
		),
	);
	const task = fixture.tasks[0];
	task.phase = "partial";
	task.result.total = 3;
	task.result.complete = false;
	task.result.files = [
		{
			path: "/example/page1.png",
			bytes: 80,
			page: 1,
			sha256: "a".repeat(64),
		},
	];
	assert.equal(parseSnapshot(fixture).tasks[0].result.files.length, 1);
	task.result.files.push({ ...task.result.files[0] });
	assert.throws(() => parseSnapshot(fixture));
	task.result.files = [{ ...task.result.files[0], page: 4 }];
	assert.throws(() => parseSnapshot(fixture));
});

test("import reports are bounded and optional for older queue snapshots", () => {
	assert.doesNotThrow(() => parseSnapshot(state(1)));
	const report = {
		id: "report-one",
		accepted: 1,
		issues: [{ name: "notes.xyz", reason: "unsupported" }],
	};
	assert.equal(
		parseSnapshot({ ...state(2), import_report: report }).import_report,
		report,
	);
	for (const bad of [
		{ ...report, accepted: -1 },
		{ ...report, accepted: 100 },
		{ ...report, accepted: 0, issues: [] },
		{ ...report, id: "" },
		{ ...report, issues: Array(101).fill(report.issues[0]) },
		{ ...report, issues: [{ name: "file", reason: "unknown" }] },
		{
			...report,
			issues: [{ name: "x".repeat(513), reason: "unreadable" }],
		},
	])
		assert.throws(() => parseSnapshot({ ...state(2), import_report: bad }));
});
