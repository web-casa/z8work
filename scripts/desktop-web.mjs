import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
const mode = process.argv[2];
if (!["dev", "build", "check"].includes(mode))
	throw new Error("Expected dev, build or check");
const env = {
	...process.env,
	Z8_DESKTOP: "1",
	PUB_ENV: "production",
	PUB_HOSTNAME: "z8.work",
	PUB_PLAUSIBLE_URL: "",
	PUB_VERTD_URL: "",
	PUB_DISABLE_ALL_EXTERNAL_REQUESTS: "true",
	PUB_DISABLE_FAILURE_BLOCKS: "false",
};
const run = (args) => {
	const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status || 1);
};
run(["scripts/desktop-web-pages.mjs", "--check"]);
run([
	"node_modules/@inlang/paraglide-js/bin/run.js",
	"compile",
	"--project",
	"./project.inlang",
	"--outdir",
	"./src/lib/paraglide",
]);
if (mode === "check") {
	run(["node_modules/@sveltejs/kit/svelte-kit.js", "sync"]);
	run([
		"node_modules/svelte-check/bin/svelte-check",
		"--tsconfig",
		"./tsconfig.json",
	]);
	process.exit(0);
}
run([
	"node_modules/vite/bin/vite.js",
	...(mode === "dev"
		? ["--host", "127.0.0.1", "--port", "1420", "--strictPort"]
		: ["build"]),
]);
if (mode === "build") {
	const target =
		process.env.Z8_DESKTOP_TARGET ||
		execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(
			/^host: (.+)$/m,
		)?.[1];
	if (!target) throw Error("Unable to determine desktop notice target");
	const parent = mkdtempSync(".desktop-local/web-notices-");
	const dossier = join(parent, "collected");
	run([
		"scripts/desktop-web-notices.mjs",
		"--target",
		target,
		"--output",
		dossier,
	]);
	run(["scripts/desktop-web-license-page.mjs", dossier]);
	const walk = (root) =>
		readdirSync(root).flatMap((name) => {
			const path = join(root, name);
			return statSync(path).isDirectory() ? walk(path) : [path];
		});
	const wasm = walk("desktop/dist").filter((path) => path.endsWith(".wasm"));
	if (wasm.length < 4) throw new Error("Missing bundled conversion engines");
	for (const file of wasm) {
		if (readFileSync(file).subarray(0, 4).toString("hex") !== "0061736d")
			throw new Error(`Invalid WASM: ${file}`);
	}
	console.log(
		`Desktop frontend ready: ${wasm.length} bundled WASM assets; no engine downloads required.`,
	);
}
