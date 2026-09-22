// Compare existing and rebuilt ICNS parser behavior without replacing application assets.
// Node currently needs --experimental-wasm-modules for the upstream bundler wrapper.
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({
	options: { rebuilt: { type: "string" }, output: { type: "string" } },
});
if (!values.rebuilt || !values.output)
	throw Error(
		"Use --rebuilt BUNDLER_OUTPUT_DIRECTORY --output NEW_REPORT.json",
	);
const original = await import(
	pathToFileURL(resolve("node_modules/vert-wasm/vert_wasm.js"))
);
const rebuilt = await import(
	pathToFileURL(join(resolve(values.rebuilt), "vert_wasm.js"))
);
assert.equal(typeof original.parseIcns, "function");
assert.equal(typeof rebuilt.parseIcns, "function");
const icns = (...chunks) => {
	const head = Buffer.alloc(8);
	head.write("icns");
	head.writeUInt32BE(8 + chunks.reduce((n, b) => n + b.length + 8, 0), 4);
	return Buffer.concat([
		head,
		...chunks.flatMap((bytes, index) => {
			const entry = Buffer.alloc(8);
			entry.write(index % 2 ? "icp5" : "icp4");
			entry.writeUInt32BE(bytes.length + 8, 4);
			return [entry, bytes];
		}),
	]);
};
const actual = await readFile("src-tauri/icons/icon.icns");
const cases = [
	["application icon", actual, true],
	["empty family", icns(), true],
	["one element", icns(Buffer.from([1, 2, 3, 4])), true],
	[
		"multiple elements",
		icns(Buffer.alloc(32, 42), Buffer.alloc(128, 7)),
		true,
	],
	["large element", icns(Buffer.alloc(1024 * 1024, 31)), true],
	["empty bytes", Buffer.alloc(0), false],
	["truncated header", actual.subarray(0, 7), false],
	["truncated payload", actual.subarray(0, actual.length - 1), false],
	["wrong signature", Buffer.from("NOT_ICNS"), false],
];
const run = (module, bytes) => {
	try {
		return {
			ok: true,
			elements: module
				.parseIcns(new Uint8Array(bytes))
				.map((b) => ({ bytes: b.length, sha256: sha256(b) })),
		};
	} catch (error) {
		return { ok: false, error: String(error) };
	}
};
const checks = cases.map(([name, bytes, success]) => {
	const a = run(original, bytes),
		b = run(rebuilt, bytes);
	assert.equal(a.ok, success, name);
	assert.deepEqual(b, a, name);
	return { name, inputSha256: sha256(bytes), result: a };
});
const a = sha256(await readFile("node_modules/vert-wasm/vert_wasm_bg.wasm"));
const b = sha256(await readFile(join(values.rebuilt, "vert_wasm_bg.wasm")));
const report = {
	schema: 1,
	status: "passed",
	scope: "ICNS parser differential samples only",
	originalWasmSha256: a,
	rebuiltWasmSha256: b,
	byteIdentical: a === b,
	checks,
};
await writeFile(values.output, JSON.stringify(report, null, 2) + "\n", {
	flag: "wx",
});
console.log(
	JSON.stringify({
		status: report.status,
		cases: checks.length,
		byteIdentical: report.byteIdentical,
	}),
);
