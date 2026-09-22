import { parseArgs } from "node:util";
import { resolve } from "node:path";
import {
	assembleWindowsBundle,
	readWindowsLock,
} from "./lib/desktop-windows-bundle.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["archives", "output", "verifier", "extracted", "notices"].map(
			(name) => [name, { type: "string" }],
		),
	),
});
for (const key of ["archives", "output", "verifier"])
	if (!values[key]) throw new Error(`--${key} required`);
const result = await assembleWindowsBundle({
	lock: await readWindowsLock(),
	...Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key, resolve(value)]),
	),
});
console.log(
	JSON.stringify({
		status: "assembled-static-checks-passed",
		manifest: result.manifestInfo,
		files: Object.keys(result.manifest.files).length,
		redistributionApproved: false,
	}),
);
