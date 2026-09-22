import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileInfo } from "./lib/desktop-sources.mjs";
import { runFinite } from "./lib/desktop-snap-installed.mjs";
import { inspectDebInContainer } from "./lib/desktop-deb-installed.mjs";

const [id, inputDirectory, outputDirectory] = process.argv.slice(2);
if (!id || !inputDirectory || !outputDirectory || process.argv.length !== 5)
	throw new Error(
		"Usage: node scripts/desktop-deb-installed.mjs linux-amd64|linux-arm64 INPUT_DIRECTORY NEW_OUTPUT_DIRECTORY",
	);
const sources = JSON.parse(
	await readFile("packaging/desktop/capability-sources.json", "utf8"),
);
const source = sources.find((entry) => entry.id === id);
if (
	!source ||
	source.os !== "linux" ||
	process.platform !== "linux" ||
	source.arch !== process.arch
)
	throw new Error("A matching native Linux host is required");
const artifact = await fileInfo(inputDirectory, source.file);
if (artifact.sha256 !== source.sha256)
	throw new Error("Reviewed deb SHA-256 mismatch");
// Reuse the reviewed multi-architecture base used for the native engine build.
const dockerfile = await readFile(
	"packaging/desktop/linux/Dockerfile.core24",
	"utf8",
);
const image = dockerfile.match(
	/^FROM (ubuntu:24\.04@sha256:[a-f0-9]{64})$/m,
)?.[1];
if (!image) throw new Error("Missing pinned Ubuntu base");
const output = resolve(outputDirectory);
await mkdir(output); // Refuse to mix a new run with old evidence.
const toolFiles = {};
for (const file of [
	"scripts/desktop-deb-installed.mjs",
	"scripts/desktop-deb-container.py",
	"scripts/lib/desktop-deb-installed.mjs",
])
	toolFiles[file] = await fileInfo(".", file);
const receipt = {
	toolFiles,
	worktreeDirty: Boolean(
		(await runFinite("git", ["status", "--porcelain"])).stdout.trim(),
	),
	source,
	artifact,
	image,
	toolCommit:
		process.env.GITHUB_SHA ??
		(await runFinite("git", ["rev-parse", "HEAD"])).stdout.trim(),
};
await writeFile(
	join(output, "source.json"),
	JSON.stringify(receipt, null, 2) + "\n",
);
const docker = async (args, timeout = 120000) => {
	await appendFile(join(output, "commands.log"), JSON.stringify(args) + "\n");
	try {
		const result = await runFinite("sudo", ["-n", "docker", ...args], {
			timeout,
			limit: 16 * 1024 ** 2,
		});
		await appendFile(
			join(output, "commands.log"),
			result.stdout + result.stderr,
		);
		return result.stdout;
	} catch (error) {
		await appendFile(
			join(output, "commands.log"),
			`${error.message}\n${error.stderr ?? ""}\n`,
		);
		throw error;
	}
};
try {
	const result = await inspectDebInContainer({
		docker,
		name: `z8-deb-check-${randomUUID()}`,
		image,
		source,
		candidate: resolve(inputDirectory, source.file),
		script: resolve("scripts/desktop-deb-container.py"),
		record: (file, contents) => writeFile(join(output, file), contents),
	});
	await writeFile(
		join(output, "report.json"),
		JSON.stringify(result, null, 2) + "\n",
	);
	console.log(
		`${id}: installed offline quality, removal and container cleanup passed`,
	);
} catch (error) {
	await writeFile(
		join(output, "failure.json"),
		JSON.stringify({ status: "failed", error: error.message }, null, 2) +
			"\n",
	);
	throw error;
}
