// Default: cross-platform, read-only package preflight. --execute opts into a
// temporary signed copy and current-user installation on a Windows test desktop.
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { machine } from "node:os";
import { constants } from "node:fs";
import { mkdir, readFile, writeFile, copyFile, rmdir } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { fileInfo, inspectBundle } from "./lib/desktop-sources.mjs";
import {
	sha256,
	artifactMatrix,
	validateBuild,
} from "./lib/desktop-artifacts.mjs";
import {
	assertOutside,
	webviewReadiness,
} from "./lib/desktop-windows-acceptance.mjs";
import { validateConversions } from "./lib/desktop-snap-installed.mjs";
import {
	validateMsixReceipt,
	msixManifest,
	verifyMsixInstalled,
} from "./lib/desktop-msix.mjs";
import {
	newMsixAcceptanceReport,
	runMsixAcceptance,
	validateInstalledRegistration,
} from "./lib/desktop-msix-acceptance.mjs";

const { values } = parseArgs({
	options: {
		...Object.fromEntries(
			[
				"package",
				"prepared",
				"sha256",
				"output",
				"python",
				"signtool",
				"thumbprint",
			].map((name) => [name, { type: "string" }]),
		),
		execute: { type: "boolean", default: false },
	},
});
if (
	!values.package ||
	!values.prepared ||
	!values.output ||
	!/^[a-f0-9]{64}$/.test(values.sha256 ?? "") ||
	(values.execute &&
		(!values.signtool ||
			!/^[a-fA-F0-9]{40}$/.test(values.thumbprint ?? "")))
)
	throw new Error(
		"Use --package MSIX --prepared JSON --sha256 EXPECTED_SHA256 --output NEW_DIRECTORY [--python EXECUTABLE] [--execute --signtool EXE --thumbprint CERTIFICATE_SHA1]",
	);
const original = resolve(values.package),
	preparedPath = resolve(values.prepared),
	output = resolve(values.output);
await assertOutside(dirname(original), output);
await assertOutside(dirname(preparedPath), output);
await mkdir(output);
const report = newMsixAcceptanceReport(values.execute, {
	os: process.platform,
	arch: process.arch,
	machine: machine(),
});
const signed = join(output, "z8-work-development-signed.msix");
const python =
	values.python ?? (process.platform === "win32" ? "python" : "python3");
const signtool = values.signtool ? resolve(values.signtool) : undefined;
const controller = new AbortController(),
	stop = () => controller.abort();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
let originalInfo,
	preparedInfo,
	prepared,
	signedInfo,
	toolInfo,
	lock,
	sequence = 0;
const info = (path, max) => fileInfo(dirname(path), basename(path), max);
const equal = (a, b) => a.sha256 === b.sha256 && a.bytes === b.bytes;
const save = (name, data) =>
	writeFile(
		join(output, name),
		typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n",
		{ flag: "wx" },
	);
