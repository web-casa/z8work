// Sign only a hash-pinned copy of the tested web-engine app. Never mutate the preview.
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
assert.equal(process.platform, "darwin");
assert.equal(process.arch, "arm64");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
const pin = JSON.parse(
	await readFile("packaging/desktop-web/macos-candidate.json", "utf8"),
);
const root = resolve(".desktop-local/mac-web-signed"),
	reports = join(root, "reports"),
	downloads = join(root, "downloads");
await mkdir(reports, { recursive: true });
await mkdir(downloads, { recursive: true });
const hash = async (path) => {
	const bytes = await readFile(path);
	return {
		bytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
};
const run = (cmd, args, timeout = 120000) => {
	const r = spawnSync(cmd, args, {
		encoding: "utf8",
		timeout,
		maxBuffer: 16 * 1024 * 1024,
	});
	if (r.error || r.status !== 0)
		throw Error(
			`${cmd} ${args[0]} failed: ${(r.stderr || r.stdout || r.error?.message || "").slice(-4000)}`,
		);
	return r.stdout || r.stderr;
};
const record = (name, data) =>
	writeFile(
		join(reports, name + ".json"),
		JSON.stringify(data, null, 2) + "\n",
	);
const source = resolve(".desktop-local/macos-web-input", pin.zip);
assert.equal(
	(await hash(source)).sha256,
	pin.zipSha256,
	"Candidate ZIP hash mismatch",
);
const stage = join(root, "stage");
await mkdir(stage);
run("ditto", ["-x", "-k", source, stage]);
const app = join(stage, pin.appName),
	binary = join(app, "Contents/MacOS/z8-desktop");
assert.equal(run("lipo", ["-archs", binary]).trim(), "arm64");
const keychain = join(process.env.RUNNER_TEMP, "z8-signing.keychain-db");
const identity = (
	await readFile(join(process.env.RUNNER_TEMP, "z8-signing-identity"), "utf8")
).trim();
const sign = (path, runtime = true) => {
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
	assert.ok(details.includes("Authority=Developer ID Application:"));
	assert.ok(details.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`));
	if (runtime) assert.ok(details.includes("runtime"));
};
sign(app);
run("codesign", ["--verify", "--deep", "--strict", app]);
await record("signed-app", {
	source: pin,
	toolCommit: process.env.GITHUB_SHA,
	binary: await hash(binary),
});
await symlink("/Applications", join(stage, "Applications"));
const name = `Z8.Work-${pin.version}-macos-arm64-signed.dmg`,
	dmg = join(downloads, name);
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
const original = await hash(dmg),
	auth = ["--keychain-profile", "z8-notary", "--keychain", keychain];
const submission = JSON.parse(
	run(
		"xcrun",
		["notarytool", "submit", dmg, ...auth, "--output-format", "json"],
		300000,
	),
);
await record("submission", { submission, artifact: original, source: pin });
console.log(`Notarization submitted: ${submission.id}`);
// Wait on this ID once; timeout must retain the candidate and ID, never resubmit it.
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
	throw Error(
		`Notarization not accepted: ${result.status ?? "unknown"}. Resume submission ${submission.id}; do not resubmit.`,
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
const mount = join(root, "mounted");
await mkdir(mount);
run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, dmg]);
try {
	const mounted = join(mount, pin.appName);
	run("codesign", ["--verify", "--deep", "--strict", mounted]);
	run("spctl", ["--assess", "--type", "execute", "--verbose=4", mounted]);
	assert.deepEqual(
		await hash(join(mounted, "Contents/MacOS/z8-desktop")),
		await hash(binary),
	);
} finally {
	run("hdiutil", ["detach", mount]);
}
const artifact = await hash(dmg);
assert.equal(
	(await hash(source)).sha256,
	pin.zipSha256,
	"Original preview changed",
);
await record("final", {
	status: "passed",
	source: pin,
	artifact: { name, ...artifact },
	notarization: result,
	signature: "Developer ID Application",
	gatekeeper: "passed",
	gui: "run signed-package acceptance separately",
	toolCommit: process.env.GITHUB_SHA,
});
await writeFile(join(downloads, "SHA256SUMS"), `${artifact.sha256}  ${name}\n`);
console.log(
	"Developer ID signing, notarization, stapling and Gatekeeper verification passed.",
);
