// Acquire pinned upstream snapshots for review, never mark corresponding source verified.
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sha256 } from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({ options: { output: { type: "string" } } });
if (!values.output) throw Error("Use --output NEW_DIRECTORY");
const root = resolve(values.output);
const catalog = JSON.parse(
	await readFile("packaging/desktop-web/engines.json", "utf8"),
);
const repositories = {
	"@ffmpeg/core": "ffmpegwasm/ffmpeg.wasm",
	"@imagemagick/magick-wasm": "dlemstra/magick-wasm",
	mupdf: "ArtifexSoftware/mupdf",
	"vert-wasm": "VERT-sh/vert-wasm",
};
await mkdir(root);
const report = {
	schema: 1,
	status: "incomplete",
	correspondingSourceVerified: false,
	engines: [],
};
for (const engine of catalog.engines) {
	const result = {
		name: engine.name,
		wasmSha256: engine.sha256,
		sourceCommit: engine.sourceCommit,
		status: "not-acquired",
		pending: engine.pending,
	};
	report.engines.push(result);
	if (
		engine.sourceCommit &&
		/^[a-f0-9]{40}$/.test(engine.sourceCommit) &&
		repositories[engine.name]
	) {
		result.url = `https://codeload.github.com/${repositories[engine.name]}/tar.gz/${engine.sourceCommit}`;
		try {
			const response = await fetch(result.url, {
				signal: AbortSignal.timeout(60000),
			});
			if (!response.ok) throw Error(`HTTP ${response.status}`);
			const chunks = [];
			let size = 0;
			for await (const chunk of response.body) {
				size += chunk.length;
				if (size > 256 * 1024 ** 2)
					throw Error("Source candidate exceeds 256 MiB");
				chunks.push(chunk);
			}
			const bytes = Buffer.concat(chunks);
			if (bytes.subarray(0, 2).toString("hex") !== "1f8b")
				throw Error("Expected gzip source archive");
			result.archive =
				engine.name.replaceAll(/[^a-z0-9.-]/gi, "_") +
				"-" +
				engine.sourceCommit +
				".tar.gz";
			await writeFile(join(root, result.archive), bytes, { flag: "wx" });
			result.sha256 = sha256(bytes);
			result.bytes = bytes.length;
			result.status = "acquired-for-review";
		} catch (error) {
			result.error = error.message;
			process.exitCode = 1;
		}
	}
	await writeFile(
		join(root, "report.json"),
		JSON.stringify(report, null, 2) + "\n",
	);
	console.log(`${engine.name}: ${result.status}`);
}
console.log(
	"Snapshots are review inputs only: submodules, patches, build inputs, embedded dependencies and license compatibility still need review. Engine verification flags were not changed.",
);
