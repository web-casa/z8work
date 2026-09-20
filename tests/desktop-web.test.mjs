import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the real save transport with a fake native endpoint, including cleanup.
const source = await readFile("src/lib/util/desktop.ts", "utf8");
const stub =
	"data:text/javascript," +
	encodeURIComponent(
		"export const invoke = (...args) => globalThis.__desktopInvoke(...args)",
	);
const windowStub =
	"data:text/javascript," +
	encodeURIComponent(
		"export const getCurrentWindow = () => ({ onCloseRequested: (fn) => { globalThis.__closeHandler = fn; return () => {}; } })",
	);
const js = ts
	.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ES2022,
		},
	})
	.outputText.replaceAll('"@tauri-apps/api/core"', JSON.stringify(stub))
	.replaceAll('"@tauri-apps/api/window"', JSON.stringify(windowStub));
const { saveDesktopBlob, isDesktop, guardDesktopClose } = await import(
	"data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

test("web environment is not desktop", () => assert.equal(isDesktop(), false));
test("save sends bounded binary chunks and commits only at the end", async () => {
	const calls = [];
	globalThis.__desktopInvoke = async (...args) => {
		calls.push(args);
		return args[0] === "begin_save" ? "authorized-token" : undefined;
	};
	const blob = new Blob([new Uint8Array(2 * 1024 * 1024 + 7).fill(42)]);
	assert.equal(await saveDesktopBlob(blob, "中文.txt"), true);
	assert.deepEqual(
		calls.map((c) => c[0]),
		[
			"begin_save",
			"append_save",
			"append_save",
			"append_save",
			"finish_save",
		],
	);
	assert.deepEqual(
		calls.slice(1, 4).map((c) => c[1].byteLength),
		[1048576, 1048576, 7],
	);
	for (const call of calls.slice(1, 4))
		assert.equal(call[2].headers["x-save-token"], "authorized-token");
});
test("cancelled save opens no writer", async () => {
	const calls = [];
	globalThis.__desktopInvoke = async (command) => {
		calls.push(command);
		return null;
	};
	assert.equal(await saveDesktopBlob(new Blob(["result"]), "a.txt"), false);
	assert.deepEqual(calls, ["begin_save"]);
});
test("write failure aborts and preserves the result for retry", async () => {
	const calls = [];
	globalThis.__desktopInvoke = async (command) => {
		calls.push(command);
		if (command === "begin_save") return "token";
		if (command === "append_save") throw new Error("Disk full");
	};
	const blob = new Blob(["result"]);
	await assert.rejects(saveDesktopBlob(blob, "a.txt"), /Disk full/);
	assert.deepEqual(calls, ["begin_save", "append_save", "abort_save"]);
	assert.equal(await blob.text(), "result");
});
test("commit failure also releases native temporary output", async () => {
	const calls = [];
	globalThis.__desktopInvoke = async (command) => {
		calls.push(command);
		if (command === "begin_save") return "token";
		if (command === "finish_save") throw new Error("Permission denied");
	};
	await assert.rejects(
		saveDesktopBlob(new Blob(["result"]), "a.txt"),
		/Permission denied/,
	);
	assert.equal(calls.at(-1), "abort_save");
});

test("concurrent clicks cannot open multiple save dialogs", async () => {
	let release;
	globalThis.__desktopInvoke = (command) =>
		command === "begin_save"
			? new Promise((resolve) => {
					release = resolve;
				})
			: Promise.resolve();
	const first = saveDesktopBlob(new Blob(["result"]), "a.txt");
	await new Promise((resolve) => setImmediate(resolve));
	await assert.rejects(
		saveDesktopBlob(new Blob(["other"]), "b.txt"),
		/already in progress/,
	);
	release(null);
	assert.equal(await first, false);
	globalThis.__desktopInvoke = async () => null;
	assert.equal(await saveDesktopBlob(new Blob(["retry"]), "a.txt"), false);
});

test("all close requests wait for confirmation, cancellation permits retry", async () => {
	const calls = [];
	let answer = false;
	globalThis.__desktopInvoke = async (command) => {
		calls.push(command);
		return command === "confirm_close" ? answer : undefined;
	};
	await guardDesktopClose(() => true);
	let prevented = 0;
	const event = { preventDefault: () => prevented++ };
	await globalThis.__closeHandler(event);
	assert.deepEqual(calls, ["confirm_close"]);
	answer = true;
	await globalThis.__closeHandler(event);
	assert.deepEqual(calls, ["confirm_close", "confirm_close", "finish_close"]);
	assert.equal(prevented, 2);
});

test("empty queue approves app exit without prompting; repeated requests share a prompt", async () => {
	const calls = [];
	let resolve;
	globalThis.__desktopInvoke = async (command) => {
		calls.push(command);
		if (command === "confirm_close")
			return new Promise((r) => {
				resolve = r;
			});
	};
	await guardDesktopClose(() => false);
	const event = { preventDefault() {} };
	await globalThis.__closeHandler(event);
	assert.deepEqual(calls, ["finish_close"]);
	calls.length = 0;
	await guardDesktopClose(() => true);
	const first = globalThis.__closeHandler(event);
	await globalThis.__closeHandler(event);
	assert.deepEqual(calls, ["confirm_close"]);
	resolve(true);
	await first;
	assert.deepEqual(calls, ["confirm_close", "finish_close"]);
});
