// Native MuPDF path diagnostic. Verbatim paths are a negative/control probe;
// the private-working-directory relative path must work before acceptance runs.
import { execFileSync } from "node:child_process";
import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
const { values } = parseArgs({
	options: { root: { type: "string" }, output: { type: "string" } },
});
if (process.platform !== "win32" || !values.root || !values.output)
	throw new Error("Use --root CANDIDATE --output NEW_DIRECTORY on Windows");
const output = resolve(values.output);
await mkdir(output);
const cwd = join(output, "PDF 路径 with spaces");
await mkdir(cwd);
await copyFile(
	"desktop/tests/fixtures/embedded-font.pdf",
	join(cwd, "input.pdf"),
);
const tool = resolve(values.root, "engines/bin/mutool.exe");
const absolute = join(cwd, "input.pdf");
const paths = {
	absolute,
	verbatim: "\\\\?\\" + absolute,
	relative: "input.pdf",
};
const checks = {};
for (const [mode, path] of Object.entries(paths)) {
	try {
		const stdout = execFileSync(
			tool,
			["show", path, "trailer/Root/Pages/Count"],
			{ cwd, encoding: "utf8", timeout: 30000, windowsHide: true },
		);
		checks[mode] = { passed: /^[1-9][0-9]*$/.test(stdout.trim()), stdout };
	} catch (e) {
		checks[mode] = {
			passed: false,
			stderr: String(e.stderr ?? ""),
			code: e.status,
		};
	}
}
// Cover output filenames and preview's draw command, not just the page-count probe.
try {
	execFileSync(
		tool,
		[
			"draw",
			"-q",
			"-F",
			"png",
			"-r",
			"72",
			"-o",
			"preview.png",
			"input.pdf",
			"1",
		],
		{ cwd, encoding: "utf8", timeout: 30000, windowsHide: true },
	);
	const png = await readFile(join(cwd, "preview.png"));
	checks.render = {
		passed: png.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
		bytes: png.length,
	};
} catch (e) {
	checks.render = {
		passed: false,
		stderr: String(e.stderr ?? ""),
		code: e.status,
	};
}
await writeFile(
	join(output, "report.json"),
	JSON.stringify({ scope: "native-windows-mupdf-paths", checks }, null, 2) +
		"\n",
);
console.log(JSON.stringify(checks));
if (!checks.relative.passed || !checks.render.passed)
	throw new Error("Private relative PDF paths failed");
