// Run the actual bundled verifier without a base image or host libraries.
import { parseArgs } from "node:util";
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { sha256 } from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({
	options: {
		engines: { type: "string" },
		output: { type: "string" },
		sudo: { type: "boolean", default: false },
	},
});
if (!values.engines || !values.output)
	throw new Error("--engines and --output are required");
const root = resolve(values.engines),
	output = resolve(values.output);
const bytes = await readFile(join(root, "engines.json"));
const manifest = JSON.parse(bytes);
const architecture = { arm64: "aarch64", x64: "x86_64" }[process.arch];
if (
	process.platform !== "linux" ||
	manifest.os !== "linux" ||
	manifest.arch !== architecture
)
	throw new Error("Native Linux bundle required");
if (!/^lib\/ld-linux-[a-zA-Z0-9_.-]+$/.test(manifest.loader))
	throw new Error("Unexpected bundled loader path");
await mkdir(output);
const temp = await mkdtemp(join(output, "build-"));
const tag = `z8-engine-validation:${randomUUID()}`;
const container = `z8-engine-validation-${randomUUID()}`;
const prefix = values.sudo ? ["-n", "docker"] : [];
async function docker(args, timeout) {
	return await new Promise((accept, reject) => {
		const child = spawn(
			values.sudo ? "sudo" : "docker",
			[...prefix, ...args],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let stdout = "",
			stderr = "",
			timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeout);
		child.stdout.on("data", (d) => {
			stdout = (stdout + d).slice(-2 * 1024 * 1024);
		});
		child.stderr.on("data", (d) => {
			stderr = (stderr + d).slice(-32000);
		});
		child.on("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code !== 0 || timedOut)
				reject(
					new Error(
						`${args[0]} ${timedOut ? "timed out" : `exit ${code}`}\n${stderr}`,
					),
				);
			else accept({ stdout, stderr });
		});
	});
}
let created = false;
try {
	const entry = [
		`/engines/${manifest.loader}`,
		"--library-path",
		"/engines/lib",
		"/engines/validation/bundle-check",
		"/engines",
		"--full",
	];
	const file = join(temp, "Dockerfile");
	await writeFile(
		file,
		`FROM scratch\nCOPY . /engines/\nENTRYPOINT ${JSON.stringify(entry)}\n`,
	);
	const build = await docker(
		["build", "--network=none", "-t", tag, "-f", file, root],
		180000,
	);
	created = true;
	await writeFile(join(output, "build.log"), build.stdout + build.stderr);
	const image = JSON.parse(
		(await docker(["image", "inspect", tag], 10000)).stdout,
	)[0];
	const result = await docker(
		[
			"run",
			"--rm",
			"--name",
			container,
			"--network=none",
			"--read-only",
			"--user",
			"1000:1000",
			"--cap-drop=ALL",
			"--security-opt=no-new-privileges",
			"--pids-limit=128",
			"--memory=2g",
			"--cpus=2",
			"--tmpfs",
			"/tmp:rw,nosuid,nodev,size=512m",
			tag,
		],
		1200000,
	);
	const report = JSON.parse(result.stdout);
	if (report.routes?.length !== 76)
		throw new Error("Expected all 76 conversion routes");
	await writeFile(
		join(output, "conversion.json"),
		JSON.stringify(report, null, 2) + "\n",
	);
	await writeFile(
		join(output, "evidence.json"),
		JSON.stringify(
			{
				schema: 1,
				status: "passed",
				engineManifestSha256: sha256(bytes),
				image: image.Id,
				os: manifest.os,
				arch: manifest.arch,
				exitCode: 0,
				network: "none",
				rootFilesystem: "read-only",
				baseImage: "scratch",
				uid: 1000,
				installerAcceptance: false,
			},
			null,
			2,
		) + "\n",
	);
	console.log(
		`All 76 routes passed using only the bundled runtime: ${output}`,
	);
} finally {
	// Remove only this invocation's uniquely named resources, including after timeout.
	try {
		await docker(["rm", "-f", container], 10000);
	} catch {
		/* --rm may already have removed it. */
	}
	if (created) await docker(["image", "rm", tag], 30000);
	await rm(temp, { recursive: true, force: true });
}
