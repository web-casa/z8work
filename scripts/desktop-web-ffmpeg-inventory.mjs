// Compare the exported core's codec/filter/format capabilities without changing assets.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
const { values } = parseArgs({
	options: {
		"core-dir": { type: "string" },
		output: { type: "string" },
		baseline: { type: "string" },
	},
});
if (!values["core-dir"] || !values.output)
	throw Error(
		"Use --core-dir DIRECTORY --output NEW_REPORT.json [--baseline REPORT.json]",
	);
globalThis.self = { location: { href: import.meta.url } };
const directory = resolve(values["core-dir"]);
const { default: create } = await import(
	pathToFileURL(join(directory, "ffmpeg-core.js"))
);
const wasm = await readFile(join(directory, "ffmpeg-core.wasm"));
const core = await create({ wasmBinary: wasm });
const capabilities = {};
let version;
for (const [name, pattern] of [
	["encoders", /^\s+[VAS][A-Z.]{5}\s+(\S+)\s/],
	["decoders", /^\s+[VAS][A-Z.]{5}\s+(\S+)\s/],
	["filters", /^\s+[TSC.]{3}\s+(\S+)\s/],
	["formats", /^\s*[D ][E ]\s+(\S+)\s/],
]) {
	const lines = [];
	core.setLogger(({ message }) => lines.push(message));
	core.setTimeout(30_000);
	assert.equal(core.exec("-" + name), 0, name);
	version ??= lines.find((line) => line.startsWith("ffmpeg version "));
	capabilities[name] = [
		...new Set(
			lines.flatMap((line) => {
				const match = pattern.exec(line);
				return match && match[1] !== "=" ? [match[1]] : [];
			}),
		),
	].sort();
	assert.ok(
		capabilities[name].length > 50,
		"Unexpectedly small " + name + " inventory",
	);
	core.reset();
}
const comparisons = [];
if (values.baseline) {
	const baseline = JSON.parse(await readFile(values.baseline, "utf8"));
	assert.equal(baseline.status, "passed");
	for (const [name, entries] of Object.entries(capabilities)) {
		assert.ok(
			Array.isArray(baseline.capabilities[name]),
			"Missing baseline " + name,
		);
		const missing = baseline.capabilities[name].filter(
			(entry) => !entries.includes(entry),
		);
		const added = entries.filter(
			(entry) => !baseline.capabilities[name].includes(entry),
		);
		comparisons.push({ name, missing, added });
	}
}
const report = {
	schema: 1,
	status: comparisons.some((check) => check.missing.length)
		? "failed"
		: "passed",
	wasmSha256: createHash("sha256").update(wasm).digest("hex"),
	version,
	capabilities,
	comparisons,
	scope: "advertised capabilities; conversion correctness is checked separately",
};
await writeFile(values.output, JSON.stringify(report, null, 2) + "\n", {
	flag: "wx",
});
console.log(
	JSON.stringify({
		status: report.status,
		counts: Object.fromEntries(
			Object.entries(capabilities).map(([name, entries]) => [
				name,
				entries.length,
			]),
		),
		comparisons,
	}),
);
assert.equal(
	report.status,
	"passed",
	"Candidate removed capabilities from baseline",
);
