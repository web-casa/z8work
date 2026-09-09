// Finite engine checks. This tool neither installs nor publishes a package.
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { machine } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inspectBundle } from "./lib/desktop-sources.mjs";
import { inspectWindowsTree } from "./lib/desktop-windows.mjs";
import { validateConversions } from "./lib/desktop-snap-installed.mjs";
import { sha256 } from "./lib/desktop-artifacts.mjs";

const { values } = parseArgs({
	options: {
		root: { type: "string" },
		output: { type: "string" },
		runtime: { type: "string" },
		wine: { type: "string" },
		full: { type: "boolean", default: false },
	},
});
if (
	!values.root ||
	!values.output ||
	(values.runtime && !["native", "wine"].includes(values.runtime)) ||
	(values.full && !values.runtime) ||
	(values.wine && values.runtime !== "wine")
)
	throw new Error(
		"Use --root --output NEW_DIRECTORY [--runtime native|wine [--wine EXECUTABLE] [--full]]",
	);
const root = resolve(values.root),
	output = resolve(values.output);
await mkdir(output);
const controller = new AbortController();
const interrupted = () => controller.abort();
process.on("SIGINT", interrupted);
process.on("SIGTERM", interrupted);
const report = {
	schema: 1,
	scope: "windows-engine-bundle",
	host: { os: process.platform, arch: process.arch, machine: machine() },
	execution: values.runtime ?? "not-run",
	status: "failed",
	acceptance: "incomplete",
	redistributionApproved: false,
	checks: {
		static: "not-run",
		versions: "not-run",
		integrity: "not-run",
		conversions: "not-run",
		nativeWindows: "not-run",
		gui: "not-run",
		installer: "not-run",
		licenses: "not-run",
	},
	references: {},
};
async function save(name, value) {
	const bytes =
		typeof value === "string"
			? value
			: JSON.stringify(value, null, 2) + "\n";
	await writeFile(join(output, name), bytes, { flag: "wx" });
	report.references[name] = {
		sha256: sha256(Buffer.from(bytes)),
		bytes: Buffer.byteLength(bytes),
	};
}
try {
	const bundle = await inspectBundle(root, "windows");
	if (bundle.manifest.arch !== "x86_64" || bundle.manifest.loader != null)
		throw new Error("Expected x64 Windows bundle without ELF loader");
	const pe = await inspectWindowsTree(root);
	if (pe.missing.length) throw new Error("Missing private engine DLLs");
	report.bundle = bundle.manifestInfo;
	await save("pe.json", pe);
	report.checks.static = "passed";
	const compatibleHost =
		values.runtime === "native"
			? process.platform === "win32" &&
				process.arch === "x64" &&
				machine() === "x86_64"
			: process.platform === "linux" && process.arch === "x64";
	if (values.runtime && !compatibleHost) {
		report.status = "blocked";
		report.blocker =
			"Selected execution mode does not match this host; use Windows x64 for native acceptance or a separate Linux x64 Wine diagnostic environment.";
		process.exitCode = 2;
	} else if (values.runtime) {
		const wine = values.runtime === "wine";
		const wineBinary = values.wine
			? resolve(values.wine)
			: "/usr/lib/wine/wine64";
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
					: /^(?:systemroot|windir|temp|tmp)$/i.test(key),
			),
		);
		if (wine) {
			env.WINEDEBUG = "-all";
			env.LANG = "C.UTF-8";
		}
		const run = async (binary, args, timeout = 30000) => {
			const result = await promisify(execFile)(
				wine ? wineBinary : binary,
				wine ? [binary, ...args] : args,
				{
					cwd: root,
					env,
					timeout,
					maxBuffer: 2 * 1024 ** 2,
					encoding: "utf8",
					windowsHide: true,
					signal: controller.signal,
				},
			);
			return result;
		};
		if (wine)
			await save(
				"wine-version.txt",
				(
					await promisify(execFile)(wineBinary, ["--version"], {
						timeout: 10000,
						encoding: "utf8",
						signal: controller.signal,
					})
				).stdout,
			);
		const versions = {};
		for (const [id, entry] of Object.entries(bundle.manifest.engines)) {
			const result = await run(join(root, entry.path), [
				id === "mutool"
					? "-v"
					: id === "pandoc"
						? "--version"
						: "-version",
			]);
			const text = result.stdout + result.stderr;
			const expected = entry.version.replace(
				/[.*+?^${}()|[\]\\]/g,
				"\\$&",
			);
			if (
				!new RegExp(`\\b${expected}\\b`).test(
					text.split(/\r?\n/).slice(0, 5).join("\n"),
				)
			)
				throw new Error(`Engine version mismatch: ${id}`);
			versions[id] = text;
		}
		await save("versions.json", versions);
		report.checks.versions = "passed";
		const argument = wine ? `Z:${root.replaceAll("/", "\\")}` : root;
		const binary = join(root, "validation/bundle-check.exe");
		const integrity = await run(binary, [argument]);
		if (JSON.parse(integrity.stdout).integrity !== "passed")
			throw new Error("Rust bundle integrity did not pass");
		await save("integrity.json", integrity.stdout);
		report.checks.integrity = "passed";
		if (values.full) {
			const result = await run(binary, [argument, "--full"], 1200000);
			await save("conversion-stderr.txt", result.stderr);
			await save("conversions.json", result.stdout);
			validateConversions(JSON.parse(result.stdout), "windows-x86_64");
			report.checks.conversions = "passed";
		}
		const after = await inspectBundle(root, "windows");
		if (
			after.manifestInfo.sha256 !== bundle.manifestInfo.sha256 ||
			JSON.stringify(await inspectWindowsTree(root)) !==
				JSON.stringify(pe)
		)
			throw new Error("Bundle changed during execution");
		// OS fields cannot rule out compatibility layers. Native provenance still
		// needs the machine/CI record; Wine never marks this check passed.
		if (!wine) report.checks.nativeWindows = "passed";
		report.status = "passed";
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
