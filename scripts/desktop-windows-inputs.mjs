// Capture actual working-tree inputs; HEAD alone cannot identify uncommitted work.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, lstat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { sha256 } from "./lib/desktop-artifacts.mjs";
import { inputPaths } from "./lib/desktop-inputs.mjs";

const { values } = parseArgs({
	options: { output: { type: "string" }, verify: { type: "string" } },
});
if (!!values.output === !!values.verify)
	throw new Error("Choose --output NEW_FILE or --verify FILE");
const root = fileURLToPath(new URL("../", import.meta.url));
const git = (args) =>
	execFileSync("git", args, {
		cwd: root,
		encoding: "utf8",
		timeout: 10000,
		maxBuffer: 1024 * 1024,
	});
const paths = git([
	"ls-files",
	"--cached",
	"--others",
	"--exclude-standard",
	"-z",
	"--",
	...inputPaths,
])
	.split("\0")
	.filter(Boolean)
	.sort();
const files = {};
for (const path of paths) {
	const absolute = join(root, path),
		stat = await lstat(absolute);
	if (!stat.isFile() || stat.size > 16 * 1024 * 1024)
		throw new Error(`Unsupported source input: ${path}`);
	const bytes = await readFile(absolute);
	files[path] = { bytes: bytes.length, sha256: sha256(bytes) };
}
const record = { schema: 1, head: git(["rev-parse", "HEAD"]).trim(), files };
if (values.verify) {
	const previous = JSON.parse(await readFile(values.verify, "utf8"));
	if (JSON.stringify(record) !== JSON.stringify(previous)) {
		const changed = [
			...new Set([...Object.keys(previous.files ?? {}), ...paths]),
		].filter(
			(path) =>
				JSON.stringify(previous.files?.[path]) !==
				JSON.stringify(files[path]),
		);
		throw new Error(
			`Desktop build/validation inputs changed; rebuild in a new output directory. Changed paths: ${changed.join(", ") || "HEAD/receipt metadata"}`,
		);
	}
	console.log(`Unchanged build inputs: ${paths.length} files`);
} else
	await writeFile(values.output, `${JSON.stringify(record, null, 2)}\n`, {
		flag: "wx",
	});
