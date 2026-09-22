// Validate an already installed Snap. Never installs, refreshes or removes snaps.
import { parseArgs } from "node:util";
import {
	readFile,
	writeFile,
	mkdir,
	realpath,
	mkdtemp,
	chmod,
	rm,
} from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { userInfo } from "node:os";
import { randomBytes } from "node:crypto";
import { fileInfo, inspectBundle } from "./lib/desktop-sources.mjs";
import { artifactMatrix, validateBuild } from "./lib/desktop-artifacts.mjs";
import { validateSnap, snapMetadata } from "./lib/desktop-snap.mjs";
import {
	snapdGet,
	hostBlockers,
	validateInstalled,
	validateConnections,
	validateMount,
	probeScript,
	validateProbe,
	validateQuality,
	installedFingerprint,
	runFinite,
	shellQuote,
} from "./lib/desktop-snap-installed.mjs";
const { values } = parseArgs({
	options: {
		preflight: { type: "boolean", default: false },
		artifact: { type: "string" },
		prepared: { type: "string" },
		output: { type: "string" },
	},
});
if (
	!values.output ||
	(!values.preflight && (!values.artifact || !values.prepared))
)
	throw new Error(
		"Use --preflight --output NEW_DIR, or --artifact SNAP --prepared JSON --output NEW_DIR",
	);
if (values.preflight && (values.artifact || values.prepared))
	throw new Error("Preflight does not accept candidate inputs");
const output = resolve(values.output);
await mkdir(output);
const report = {
	schema: 1,
	artifact: "linux-amd64-snap",
	mode: values.preflight ? "preflight" : "installed",
	status: "running",
	checks: {},
	redistributionApproved: false,
	acceptance: "incomplete",
};
let cancelled = false;
const cancel = () => {
	cancelled = true;
};
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
const references = {};
let stage = "preflight",
	visible,
	hidden;
