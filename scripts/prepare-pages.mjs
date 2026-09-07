import { createHash } from "node:crypto";
import { cp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

export const PAGES_ASSET_LIMIT = 25 * 1024 * 1024;

export async function preparePages(
	source,
	destination,
	limit = PAGES_ASSET_LIMIT,
) {
	const input = resolve(source);
	const output = resolve(destination);
	if (
		input === output ||
		input.startsWith(output + "/") ||
		output.startsWith(input + "/")
	)
		throw new Error(
			"Pages output must be separate from the original build",
		);
	await stat(join(input, "index.html"));
	await rm(output, { recursive: true, force: true });
	await cp(input, output, { recursive: true });
	const assets = {};
	async function visit(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			if ((await stat(path)).size <= limit) continue;
			if (!path.endsWith(".wasm"))
				throw new Error(`Pages asset exceeds ${limit} bytes: ${path}`);
			const original = await readFile(path);
			const compressed = gzipSync(original, { level: 9 });
			if (compressed.length > limit)
				throw new Error(
					`Compressed engine still exceeds Pages limit: ${path}`,
				);
			await writeFile(path + ".gz", compressed, { flag: "wx" });
			await rm(path);
			const url = "/" + relative(output, path).split("\\").join("/");
			assets[url] = {
				path: url + ".gz",
				size: compressed.length,
				etag: `W/"${createHash("sha256").update(original).digest("hex")}"`,
				cacheControl: url.startsWith("/_app/immutable/")
					? "public, max-age=31536000, immutable, no-transform"
					: "public, max-age=0, must-revalidate, no-transform",
			};
		}
	}
	await visit(output);
	if (Object.keys(assets).length) {
		const worker = await readFile(
			new URL("../deployment/pages-worker.mjs", import.meta.url),
			"utf8",
		);
		await writeFile(
			join(output, "_worker.js"),
			`${worker}\nexport default createPagesWorker(${JSON.stringify(assets)});\n`,
		);
		await writeFile(
			join(output, "_routes.json"),
			JSON.stringify({
				version: 1,
				include: Object.keys(assets),
				exclude: [],
			}),
		);
	}
	return assets;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	const assets = await preparePages("build", "build-pages");
	console.log("Pages engines:", assets);
}
