import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		source: { type: "string" },
		tools: { type: "string" },
		output: { type: "string" },
	},
});
assert.ok(
	values.source && values.tools && values.output,
	"--source, --tools and --output are required",
);
const source = resolve(values.source),
	toolDir = resolve(values.tools),
	output = resolve(values.output);
const lock = JSON.parse(
	await readFile("packaging/desktop-web/mupdf-tools/package.json", "utf8"),
);
for (const [name, version] of Object.entries(lock.dependencies)) {
	const installed = JSON.parse(
		await readFile(
			resolve(toolDir, "node_modules", name, "package.json"),
			"utf8",
		),
	);
	assert.equal(
		installed.version,
		version,
		`${name} differs from pinned tool version`,
	);
}
await mkdir(output);
function run(args) {
	const result = spawnSync(process.execPath, args, {
		encoding: "utf8",
		timeout: 120000,
		maxBuffer: 8 * 1024 * 1024,
	});
	process.stdout.write(result.stdout ?? "");
	process.stderr.write(result.stderr ?? "");
	assert.equal(
		result.status,
		0,
		result.error?.message || "JavaScript reconstruction failed",
	);
}
run([
	resolve(toolDir, "node_modules/typescript/bin/tsc"),
	"-p",
	source,
	"--outDir",
	output,
	"--typeRoots",
	resolve(toolDir, "node_modules/@types"),
	"--types",
	"node",
]);
const wrapper = resolve(output, "mupdf.js");
// Same whitespace normalization as upstream tools/build.sh.
await writeFile(
	wrapper,
	(await readFile(wrapper, "utf8")).replaceAll("    ", "\t"),
);
run([
	resolve(toolDir, "node_modules/terser/bin/terser"),
	"--module",
	"-c",
	"-m",
	"-o",
	resolve(output, "mupdf-wasm.js"),
	resolve(source, "dist/mupdf-wasm.js"),
]);
for (const file of ["mupdf-wasm.wasm", "mupdf-wasm.d.ts"])
	await copyFile(resolve(source, "dist", file), resolve(output, file));
await writeFile(resolve(output, "package.json"), '{"type":"module"}\n');
const hashes = Object.fromEntries(
	await Promise.all(
		["mupdf.js", "mupdf-wasm.js", "mupdf-wasm.wasm"].map(async (file) => [
			file,
			createHash("sha256")
				.update(await readFile(resolve(output, file)))
				.digest("hex"),
		]),
	),
);
await writeFile(
	resolve(output, "rebuild.json"),
	JSON.stringify({ tools: lock.dependencies, hashes }, null, 2) + "\n",
);
console.log(JSON.stringify(hashes));
