import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, copyFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		wasm: { type: "string" },
		output: { type: "string" },
		"wrapper-dir": { type: "string" },
	},
});
assert.ok(values.wasm && values.output, "--wasm and --output are required");
const output = resolve(values.output);
await mkdir(output); // Refuse to overwrite existing evidence.
const runtime = resolve(output, "runtime");
await mkdir(runtime);
const installed = dirname(fileURLToPath(import.meta.resolve("mupdf")));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const original = await readFile(resolve(installed, "mupdf-wasm.wasm"));
const lock = JSON.parse(
	await readFile("packaging/desktop-web/mupdf-source-build.json", "utf8"),
);
assert.equal(
	hash(original),
	lock.expectedWasmSha256,
	"Installed WASM differs from the reviewed source lock",
);
const candidate = await readFile(values.wasm);
const module = await WebAssembly.compile(candidate);
const originalModule = await WebAssembly.compile(original);
const wrappers = values["wrapper-dir"]
	? resolve(values["wrapper-dir"])
	: installed;
const wrapperComparison = {};
for (const file of ["mupdf.js", "mupdf-wasm.js"]) {
	const bytes = await readFile(resolve(wrappers, file));
	wrapperComparison[file] = bytes.equals(
		await readFile(resolve(installed, file)),
	);
	await copyFile(resolve(wrappers, file), resolve(runtime, file));
}
await writeFile(resolve(runtime, "mupdf-wasm.wasm"), candidate);
await writeFile(resolve(runtime, "package.json"), '{"type":"module"}\n');
const runs = [];
for (const name of ["original", "rebuilt"]) {
	const env = { ...process.env };
	delete env.Z8_MUPDF_CANDIDATE_DIR;
	if (name === "rebuilt") env.Z8_MUPDF_CANDIDATE_DIR = runtime;
	const result = spawnSync(
		process.execPath,
		[
			"--test",
			"tests/pdf-images.test.mjs",
			"tests/pdf-image-formats.test.mjs",
		],
		{ env, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
	);
	await writeFile(
		resolve(output, `${name}-tests.log`),
		result.stdout + result.stderr,
	);
	runs.push({
		name,
		exitCode: result.status,
		signal: result.signal,
		error: result.error?.message ?? null,
		passed: result.status === 0,
	});
}
const importsMatch =
	JSON.stringify(WebAssembly.Module.imports(module)) ===
	JSON.stringify(WebAssembly.Module.imports(originalModule));
const exportsMatch =
	JSON.stringify(WebAssembly.Module.exports(module)) ===
	JSON.stringify(WebAssembly.Module.exports(originalModule));
const report = {
	schema: 1,
	originalSha256: hash(original),
	rebuiltSha256: hash(candidate),
	byteIdentical: original.equals(candidate),
	importsMatch,
	exportsMatch,
	wrapper: values["wrapper-dir"]
		? "rebuilt JavaScript candidate"
		: "installed npm JavaScript; not rebuilt by this command",
	wrapperByteComparison: wrapperComparison,
	wrapperHashes: Object.fromEntries(
		await Promise.all(
			["mupdf.js", "mupdf-wasm.js"].map(async (file) => [
				file,
				hash(await readFile(resolve(runtime, file))),
			]),
		),
	),
	tests: runs,
	status:
		original.equals(candidate) &&
		importsMatch &&
		exportsMatch &&
		runs.every((run) => run.passed) &&
		Object.values(wrapperComparison).every(Boolean)
			? "passed"
			: "failed",
	releaseReady: false,
};
await writeFile(
	resolve(output, "comparison.json"),
	JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
assert.equal(
	report.status,
	"passed",
	"Reconstruction or runtime comparison failed; see saved report",
);
