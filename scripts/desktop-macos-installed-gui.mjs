import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	mkdir,
	readFile,
	readdir,
	writeFile,
	lstat,
	rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
// Installation is restricted to disposable hosted runners; never overwrite a user's app.
assert.equal(process.platform, "darwin", "Native macOS required");
assert.equal(
	process.env.GITHUB_ACTIONS,
	"true",
	"Ephemeral GitHub Actions environment required",
);
assert.equal(
	process.env.RUNNER_ENVIRONMENT,
	"github-hosted",
	"Hosted runner required",
);
const pins = JSON.parse(
	await readFile("packaging/desktop/capability-sources.json", "utf8"),
);
const pin = pins.find((p) => p.id === process.argv[2] && p.os === "darwin");
assert.ok(pin);
assert.equal(process.arch, pin.arch);
const root = resolve(".desktop-local/mac-installed-report");
await mkdir(root);
const report = {
	schema: 1,
	status: "running",
	source: pin,
	toolCommit: process.env.GITHUB_SHA,
	checks: [],
	gui: "not-run",
};
const run = (bin, args, timeout = 60000) =>
	execFileSync(bin, args, {
		encoding: "utf8",
		timeout,
		maxBuffer: 16 * 1024 * 1024,
	});
const record = async (name, value) =>
	writeFile(join(root, name), JSON.stringify(value, null, 2) + "\n");
const hash = async (p) => {
	const b = await readFile(p);
	return {
		bytes: b.length,
		sha256: createHash("sha256").update(b).digest("hex"),
	};
};
const dmg = resolve(".desktop-local/mac-installed-input", pin.file),
	mount = join(root, "mount");
let mounted = false,
	installed = false,
	pid,
	app;
try {
	report.artifact = await hash(dmg);
	assert.equal(report.artifact.sha256, pin.sha256);
	report.checks.push("fixed-dmg-hash");
	run("xcrun", [
		"swiftc",
		"scripts/lib/desktop-macos-accessibility.swift",
		"-o",
		join(root, "ax-helper"),
	]);
	const helper = join(root, "ax-helper");
	report.environment = JSON.parse(run(helper, ["environment"]));
	report.system = run("sw_vers", []).trim();
	await mkdir(mount);
	run("hdiutil", [
		"attach",
		"-readonly",
		"-nobrowse",
		"-mountpoint",
		mount,
		dmg,
	]);
	mounted = true;
	const names = (await readdir(mount)).filter((n) => n.endsWith(".app"));
	assert.equal(names.length, 1);
	app = join("/Applications", names[0]);
	await assert.rejects(lstat(app), { code: "ENOENT" });
	run("ditto", [join(mount, names[0]), app]);
	installed = true;
	const binary = join(app, "Contents/MacOS/z8-desktop");
	report.application = await hash(binary);
	assert.deepEqual(
		report.application,
		await hash(join(mount, names[0], "Contents/MacOS/z8-desktop")),
	);
	run("codesign", ["--verify", "--deep", "--strict", app]);
	run("spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
	report.checks.push("installed-application-signature-and-gatekeeper");
	run("hdiutil", ["detach", mount]);
	mounted = false;
	const launched = JSON.parse(run(helper, ["launch", app]));
	pid = launched.pid;
	assert.equal(launched.bundle, app);
	report.launch = launched;
	report.checks.push("launchservices-from-applications");
	await delay(12000);
	process.kill(pid, 0);
	if (report.environment.screenCaptureAllowed)
		run("screencapture", ["-x", join(root, "launch.png")]);
	if (!report.environment.accessibilityTrusted) {
		report.gui = "blocked-accessibility";
		throw new Error(
			"Native launch passed; hosted runner has no Accessibility authorization for GUI interactions",
		);
	}
	const tree = JSON.parse(run(helper, ["tree", String(pid)]));
	await record("launch-tree.json", tree);
	report.gui = "inspection-only";
	throw new Error(
		"GUI interaction checks not yet implemented; launch/tree alone is not full acceptance",
	);
} catch (error) {
	report.status = "failed";
	report.error = error.stack;
	process.exitCode = 1;
} finally {
	if (pid) {
		try {
			run(join(root, "ax-helper"), ["quit", String(pid)]);
			await delay(2000);
			try {
				process.kill(pid, 0);
				report.exit = "still-running";
				process.exitCode = 1;
			} catch (e) {
				if (e.code !== "ESRCH") {
					report.cleanupError = String(e);
					process.exitCode = 1;
				} else report.exit = "terminated";
			}
		} catch (e) {
			report.cleanupError = String(e);
			process.exitCode = 1;
		}
	}
	if (mounted) {
		try {
			run("hdiutil", ["detach", mount]);
		} catch (e) {
			report.detachError = String(e);
			process.exitCode = 1;
		}
	}
	if (installed && report.exit === "terminated") {
		await rm(app, { recursive: true });
		report.uninstall = "removed-test-copy";
	}
	await record("report.json", report);
}
