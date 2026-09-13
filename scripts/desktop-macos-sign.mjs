// Sign a hash-pinned preview copy; preserve original archives and verify final bytes.
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, cp, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileInfo, listFiles } from "./lib/desktop-sources.mjs";
import { inspectMacBundle, inspectMachO } from "./lib/desktop-macos.mjs";
import { validateQuality } from "./lib/desktop-snap-installed.mjs";
if (process.platform !== "darwin") throw new Error("Native macOS required");
const arch = process.arch === "arm64" ? "arm64" : "amd64";
const expected = {
	arm64: "07482d8dedca83092fe1954feb8a801a45200cedbb719227e330377b5b0844e8",
	amd64: "1127dd75672a2a04c4c5022c80f2c59e4a8158d2009b9eb016b37d900801aff5",
}[arch];
const root = resolve(".desktop-local/mac-signed");
await mkdir(root, { recursive: true });
const reports = join(root, "reports");
await mkdir(reports);
const run = (cmd, args, timeout = 120000) => {
	const r = spawnSync(cmd, args, {
		encoding: "utf8",
		timeout,
		maxBuffer: 64 * 1024 ** 2,
	});
	if (r.error || r.status !== 0)
		throw new Error(
			`${cmd} ${args[0]} failed: ${(r.stderr || r.stdout || r.error?.message || "").slice(-6000)}`,
		);
	return r.stdout || r.stderr;
};
const keychain = join(process.env.RUNNER_TEMP, "z8-signing.keychain-db");
const identity = (
	await readFile(join(process.env.RUNNER_TEMP, "z8-signing-identity"), "utf8")
).trim();
const source = resolve(".desktop-local/mac-input");
const sourceName = `Z8.Work-macos-${arch}-preview.dmg`;
const original = await fileInfo(source, sourceName);
if (original.sha256 !== expected)
	throw new Error("Preview hash does not match reviewed candidate");
