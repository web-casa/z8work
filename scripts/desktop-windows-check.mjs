import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { machine } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inspectWindowsTree } from "./lib/desktop-windows.mjs";
import {
	artifactMatrix,
	sha256,
	validateBuild,
} from "./lib/desktop-artifacts.mjs";

const { values } = parseArgs({
	options: {
		root: { type: "string" },
		output: { type: "string" },
		runtime: { type: "boolean", default: false },
	},
});
if (!values.root || !values.output)
	throw new Error("--root and a new --output directory are required");
const root = resolve(values.root),
	output = resolve(values.output);
await mkdir(output); // Reports never overwrite earlier evidence.
const report = {
	schema: 1,
	scope: "windows-x64-application",
	status: "failed",
	host: {
		platform: process.platform,
		arch: process.arch,
		machine: machine(),
	},
	checks: {},
	acceptance: "incomplete",
	redistributionApproved: false,
	limitations: [
		"Static imports do not cover LoadLibrary, exports, or minimum OS API availability.",
		"Reported OS/CPU fields alone cannot certify native hardware or exclude a compatibility layer.",
		"Engines, WebView2 GUI, MSIX identity/install/upgrade/uninstall, WACK and licenses are not validated here.",
	],
};
try {
	const inspection = await inspectWindowsTree(root);
	report.inspection = inspection;
	if (inspection.missing.length)
		throw new Error(
			`Missing private DLLs: ${inspection.missing.map((d) => `${d.importer}: ${d.name}`).join(", ")}`,
		);
	const app = inspection.images.find(
		(image) => image.path === "z8-desktop.exe",
	);
	if (
		!app ||
		app.kind !== "exe" ||
		app.subsystem !== 2 ||
		!app.resourcesPresent
	)
		throw new Error(
			"Expected root z8-desktop.exe with Windows GUI subsystem and resources",
		);
	report.checks.pe = "passed";
	report.checks.buildInfo = "not-run";
	if (values.runtime) {
		if (
			process.platform !== "win32" ||
			process.arch !== "x64" ||
			machine() !== "x86_64"
		) {
			report.status = "blocked";
			process.exitCode = 2;
			report.blocker =
				"Runtime verification requires a Windows x64 process and x86_64 OS architecture; this host cannot execute that check.";
		} else {
			const binary = join(root, "z8-desktop.exe"),
				path = join(output, "build-info.json");
			const env = Object.fromEntries(
				Object.entries(process.env).filter(([key]) =>
					/^(?:systemroot|windir|temp|tmp)$/i.test(key),
				),
			);
			await promisify(execFile)(binary, ["--build-info-file", path], {
				env,
				cwd: root,
				timeout: 30000,
				maxBuffer: 65536,
				windowsHide: true,
			});
			const bytes = await readFile(path);
			if (bytes.length > 65536)
				throw new Error("Build info exceeds size limit");
			const info = JSON.parse(bytes);
			const matrix = await artifactMatrix();
			validateBuild(
				info,
				matrix.artifacts.find((a) => a.id === "windows-x64-msix"),
				matrix.version,
			);
			if (info.fileDialog !== "native")
				throw new Error("Expected native Windows dialog backend");
			if (
				JSON.stringify(await inspectWindowsTree(root)) !==
				JSON.stringify(inspection)
			)
				throw new Error(
					"Application or DLL inputs changed during runtime verification",
				);
			report.buildInfo = {
				file: "build-info.json",
				sha256: sha256(bytes),
			};
			report.checks.buildInfo = "passed";
			report.status = "passed";
		}
	} else report.status = "passed";
} catch (error) {
	report.error = error.message;
	process.exitCode = 1;
} finally {
	await writeFile(
		join(output, "report.json"),
		`${JSON.stringify(report, null, 2)}\n`,
		{ flag: "wx" },
	);
	console.log(
		JSON.stringify({
			status: report.status,
			report: join(output, "report.json"),
			acceptance: report.acceptance,
		}),
	);
}
