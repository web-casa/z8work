import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { readFile, mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ids = ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"];
const { values } = parseArgs({
	options: Object.fromEntries(
		[...ids, "mutool-library-dir", "pandoc-data-dir"].map((id) => [
			id,
			{ type: "string" },
		]),
	),
});
const manifest = { schema: 1, kind: "development", engines: {} };
for (const id of ids) {
	if (!values[id] || !isAbsolute(values[id]))
		throw new Error(
			`Provide an explicit absolute --${id} path. No PATH lookup is used.`,
		);
	const path = await realpath(values[id]);
	const library =
		id === "mutool" && values["mutool-library-dir"]
			? await realpath(values["mutool-library-dir"])
			: undefined;
	const data =
		id === "pandoc" && values["pandoc-data-dir"]
			? await realpath(values["pandoc-data-dir"])
			: undefined;
	const env = { LANG: "C.UTF-8" };
	for (const key of ["SystemRoot", "WINDIR"])
		if (process.env[key]) env[key] = process.env[key];
	if (library) env.LD_LIBRARY_PATH = library;
	const flag =
		id === "mutool" ? "-v" : id === "pandoc" ? "--version" : "-version";
	const result = spawnSync(path, [flag], {
		encoding: "utf8",
		env,
		timeout: 15000,
		maxBuffer: 512 * 1024,
	});
	if (result.error || result.status !== 0)
		throw new Error(
			`${id} version check failed: ${result.error ?? result.stderr}`,
		);
	manifest.engines[id] = {
		path,
		sha256: createHash("sha256")
			.update(await readFile(path))
			.digest("hex"),
		version: (result.stdout || result.stderr).trim().split(/\r?\n/)[0],
		...(library ? { library_dir: library } : {}),
		...(data ? { data_dir: data } : {}),
	};
}
await mkdir(".desktop-local", { recursive: true });
const output = resolve(".desktop-local/engines.json");
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, {
	mode: 0o600,
});
console.log(
	`Development manifest: ${output}\nSet Z8_DEV_ENGINE_MANIFEST to this absolute path, then run bun run desktop:dev.\nHost libraries and licenses have NOT been validated for redistribution.`,
);
