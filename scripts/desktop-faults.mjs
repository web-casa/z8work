// Native Linux fault validation, confined to small disposable tmpfs mounts.
import { validateFaultReport } from "./lib/desktop-faults.mjs";
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { assertElf, sha256 } from "./lib/desktop-artifacts.mjs";
import { inspectBundle, fileInfo } from "./lib/desktop-sources.mjs";
import { assertOutside } from "./lib/desktop-windows-acceptance.mjs";
import { runFinite } from "./lib/desktop-snap-installed.mjs";
const { values } = parseArgs({
	options: {
		engines: { type: "string" },
		verifier: { type: "string" },
		output: { type: "string" },
		sudo: { type: "boolean", default: false },
	},
});
for (const key of ["engines", "verifier", "output"])
	if (!values[key]) throw new Error(`--${key} required`);
const root = resolve(values.engines),
	verifier = resolve(values.verifier),
	output = resolve(values.output);
await assertOutside(root, output);
await assertOutside(dirname(verifier), output);
const arch = { arm64: "aarch64", x64: "x86_64" }[process.arch];
if (process.platform !== "linux" || !arch)
	throw new Error("Native Linux required");
const bundle = await inspectBundle(root);
if (bundle.manifest.arch !== arch || bundle.manifest.os !== "linux")
	throw new Error("Host/bundle mismatch; emulation is not native acceptance");
if (!/^lib\/ld-linux-[a-zA-Z0-9_.-]+$/.test(bundle.manifest.loader))
	throw new Error("Unexpected loader");
if (verifier.includes(","))
	throw new Error(
		"Verifier path cannot contain a comma in a Docker bind mount",
	);
const verifierInfo = await fileInfo(dirname(verifier), basename(verifier));
assertElf(await readFile(verifier), arch);
await mkdir(output);
const nonce = randomUUID(),
	tag = `z8-faults:${nonce}`,
	container = `z8-faults-${nonce}`;
const docker = (args, timeout = 30000) =>
	runFinite(
		values.sudo ? "sudo" : "docker",
		[...(values.sudo ? ["-n", "docker"] : []), ...args],
		{ timeout, limit: 4 * 1024 ** 2 },
	);
const report = {
	schema: 1,
	phase: 29,
	status: "failed",
	scope: "native Linux core fault checks; not installed application acceptance",
	platform: `linux-${arch}`,
	engineManifestSha256: bundle.manifestInfo.sha256,
	verifier: verifierInfo,
	installerAcceptance: false,
	redistributionApproved: false,
	isolation: {
		baseImage: "scratch",
		network: "none",
		rootFilesystem: "read-only",
		uid: 1000,
		memoryMiB: 1024,
		cpus: 2,
		faultVolumeMiB: 32,
		inodeLimit: 64,
	},
};
try {
	const dockerfile = join(output, "Dockerfile");
	await writeFile(dockerfile, "FROM scratch\nCOPY . /engines/\n", {
		flag: "wx",
	});
	const build = await docker(
		["build", "--network=none", "-t", tag, "-f", dockerfile, root],
		180000,
	);
	await writeFile(join(output, "build.log"), build.stdout + build.stderr, {
		flag: "wx",
	});
	const image = JSON.parse(
		(await docker(["image", "inspect", tag])).stdout,
	)[0];
	if (
		image.Os !== "linux" ||
		image.Architecture !== { aarch64: "arm64", x86_64: "amd64" }[arch]
	)
		throw new Error(
			"Docker image/host architecture mismatch; native fault validation required",
		);
	report.image = image.Id;
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
			"--memory=1g",
			"--cpus=2",
			"--mount",
			`type=bind,source=${verifier},target=/validation/fault-check,readonly`,
			"--tmpfs",
			"/tmp:rw,nosuid,nodev,size=256m",
			"--tmpfs",
			"/fault-output:rw,nosuid,nodev,size=32m,mode=0700,uid=1000,gid=1000",
			"--tmpfs",
			"/fault-inodes:rw,nosuid,nodev,size=32m,nr_inodes=64,mode=0700,uid=1000,gid=1000",
			"--tmpfs",
			"/fault-readonly:ro,nosuid,nodev,size=32m,mode=0555",
			"--entrypoint",
			`/engines/${bundle.manifest.loader}`,
			tag,
			"--library-path",
			"/engines/lib",
			"/validation/fault-check",
			"/engines",
		],
		300000,
	);
	const faults = JSON.parse(result.stdout);
	validateFaultReport(faults, report.platform);
	const final = await inspectBundle(root);
	if (
		final.manifestInfo.sha256 !== report.engineManifestSha256 ||
		JSON.stringify(
			await fileInfo(dirname(verifier), basename(verifier)),
		) !== JSON.stringify(verifierInfo)
	)
		throw new Error("Validation inputs changed");
	await writeFile(join(output, "faults.json"), result.stdout, { flag: "wx" });
	await writeFile(join(output, "stderr.log"), result.stderr, { flag: "wx" });
	report.faultsSha256 = sha256(Buffer.from(result.stdout));
	report.status = "passed";
} catch (error) {
	report.error = error.message;
	await writeFile(
		join(output, "failure.log"),
		error.stderr ?? String(error),
		{ flag: "wx" },
	);
	process.exitCode = 1;
} finally {
	report.cleanup = {};
	for (const [kind, args] of [
		["container", ["rm", "-f", container]],
		["image", ["image", "rm", tag]],
	]) {
		try {
			await docker(args, 10000);
			report.cleanup[kind] = "removed";
		} catch (error) {
			if (/No such (?:container|image)/i.test(error.stderr ?? ""))
				report.cleanup[kind] = "already-absent";
			else {
				report.cleanup[kind] = {
					status: "failed",
					resource: kind === "container" ? container : tag,
					error: error.message,
				};
				report.status = "failed";
				process.exitCode = 1;
			}
		}
	}
	await writeFile(
		join(output, "report.json"),
		JSON.stringify(report, null, 2) + "\n",
		{ flag: "wx" },
	);
}
console.log(JSON.stringify(report));
