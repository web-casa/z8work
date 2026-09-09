import { validateQuality } from "./lib/desktop-snap-installed.mjs";
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { machine } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileInfo, inspectBundle } from "./lib/desktop-sources.mjs";
import { inspectWindowsTree } from "./lib/desktop-windows.mjs";
import {
	artifactMatrix,
	validateBuild,
	sha256,
} from "./lib/desktop-artifacts.mjs";
import {
	assertOutside,
	verifyHandoff,
	processTests,
	validateTestResult,
	webviewReadiness,
} from "./lib/desktop-windows-acceptance.mjs";
const { values } = parseArgs({
	options: {
		root: { type: "string" },
		output: { type: "string" },
		runtime: { type: "string" },
	},
});
if (
	!values.root ||
	!values.output ||
	(values.runtime && !["native", "wine"].includes(values.runtime))
)
	throw new Error(
		"Use --root HANDOFF --output NEW_DIRECTORY [--runtime native|wine]",
	);
const root = resolve(values.root),
	output = resolve(values.output);
await assertOutside(root, output);
await mkdir(output);
const controller = new AbortController(),
	interrupted = () => controller.abort();
process.on("SIGINT", interrupted);
process.on("SIGTERM", interrupted);
const report = {
	schema: 1,
	scope: "windows-native-validation",
	execution: values.runtime ?? "not-run",
	host: { os: process.platform, arch: process.arch, machine: machine() },
	status: "failed",
	acceptance: "incomplete",
	redistributionApproved: false,
	checks: {
		integrity: "not-run",
		buildInfo: "not-run",
		webview2: "not-run",
		lifecycle: "not-run",
		conversions: "not-run",
		nativeExecution: "not-run",
		gui: "not-run",
		permissions: "not-run",
		installer: "not-run",
		licenses: "not-run",
	},
	references: {},
};
async function save(name, data) {
	const bytes =
		typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n";
	await writeFile(join(output, name), bytes, { flag: "wx" });
	report.references[name] = {
		sha256: sha256(Buffer.from(bytes)),
		bytes: Buffer.byteLength(bytes),
	};
}
try {
	await verifyHandoff(root);
	report.handoff = await fileInfo(root, "handoff.json");
	const bundle = await inspectBundle(
		join(root, "candidate/engines"),
		"windows",
	);
	const pe = await inspectWindowsTree(root);
	if (pe.missing.length) throw new Error("Missing PE dependencies");
	await save("pe.json", pe);
	report.checks.integrity = "passed";
	const wine = values.runtime === "wine";
	const compatible = wine
		? process.platform === "linux" && process.arch === "x64"
		: process.platform === "win32" &&
			process.arch === "x64" &&
			machine() === "x86_64";
	if (values.runtime && !compatible) {
		report.status = "blocked";
		report.blocker =
			"This host does not match the requested Windows x64 or Linux x64 Wine execution mode.";
		process.exitCode = 2;
	} else if (values.runtime) {
		const env = Object.fromEntries(
			Object.entries(process.env).filter(([key]) =>
				wine
					? [
							"WINEPREFIX",
							"HOME",
							"DISPLAY",
							"XAUTHORITY",
							"TMPDIR",
						].includes(key)
					: /^(?:systemroot|windir|temp|tmp|userprofile|appdata|localappdata)$/i.test(
							key,
						),
			),
		);
		if (wine) {
			env.LANG = "C.UTF-8";
			env.WINEDEBUG = "-all";
		}
		const run = async (binary, args, timeout = 30000) =>
			promisify(execFile)(
				wine ? "/usr/lib/wine/wine64" : binary,
				wine ? [binary, ...args] : args,
				{
					// Crash dumps and incidental process output belong to reports.
					cwd: output,
					env,
					timeout,
					maxBuffer: 2 * 1024 ** 2,
					encoding: "utf8",
					windowsHide: true,
					signal: controller.signal,
				},
			);
		const windowsPath = (path) =>
			wine ? `Z:${path.replaceAll("/", "\\")}` : path;
		const app = join(root, "candidate/z8-desktop.exe");
		for (const [flag, name] of [
			["--build-info-file", "build-info.json"],
			["--runtime-info-file", "runtime-info.json"],
		]) {
			await run(app, [flag, windowsPath(join(output, name))]);
			await fileInfo(output, name, 65536);
			const bytes = await readFile(join(output, name));
			report.references[name] = {
				sha256: sha256(bytes),
				bytes: bytes.length,
			};
		}
		const info = JSON.parse(
			await readFile(join(output, "build-info.json"), "utf8"),
		);
		const matrix = await artifactMatrix();
		validateBuild(
			info,
			matrix.artifacts.find((a) => a.id === "windows-x64-msix"),
			matrix.version,
		);
		if (info.fileDialog !== "native")
			throw new Error("Expected native Windows dialog backend");
		report.checks.buildInfo = "passed";
		report.checks.webview2 = webviewReadiness(
			JSON.parse(
				await readFile(join(output, "runtime-info.json"), "utf8"),
			),
		);
		const tests = join(root, "validation/native-tests.exe");
		const supervisor = join(root, "validation/validation-run.exe");
		const listed = await run(supervisor, [windowsPath(tests), "--list"]);
		await save("lifecycle-list.txt", listed.stdout);
		const available = new Set(
			listed.stdout
				.split(/\r?\n/)
				.filter((line) => line.endsWith(": test"))
				.map((line) => line.slice(0, -6)),
		);
		for (const name of processTests) {
			if (!available.has(name))
				throw new Error(`Missing required lifecycle test: ${name}`);
			const result = await run(
				supervisor,
				[windowsPath(tests), "--exact", name],
				65000,
			);
			await save(
				`${name.split("::").at(-1)}.txt`,
				result.stdout + result.stderr,
			);
			validateTestResult(result.stdout, name);
		}
		report.checks.lifecycle = "passed";
		const engines = await run(
			join(root, "candidate/engines/validation/bundle-check.exe"),
			[windowsPath(join(root, "candidate/engines")), "--quality"],
			1200000,
		);
		await save("conversions.json", engines.stdout);
		await save("conversion-stderr.txt", engines.stderr);
		const conversions = JSON.parse(engines.stdout);
		validateQuality(conversions, "windows-x86_64");
		for (const [id, engine] of Object.entries(bundle.manifest.engines)) {
			const actual = conversions.engines?.find((item) => item.id === id);
			if (
				!actual?.available ||
				actual.development !== false ||
				actual.version !== engine.version
			)
				throw new Error(`Wrong bundled engine: ${id}`);
		}
		report.checks.conversions = "passed";
		await verifyHandoff(root);
		if (
			JSON.stringify(report.handoff) !==
			JSON.stringify(await fileInfo(root, "handoff.json"))
		)
			throw new Error("Handoff changed during execution");
		if (!wine) report.checks.nativeExecution = "passed";
		report.status =
			!wine && report.checks.webview2 !== "passed" ? "blocked" : "passed";
		if (report.status === "blocked") {
			report.blocker =
				"Core checks passed; stable WebView2 Runtime was not detected. GUI readiness requires a separate Windows runtime installation and real GUI checks.";
			process.exitCode = 2;
		}
	} else report.status = "passed";
} catch (error) {
	report.error = error.message;
	if (error.stdout) await save("failure-stdout.txt", error.stdout);
	if (error.stderr) await save("failure-stderr.txt", error.stderr);
	process.exitCode = 1;
} finally {
	process.off("SIGINT", interrupted);
	process.off("SIGTERM", interrupted);
	await writeFile(
		join(output, "report.json"),
		JSON.stringify(report, null, 2) + "\n",
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
