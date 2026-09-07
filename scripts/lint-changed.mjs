import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getFileInfo } from "prettier";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const requestedBase = process.env.LINT_BASE_REF;
const base =
	requestedBase && !/^0+$/.test(requestedBase)
		? git("rev-parse", "--verify", `${requestedBase}^{commit}`).trim()
		: "HEAD";
// A manual CI run has no event.before. Check the checked-out commit instead
// of silently linting an empty working-tree diff.
const changes =
	process.env.GITHUB_ACTIONS === "true" && base === "HEAD"
		? git(
				"diff-tree",
				"--root",
				"--no-commit-id",
				"--name-only",
				"--diff-filter=ACMR",
				"-r",
				"-m",
				"-z",
				"HEAD",
			)
		: git("diff", "--name-only", "--diff-filter=ACMR", "-z", base);
const paths = new Set(
	[
		...changes.split("\0"),
		...git("ls-files", "--others", "--exclude-standard", "-z").split("\0"),
	].filter((path) => path && existsSync(path)),
);
const formatted = [];
for (const path of paths) {
	const info = await getFileInfo(path, { ignorePath: ".prettierignore" });
	if (!info.ignored && info.inferredParser) formatted.push(path);
}
const scripts = [...paths].filter((path) =>
	/\.(?:[cm]?[jt]s|svelte)$/.test(path),
);
function run(name, args) {
	if (!args.length) return;
	const result = spawnSync(
		process.execPath,
		[
			name === "prettier"
				? "node_modules/prettier/bin/prettier.cjs"
				: "node_modules/eslint/bin/eslint.js",
			...(name === "prettier" ? ["--check"] : []),
			"--",
			...args,
		],
		{ stdio: "inherit" },
	);
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
	`Checking ${formatted.length} formatted files and ${scripts.length} source files against ${base}.`,
);
run("prettier", formatted);
run("eslint", scripts);