const mount = join(root, "source-mounted");
await mkdir(mount);
const stage = join(root, "stage");
await mkdir(stage);
const appName = "Z8.Work Desktop Dev.app";
const app = join(stage, appName);
run("hdiutil", [
	"attach",
	"-readonly",
	"-nobrowse",
	"-mountpoint",
	mount,
	join(source, sourceName),
]);
try {
	await cp(join(mount, appName), app, {
		recursive: true,
		errorOnExist: true,
		force: false,
	});
} finally {
	run("hdiutil", ["detach", mount]);
}
const engines = join(app, "Contents/Resources/engines");
// Read the deployment floor from the hash-verified application's own plist.
const minimumSystemVersion = run("/usr/bin/plutil", [
	"-extract",
	"LSMinimumSystemVersion",
	"raw",
	"-o",
	"-",
	join(app, "Contents/Info.plist"),
]).trim();
await inspectMacBundle(engines, minimumSystemVersion);
function sign(path, runtime = true) {
	run("codesign", [
		"--force",
		"--sign",
		identity,
		"--keychain",
		keychain,
		"--timestamp",
		...(runtime ? ["--options", "runtime"] : []),
		path,
	]);
	run("codesign", ["--verify", "--strict", path]);
	const details = run("codesign", ["--display", "--verbose=4", path]);
	if (
		!details.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`) ||
		!details.includes("Authority=Developer ID Application:") ||
		(runtime && !details.includes("runtime"))
	)
		throw new Error("Unexpected signature authority or runtime");
}
let signedObjects = 0;
for (const name of await listFiles(engines)) {
	const b = await readFile(join(engines, name));
	if (b.subarray(0, 4).toString("hex") === "cffaedfe") {
		const obj = inspectMachO(b);
		if (obj.arch !== (arch === "arm64" ? "aarch64" : "x86_64"))
			throw new Error("Mixed architecture");
		sign(join(engines, name));
		signedObjects++;
	}
}
// Signing changes Mach-O bytes: regenerate the integrity manifest before outer signing.
const manifest = JSON.parse(
	await readFile(join(engines, "engines.json"), "utf8"),
);
for (const name of Object.keys(manifest.files))
	manifest.files[name] = await fileInfo(engines, name);
for (const entry of Object.values(manifest.engines))
	entry.sha256 = (await fileInfo(engines, entry.path)).sha256;
await writeFile(
	join(engines, "engines.json"),
	JSON.stringify(manifest, null, 2) + "\n",
);
await inspectMacBundle(engines, minimumSystemVersion);
sign(app);
run("codesign", ["--verify", "--deep", "--strict", app]);
console.log(
	`Signed ${signedObjects} engine objects and application; starting conversion quality checks.`,
);
const quality = JSON.parse(
	run(
		join(engines, "validation/bundle-check"),
		[engines, "--quality"],
		1800000,
	),
);
validateQuality(quality, `macos-${arch === "arm64" ? "aarch64" : "x86_64"}`);
await writeFile(
	join(reports, "quality.json"),
	JSON.stringify(quality, null, 2) + "\n",
);
const files = {};
for (const name of await listFiles(app))
	files[name] = await fileInfo(app, name);
await writeFile(
	join(reports, "signed-app.json"),
	JSON.stringify(
		{
			source: original,
			arch,
			minimumSystemVersion,
			signedObjects,
			files,
			signingCommit: process.env.GITHUB_SHA,
			sourceCommit: "3984230458b4f021cf255105b4018ff7f755c88a",
			sourceRun: "34766937495",
			gui: "not-run",
		},
		null,
		2,
	) + "\n",
);
await symlink("/Applications", join(stage, "Applications"));
const downloads = join(root, "downloads");
await mkdir(downloads);
const dmgName = `Z8.Work-macos-${arch}-signed.dmg`;
const dmg = join(downloads, dmgName);
run(
	"hdiutil",
	[
		"create",
		"-volname",
		"Z8.Work",
		"-srcfolder",
		stage,
		"-format",
		"UDZO",
		dmg,
	],
	300000,
);
sign(dmg, false);
const submitted = await fileInfo(downloads, dmgName);
const auth = ["--keychain-profile", "z8-notary", "--keychain", keychain];
console.log(
	"Conversion quality checks passed; submitting signed DMG for notarization.",
);
const submission = JSON.parse(
	run(
		"xcrun",
		["notarytool", "submit", dmg, ...auth, "--output-format", "json"],
		300000,
	),
);
await writeFile(
	join(reports, "submission.json"),
	JSON.stringify({ submission, artifact: submitted }, null, 2) + "\n",
);
console.log(`Notarization submitted: ${submission.id}; waiting for Apple.`);
// Save ID immediately; never resubmit on timeout.
const wait = spawnSync(
	"xcrun",
	[
		"notarytool",
		"wait",
		submission.id,
		...auth,
		"--timeout",
		"45m",
		"--output-format",
		"json",
	],
	{ encoding: "utf8", timeout: 2800000 },
);
await writeFile(join(reports, "notary-result.json"), wait.stdout || "{}");
const result = JSON.parse(wait.stdout || "{}");
if (wait.error || wait.status !== 0 || result.status !== "Accepted") {
	const log = spawnSync(
		"xcrun",
		["notarytool", "log", submission.id, ...auth],
		{ encoding: "utf8", timeout: 120000 },
	);
	await writeFile(join(reports, "notary-log.json"), log.stdout || "{}");
	throw new Error(
		`Notarization not accepted; retain submission ${submission.id} and exact DMG for follow-up`,
	);
}
run("xcrun", ["stapler", "staple", dmg]);
run("xcrun", ["stapler", "validate", dmg]);
run("hdiutil", ["verify", dmg]);
run("spctl", [
	"--assess",
	"--type",
	"open",
	"--context",
	"context:primary-signature",
	"--verbose=4",
	dmg,
]);
run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, dmg]);
try {
	const mountedApp = join(mount, appName);
	const actualNames = await listFiles(mountedApp);
	if (
		JSON.stringify(actualNames.sort()) !==
		JSON.stringify(Object.keys(files).sort())
	)
		throw new Error("DMG file set changed");
	for (const [name, info] of Object.entries(files))
		if ((await fileInfo(mountedApp, name)).sha256 !== info.sha256)
			throw new Error(`DMG file changed: ${name}`);
	run("codesign", ["--verify", "--deep", "--strict", mountedApp]);
	run("spctl", ["--assess", "--type", "execute", "--verbose=4", mountedApp]);
} finally {
	run("hdiutil", ["detach", mount]);
}
const artifact = await fileInfo(downloads, dmgName);
await writeFile(
	join(reports, "final.json"),
	JSON.stringify(
		{
			status: "passed",
			arch,
			artifact,
			notarization: result,
			signature: "Developer ID Application",
			gatekeeper: "passed",
			gui: "not-run",
			installation: "not-run",
			storeSubmission: "not-applicable",
		},
		null,
		2,
	) + "\n",
);
await writeFile(
	join(downloads, "SHA256SUMS"),
	`${artifact.sha256}  ${dmgName}\n`,
);
console.log("Signed DMG notarized, stapled and Gatekeeper checked.");