const save = async (name, value) => {
	await writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n", {
		flag: "wx",
	});
	if (name !== "report.json") references[name] = await fileInfo(output, name);
};
const cleanEnv = Object.fromEntries(
	Object.entries(process.env).filter(([key]) =>
		[
			"PATH",
			"HOME",
			"USER",
			"LOGNAME",
			"LANG",
			"LC_ALL",
			"DISPLAY",
			"WAYLAND_DISPLAY",
			"DBUS_SESSION_BUS_ADDRESS",
			"XDG_RUNTIME_DIR",
			"XDG_SESSION_TYPE",
			"XDG_CURRENT_DESKTOP",
		].includes(key),
	),
);
const run = (binary, args, opts = {}) => {
	if (cancelled) throw new Error("Acceptance interrupted");
	return runFinite(binary, args, { env: cleanEnv, ...opts });
};
try {
	const user = userInfo();
	const host = {
		platform: process.platform,
		arch: process.arch,
		uid: user.uid,
		machine: (await run("/usr/bin/uname", ["-m"])).stdout.trim(),
		snapd: await snapdGet("/v2/system-info"),
	};
	// Store only diagnostic fields, not refresh schedules or unrelated installed snaps.
	host.snapd = Object.fromEntries(
		[
			"architecture",
			"confinement",
			"kernel-version",
			"version",
			"os-release",
			"sandbox-features",
		].map((k) => [k, host.snapd[k]]),
	);
	const blockers = hostBlockers(host);
	await save("host.json", host);
	report.checks.preflight = {
		status: blockers.length ? "failed" : "passed",
		report: "host.json",
		blockers,
	};
	if (blockers.length) {
		report.status = "blocked";
		throw new Error(blockers.join("; "));
	}
	if (!values.preflight) {
		stage = "candidate-integrity";
		const artifactFile = resolve(values.artifact),
			preparedFile = resolve(values.prepared);
		await fileInfo(
			dirname(preparedFile),
			basename(preparedFile),
			1024 ** 2,
		);
		await save(
			"prepared.json",
			JSON.parse(await readFile(preparedFile, "utf8")),
		);
		await run(
			process.execPath,
			[
				"scripts/desktop-snap-check.mjs",
				"--artifact",
				artifactFile,
				"--prepared",
				join(output, "prepared.json"),
				"--output",
				join(output, "candidate-integrity.json"),
			],
			{ timeout: 120000 },
		);
		const integrity = JSON.parse(
			await readFile(join(output, "candidate-integrity.json"), "utf8"),
		);
		const expected = integrity;
		report.sha256 = integrity.sha256;
		references["candidate-integrity.json"] = await fileInfo(
			output,
			"candidate-integrity.json",
		);
		report.checks[stage] = {
			status: "passed",
			report: "candidate-integrity.json",
		};
		const matrix = await artifactMatrix(),
			artifact = matrix.artifacts.find((a) => a.id === report.artifact);
		stage = "installed-content";
		const installed = await snapdGet("/v2/snaps/z8-work");
		const root = validateInstalled(installed, matrix.version);
		if ((await realpath("/snap/z8-work/current")) !== root)
			throw new Error("Active revision symlink changed");
		validateMount(await readFile("/proc/self/mountinfo", "utf8"), root);
		const installedArchive = await installedFingerprint(
			installed.revision,
			run,
		);
		if (installedArchive.sha256 !== report.sha256)
			throw new Error("Installed archive differs from candidate bytes");
		validateSnap(
			snapMetadata(await readFile(join(root, "meta/snap.yaml"), "utf8")),
			matrix.version,
			true,
		);
		if (
			(await fileInfo(root, "usr/bin/z8-desktop")).sha256 !==
			expected.applicationSha256
		)
			throw new Error("Installed application differs from candidate");
		const engines = join(
			root,
			"usr/lib",
			expected.buildInfo.resourceDirectoryName,
			"engines",
		);
		if (
			(await inspectBundle(engines)).manifestInfo.sha256 !==
			expected.engineManifestSha256
		)
			throw new Error("Installed engine bundle differs from candidate");
		await save("installed.json", {
			revision: installed.revision,
			version: installed.version,
			base: installed.base,
			confinement: installed.confinement,
			devmode: installed.devmode,
			jailmode: installed.jailmode,
			root,
			...installedArchive,
		});
		report.checks[stage] = { status: "passed", report: "installed.json" };
		stage = "providers";
		const connections = validateConnections(
			await snapdGet("/v2/connections?snap=z8-work"),
		);
		const providers = [];
		for (const name of [
			"core24",
			"gnome-46-2404",
			"mesa-2404",
			"gtk-common-themes",
		]) {
			const info = await snapdGet(`/v2/snaps/${name}`);
			if (
				info.name !== name ||
				info.status !== "active" ||
				info.confinement !== "strict" ||
				info.devmode !== false ||
				info.trymode === true
			)
				throw new Error(
					`Inactive or unconfined runtime provider: ${name}`,
				);
			providers.push({
				name,
				revision: info.revision,
				version: info.version,
			});
		}
		await save("providers.json", { connections, providers });
		report.checks[stage] = { status: "passed", report: "providers.json" };
		stage = "application-launch";
		const appRun = await run(
			"/usr/bin/snap",
			["run", "z8-work", "--build-info"],
			{ timeout: 120000 },
		);
		const build = JSON.parse(appRun.stdout);
		validateBuild(build, artifact, matrix.version);
		if (
			JSON.stringify(Object.entries(build).sort()) !==
			JSON.stringify(Object.entries(expected.buildInfo).sort())
		)
			throw new Error("Installed build info mismatch");
		await save("application.json", {
			build,
			stderr: appRun.stderr,
			exitCode: appRun.exitCode,
		});
		report.checks[stage] = { status: "passed", report: "application.json" };
		stage = "sandbox-permissions";
		const home = await realpath(user.homedir),
			token = randomBytes(16).toString("hex");
		visible = await mkdtemp(join(home, "Z8Work-Acceptance-"));
		hidden = await mkdtemp(join(home, ".z8work-acceptance-"));
		await chmod(visible, 0o700);
		await chmod(hidden, 0o700);
		for (const directory of [visible, hidden])
			await writeFile(join(directory, "input.txt"), token, {
				mode: 0o600,
				flag: "wx",
			});
		await mkdir(join(visible, "readonly"), { mode: 0o500 });
		const probe = await run(
			"/usr/bin/snap",
			["run", "--shell", "z8-work"],
			{
				input: probeScript({
					revision: installed.revision,
					visible,
					hidden,
					token,
				}),
			},
		);
		validateProbe(probe.stdout, token);
		if ((await readFile(join(visible, "output.txt"), "utf8")) !== token)
			throw new Error("Sandbox did not save the expected output");
		await save("sandbox.json", {
			...probe,
			homeReadWrite: true,
			hiddenHomeDenied: true,
			readOnlyDirectoryDenied: true,
			portal: "not-run",
			removableMedia: "not-run",
		});
		report.checks[stage] = { status: "passed", report: "sandbox.json" };
		stage = "conversion";
		const result = await run(
			"/usr/bin/snap",
			["run", "--shell", "z8-work"],
			{
				input: `set -eu\n[ "$SNAP" = ${shellQuote(root)} ]\nexec ${shellQuote(engines + "/lib/ld-linux-x86-64.so.2")} --library-path ${shellQuote(engines + "/lib")} ${shellQuote(engines + "/validation/bundle-check")} ${shellQuote(engines)} --quality\n`,
				timeout: 1200000,
			},
		);
		const conversions = JSON.parse(result.stdout);
		validateQuality(conversions);
		await save("conversions.json", conversions);
		await writeFile(join(output, "conversions.stderr.txt"), result.stderr, {
			flag: "wx",
		});
		references["conversions.stderr.txt"] = await fileInfo(
			output,
			"conversions.stderr.txt",
		);
		report.checks[stage] = {
			status: "passed",
			report: "conversions.json",
			exitCode: result.exitCode,
			context:
				"snap run --shell; installed engines; no GUI or portal inference",
		};
		stage = "stable-revision";
		const after = await snapdGet("/v2/snaps/z8-work");
		if (
			validateInstalled(after, matrix.version) !== root ||
			(await realpath("/snap/z8-work/current")) !== root ||
			(await installedFingerprint(installed.revision, run)).sha256 !==
				report.sha256 ||
			(await fileInfo(dirname(artifactFile), basename(artifactFile)))
				.sha256 !== report.sha256
		)
			throw new Error(
				"Candidate or active revision changed during acceptance",
			);
		report.checks[stage] = { status: "passed" };
		for (const name of [
			"gui",
			"portal",
			"removable-media",
			"install-lifecycle",
			"upgrade",
			"uninstall",
			"licenses",
		])
			report.checks[name] = { status: "not-run" };
	}
	report.status = "passed";
} catch (error) {
	if (report.status !== "blocked") report.status = "failed";
	report.error = String(error.message ?? error);
	if (error.stderr)
		await save("failure.json", {
			message: report.error,
			stderr: error.stderr,
		});
	report.checks[stage] = { ...report.checks[stage], status: "failed" };
	process.exitCode = report.status === "blocked" ? 2 : 1;
} finally {
	try {
		if (visible) {
			await chmod(join(visible, "readonly"), 0o700).catch(() => {});
			await rm(visible, { recursive: true, force: true });
		}
		if (hidden) await rm(hidden, { recursive: true, force: true });
	} catch (error) {
		report.status = "failed";
		report.cleanupError = String(error);
		process.exitCode = 1;
	}
	if (cancelled) {
		report.status = "failed";
		report.error ??= "Acceptance interrupted";
		process.exitCode = 130;
	}
	report.references = references;
	await save("report.json", report);
	process.off("SIGINT", cancel);
	process.off("SIGTERM", cancel);
}
console.log(
	JSON.stringify({
		status: report.status,
		report: join(output, "report.json"),
		acceptance: report.acceptance,
	}),
);
