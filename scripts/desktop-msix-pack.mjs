// Finite development packaging. Never signs, installs or publishes.
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fileInfo, listFiles } from "./lib/desktop-sources.mjs";
import { assertOutside } from "./lib/desktop-windows-acceptance.mjs";
import { verifyMsixLayout } from "./lib/desktop-msix.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["prepared", "tool", "kind", "python", "output"].map((k) => [
			k,
			{ type: "string" },
		]),
	),
});
if (
	!values.prepared ||
	!values.tool ||
	!values.output ||
	!["makemsix", "makeappx"].includes(values.kind)
)
	throw new Error(
		"Use --prepared DIRECTORY --tool ABSOLUTE_TOOL --kind makemsix|makeappx --output NEW_DIRECTORY [--python EXECUTABLE]",
	);
if (values.kind === "makeappx" && process.platform !== "win32")
	throw new Error("MakeAppx execution requires a Windows host");
const preparedRoot = resolve(values.prepared),
	output = resolve(values.output),
	tool = resolve(values.tool),
	layout = join(preparedRoot, "layout");
await assertOutside(preparedRoot, output);
await mkdir(output);
const report = {
	schema: 1,
	scope: "development-msix-package",
	status: "failed",
	acceptance: "incomplete",
	redistributionApproved: false,
	storeSubmissionAllowed: false,
	checks: {
		layout: "not-run",
		package: "not-run",
		blockmap: "not-run",
		unpack: "not-run",
		installation: "not-run",
		webview2: "not-run",
		licenses: "not-run",
	},
	tool: { kind: values.kind },
};
const controller = new AbortController(),
	stop = () => controller.abort();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const run = async (binary, args, timeout = 300000) =>
	promisify(execFile)(binary, args, {
		cwd: output,
		timeout,
		maxBuffer: 2 * 1024 ** 2,
		encoding: "utf8",
		windowsHide: true,
		signal: controller.signal,
	});
try {
	await fileInfo(preparedRoot, "prepared.json", 2 * 1024 ** 2);
	const preparedBytes = await readFile(join(preparedRoot, "prepared.json"));
	const prepared = JSON.parse(preparedBytes);
	await verifyMsixLayout(layout, prepared);
	report.checks.layout = "passed";
	report.tool.binary = await fileInfo(dirname(tool), basename(tool));
	await copyFile(
		join(preparedRoot, "prepared.json"),
		join(output, "prepared.json"),
	);
	const artifact = join(output, "z8-work-development.msix");
	const packed = await run(
		tool,
		values.kind === "makemsix"
			? ["pack", "-d", layout, "-p", artifact]
			: ["pack", "/d", layout, "/p", artifact],
	);
	await writeFile(join(output, "pack.log"), packed.stdout + packed.stderr, {
		flag: "wx",
	});
	report.artifact = await fileInfo(output, "z8-work-development.msix");
	report.checks.package = "passed";
	const checked = await run(values.python ?? "python3", [
		fileURLToPath(new URL("./desktop-msix-check.py", import.meta.url)),
		"--package",
		artifact,
		"--prepared",
		join(output, "prepared.json"),
		"--output",
		join(output, "archive-check.json"),
	]);
	await writeFile(
		join(output, "archive-check.log"),
		checked.stdout + checked.stderr,
		{ flag: "wx" },
	);
	const archiveCheck = JSON.parse(
		await readFile(join(output, "archive-check.json"), "utf8"),
	);
	if (
		archiveCheck.status !== "passed" ||
		archiveCheck.sha256 !== report.artifact.sha256
	)
		throw new Error("Archive report does not match package");
	report.checks.blockmap = "passed";
	const unpacked = join(output, "unpacked");
	const unpack = await run(
		tool,
		values.kind === "makemsix"
			? ["unpack", "-p", artifact, "-d", unpacked, "-ss"]
			: ["unpack", "/p", artifact, "/d", unpacked],
	);
	await writeFile(join(output, "unpack.log"), unpack.stdout + unpack.stderr, {
		flag: "wx",
	});
	// SDKs may retain or omit the two container metadata files when extracting.
	const extractedNames = (await listFiles(unpacked)).filter(
		(name) => !["AppxBlockMap.xml", "[Content_Types].xml"].includes(name),
	);
	if (
		JSON.stringify(extractedNames) !==
		JSON.stringify(Object.keys(prepared.files).sort())
	)
		throw new Error("Unpacked package membership mismatch");
	for (const [name, expected] of Object.entries(prepared.files))
		if (
			JSON.stringify(await fileInfo(unpacked, name)) !==
			JSON.stringify(expected)
		)
			throw new Error(`Unpacked bytes differ: ${name}`);
	report.checks.unpack = "passed";
	await verifyMsixLayout(layout, prepared);
	if (
		!(await readFile(join(preparedRoot, "prepared.json"))).equals(
			preparedBytes,
		) ||
		JSON.stringify(await fileInfo(output, "z8-work-development.msix")) !==
			JSON.stringify(report.artifact) ||
		JSON.stringify(await fileInfo(dirname(tool), basename(tool))) !==
			JSON.stringify(report.tool.binary)
	)
		throw new Error("Inputs or final package changed during validation");
	report.status = "passed";
} catch (error) {
	report.error = error.message;
	if (error.stdout || error.stderr)
		await writeFile(
			join(output, "failure.log"),
			(error.stdout ?? "") + (error.stderr ?? ""),
			{ flag: "wx" },
		);
	process.exitCode = 1;
} finally {
	process.off("SIGINT", stop);
	process.off("SIGTERM", stop);
	await writeFile(
		join(output, "report.json"),
		JSON.stringify(report, null, 2) + "\n",
		{ flag: "wx" },
	);
	console.log(JSON.stringify(report));
}
