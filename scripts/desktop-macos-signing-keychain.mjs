// Secrets stay in a temporary keychain; never include child-process arguments in errors.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
const temp = process.env.RUNNER_TEMP;
if (process.platform !== "darwin" || !temp)
	throw new Error("macOS runner required");
const keychain = join(temp, "z8-signing.keychain-db");
const p12 = join(temp, "z8-signing.p12");
function run(args) {
	const r = spawnSync("/usr/bin/security", args, {
		encoding: "utf8",
		timeout: 60000,
	});
	if (r.error || r.status !== 0)
		throw new Error(
			`Keychain operation failed: ${args[0]} (check certificate/password/account permissions)`,
		);
	return r.stdout;
}
if (process.argv[2] === "cleanup") {
	spawnSync("/usr/bin/security", ["delete-keychain", keychain], {
		stdio: "ignore",
	});
	await rm(p12, { force: true });
} else {
	for (const name of [
		"MACOS_CERTIFICATE_P12_BASE64",
		"APPLE_ID",
		"APPLE_TEAM_ID",
		"APPLE_APP_SPECIFIC_PASSWORD",
	])
		if (!process.env[name])
			throw new Error(
				`Required organization secret unavailable: ${name}`,
			);
	if (!/^[A-Z0-9]{10}$/.test(process.env.APPLE_TEAM_ID))
		throw new Error("Invalid Team ID");
	const password = randomBytes(32).toString("hex");
	run(["create-keychain", "-p", password, keychain]);
	run(["set-keychain-settings", "-lut", "21600", keychain]);
	run(["unlock-keychain", "-p", password, keychain]);
	const existing = [
		...run(["list-keychains", "-d", "user"]).matchAll(/"([^"\n]+)"/g),
	].map((m) => m[1]);
	run([
		"list-keychains",
		"-d",
		"user",
		"-s",
		keychain,
		...existing.filter((p) => p !== keychain),
	]);
	try {
		await writeFile(
			p12,
			Buffer.from(process.env.MACOS_CERTIFICATE_P12_BASE64, "base64"),
			{ mode: 0o600, flag: "wx" },
		);
		run([
			"import",
			p12,
			"-P",
			process.env.MACOS_CERTIFICATE_PASSWORD ?? "",
			"-f",
			"pkcs12",
			"-k",
			keychain,
			"-T",
			"/usr/bin/codesign",
		]);
	} finally {
		await rm(p12, { force: true });
	}
	run([
		"set-key-partition-list",
		"-S",
		"apple-tool:,apple:,codesign:",
		"-k",
		password,
		keychain,
	]);
	const identities = run([
		"find-identity",
		"-v",
		"-p",
		"codesigning",
		keychain,
	]);
	const matches = [
		...identities.matchAll(
			/([A-Fa-f0-9]{40}) "Developer ID Application: [^"\n]+\(([A-Z0-9]{10})\)"/g,
		),
	].filter((m) => m[2] === process.env.APPLE_TEAM_ID);
	if (matches.length !== 1)
		throw new Error(
			"Expected exactly one valid Developer ID Application identity matching Team ID, including private key",
		);
	await writeFile(join(temp, "z8-signing-identity"), matches[0][1], {
		mode: 0o600,
	});
	const r = spawnSync(
		"xcrun",
		[
			"notarytool",
			"store-credentials",
			"z8-notary",
			"--keychain",
			keychain,
			"--apple-id",
			process.env.APPLE_ID,
			"--team-id",
			process.env.APPLE_TEAM_ID,
			"--password",
			process.env.APPLE_APP_SPECIFIC_PASSWORD,
		],
		{ encoding: "utf8", timeout: 120000 },
	);
	if (r.error || r.status !== 0)
		throw new Error(
			"Apple notarization authentication failed; check Apple ID, Team ID, app-specific password and agreements",
		);
	console.log(
		"Certificate/private key and Apple notarization credentials validated.",
	);
}
