// Reuse an exact candidate that already passed native validation; no mutable labels.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileInfo } from "./lib/desktop-sources.mjs";
import { verifyHandoff } from "./lib/desktop-windows-acceptance.mjs";
const [handoffArg, reportArg] = process.argv.slice(2);
if (!handoffArg || !reportArg)
	throw new Error("Expected handoff and native report directories");
const handoff = resolve(handoffArg),
	root = resolve(reportArg);
await verifyHandoff(handoff);
const report = JSON.parse(await readFile(join(root, "report.json"), "utf8"));
if (
	report.scope !== "windows-native-validation" ||
	report.status !== "passed" ||
	report.execution !== "native" ||
	report.host?.os !== "win32" ||
	report.host?.arch !== "x64"
)
	throw new Error("Expected successful native Windows validation");
for (const key of [
	"integrity",
	"buildInfo",
	"webview2",
	"lifecycle",
	"conversions",
	"nativeExecution",
])
	if (report.checks[key] !== "passed")
		throw new Error(`Missing native check: ${key}`);
const equal = (a, b) => a?.sha256 === b?.sha256 && a?.bytes === b?.bytes;
if (!equal(await fileInfo(handoff, "handoff.json"), report.handoff))
	throw new Error("Native report belongs to a different candidate");
for (const [name, expected] of Object.entries(report.references))
	if (!equal(await fileInfo(root, name), expected))
		throw new Error(`Changed native evidence: ${name}`);
console.log(
	"Exact handoff and all referenced native validation evidence verified",
);