async function run(
	binary,
	args,
	label,
	timeout = 30000,
	cleanup = false,
	env = process.env,
) {
	try {
		const result = await promisify(execFile)(binary, args, {
			cwd: output,
			env,
			timeout,
			maxBuffer: 2 * 1024 ** 2,
			encoding: "utf8",
			windowsHide: true,
			signal: cleanup ? undefined : controller.signal,
		});
		await save(`${label}.txt`, result.stdout + result.stderr);
		return result;
	} catch (error) {
		await save(
			`${label}-failure.txt`,
			`${error.message}\n${error.stdout ?? ""}${error.stderr ?? ""}`,
		);
		throw error;
	}
}
async function powershell(action, extra = {}, cleanup = false) {
	const label = `${++sequence}-${action}`;
	await save(`${label}-request.json`, {
		action,
		version: prepared.config.version,
		...extra,
	});
	const binary = join(
		process.env.SystemRoot,
		"System32/WindowsPowerShell/v1.0/powershell.exe",
	);
	await run(
		binary,
		[
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-File",
			fileURLToPath(
				new URL("./desktop-msix-windows.ps1", import.meta.url),
			),
			"-RequestPath",
			join(output, `${label}-request.json`),
			"-ResponsePath",
			join(output, `${label}-response.json`),
		],
		label,
		180000,
		cleanup,
	);
	await fileInfo(output, `${label}-response.json`, 65536);
	return JSON.parse(
		await readFile(join(output, `${label}-response.json`), "utf8"),
	);
}
async function archiveCheck(path, signedMode) {
	const name = signedMode ? "signed-content" : "unsigned-content";
	await run(
		python,
		[
			fileURLToPath(new URL("./desktop-msix-check.py", import.meta.url)),
			"--package",
			path,
			"--prepared",
			join(output, "prepared.json"),
			"--output",
			join(output, `${name}.json`),
			...(signedMode ? ["--signed"] : []),
		],
		name,
		300000,
	);
	const checked = JSON.parse(
		await readFile(join(output, `${name}.json`), "utf8"),
	);
	const actual = await info(path);
	if (
		checked.status !== "passed" ||
		checked.sha256 !== actual.sha256 ||
		checked.bytes !== actual.bytes
	)
		throw new Error("Archive check is not bound to final bytes");
	return actual;
}
const adapter = {
	async verifyInput() {
		originalInfo = await info(original);
		if (originalInfo.sha256 !== values.sha256)
			throw new Error(
				"Package SHA-256 differs from independently supplied digest",
			);
		preparedInfo = await info(preparedPath, 2 * 1024 ** 2);
		prepared = JSON.parse(await readFile(preparedPath, "utf8"));
		validateMsixReceipt(prepared);
		if (
			prepared.files["AppxManifest.xml"].sha256 !==
			sha256(Buffer.from(msixManifest(prepared.config)))
		)
			throw new Error(
				"Receipt does not describe the canonical development manifest",
			);
		await copyFile(
			preparedPath,
			join(output, "prepared.json"),
			constants.COPYFILE_EXCL,
		);
		if (!equal(await info(join(output, "prepared.json")), preparedInfo))
			throw new Error("Preparation receipt changed while copying");
		if (!equal(await archiveCheck(original, false), originalInfo))
			throw new Error(
				"Source package changed during archive verification",
			);
		report.original = originalInfo;
		report.prepared = preparedInfo;
	},
	async preflight() {
		if (!process.env.LOCALAPPDATA)
			throw new Error("Missing Windows test-user profile");
		const lockPath = join(
			process.env.LOCALAPPDATA,
			"Z8Work-MSIX-acceptance.lock",
		);
		await mkdir(lockPath); // Refuse concurrent runs; never remove another run's lock.
		lock = lockPath;
		toolInfo = await info(signtool);
		report.signTool = toolInfo;
		await powershell("preflight", { thumbprint: values.thumbprint });
	},
	async sign() {
		await copyFile(original, signed, constants.COPYFILE_EXCL);
		if (!equal(await info(signed), originalInfo))
			throw new Error("Copy differs from original package");
		await run(
			signtool,
			[
				"sign",
				"/fd",
				"SHA256",
				"/s",
				"My",
				"/sha1",
				values.thumbprint,
				signed,
			],
			"signtool-sign",
			180000,
		);
		await run(
			signtool,
			["verify", "/pa", "/v", signed],
			"signtool-verify",
			180000,
		);
		await powershell("signature", {
			package: signed,
			thumbprint: values.thumbprint,
		});
		signedInfo = await info(signed);
		report.signed = signedInfo;
	},
	async checkSigned() {
		if (!equal(await archiveCheck(signed, true), signedInfo))
			throw new Error(
				"Signed package changed during content verification",
			);
	},
	async install() {
		await adapter.verifyOriginal();
		if (!equal(await info(signed), signedInfo))
			throw new Error("Signed package changed before installation");
		const registration = await powershell("install", { package: signed });
		validateInstalledRegistration(registration, prepared.config);
		report.registration = registration;
		return registration;
	},
	async checkInstalled(registration) {
		const current = await powershell("registration");
		if (
			current.fullName !== registration.fullName ||
			current.location !== registration.location
		)
			throw new Error("Windows installation changed during validation");
		const root = validateInstalledRegistration(current, prepared.config);
		await assertOutside(root, output);
		await verifyMsixInstalled(root, prepared);
	},
	async runtime(registration, result) {
		const root = registration.location;
		result.checks.buildInfo = "failed";
		const env = Object.fromEntries(
			Object.entries(process.env).filter(([key]) =>
				/^(?:systemroot|windir|temp|tmp|userprofile|appdata|localappdata)$/i.test(
					key,
				),
			),
		);
		for (const [flag, name] of [
			["--build-info-file", "build-info"],
			["--runtime-info-file", "runtime-info"],
		]) {
			await run(
				join(root, "z8-desktop.exe"),
				[flag, join(output, `${name}.json`)],
				name,
				30000,
				false,
				env,
			);
			await fileInfo(output, `${name}.json`, 65536);
		}
		const build = JSON.parse(
			await readFile(join(output, "build-info.json"), "utf8"),
		);
		const matrix = await artifactMatrix();
		validateBuild(
			build,
			matrix.artifacts.find((a) => a.id === "windows-x64-msix"),
			matrix.version,
		);
		if (build.fileDialog !== "native")
			throw new Error("Expected native Windows file dialogs");
		result.checks.buildInfo = "passed";
		result.checks.webview2 = "failed";
		result.checks.webview2 = webviewReadiness(
			JSON.parse(
				await readFile(join(output, "runtime-info.json"), "utf8"),
			),
		);
		result.checks.conversions = "failed";
		const conversions = await run(
			join(root, "engines/validation/bundle-check.exe"),
			[join(root, "engines"), "--full"],
			"conversions",
			1200000,
			false,
			env,
		);
		const parsed = JSON.parse(conversions.stdout);
		validateConversions(parsed, "windows-x86_64");
		const bundle = await inspectBundle(join(root, "engines"), "windows");
		for (const [id, engine] of Object.entries(bundle.manifest.engines)) {
			const actual = parsed.engines?.find((entry) => entry.id === id);
			if (
				!actual?.available ||
				actual.development !== false ||
				actual.version !== engine.version
			)
				throw new Error(`Wrong installed engine: ${id}`);
		}
		await save("conversions.json", parsed);
		result.checks.conversions = "passed";
	},
	async uninstall(registration) {
		await powershell(
			"uninstall",
			{
				fullName: registration.fullName,
				location: registration.location,
			},
			true,
		);
	},
	async verifyOriginal() {
		if (
			!originalInfo ||
			!equal(await info(original), originalInfo) ||
			originalInfo.sha256 !== values.sha256 ||
			!preparedInfo ||
			!equal(await info(preparedPath), preparedInfo) ||
			!equal(await info(join(output, "prepared.json")), preparedInfo) ||
			(toolInfo && !equal(await info(signtool), toolInfo)) ||
			(signedInfo && !equal(await info(signed), signedInfo))
		)
			throw new Error("Original, receipt, tool or signed bytes changed");
	},
};
try {
	await runMsixAcceptance(adapter, report, values.execute);
} finally {
	process.off("SIGINT", stop);
	process.off("SIGTERM", stop);
	if (lock) {
		try {
			await rmdir(lock);
		} catch (error) {
			report.lockCleanupError = error.message;
			report.status = "failed";
		}
	}
	await save("report.json", report);
}
process.exitCode =
	report.status === "passed" ? 0 : report.status === "blocked" ? 2 : 1;
console.log(
	JSON.stringify({
		status: report.status,
		mode: report.mode,
		report: join(output, "report.json"),
		acceptance: report.acceptance,
	}),
);
