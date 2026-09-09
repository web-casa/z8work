import test from "node:test";
import assert from "node:assert/strict";
import {
	msixConfig,
	validateMsixReceipt,
} from "../../scripts/lib/desktop-msix.mjs";
import {
	requireNativeWindows,
	validateInstalledRegistration,
	newMsixAcceptanceReport,
	runMsixAcceptance,
} from "../../scripts/lib/desktop-msix-acceptance.mjs";

const native = { os: "win32", arch: "x64", machine: "x86_64" };
function fixture(failures = [], webview = "passed") {
	const calls = [];
	const adapter = Object.fromEntries(
		[
			"verifyInput",
			"preflight",
			"sign",
			"checkSigned",
			"install",
			"checkInstalled",
			"runtime",
			"uninstall",
			"verifyOriginal",
		].map((name) => [
			name,
			async (_installed, report) => {
				calls.push(name);
				if (failures.includes(name)) throw new Error(`${name} failure`);
				if (name === "install")
					return { fullName: "owned-test-registration" };
				if (name === "runtime") {
					report.checks.buildInfo = "passed";
					report.checks.conversions = "passed";
					report.checks.webview2 = webview;
				}
			},
		]),
	);
	return { adapter, calls };
}
test("MSIX native execution refuses Wine, Linux and Windows ARM emulation", () => {
	requireNativeWindows(native);
	for (const host of [
		{ os: "linux", arch: "x64", machine: "x86_64" },
		{ os: "win32", arch: "x64", machine: "aarch64" },
		{ os: "win32", arch: "arm64", machine: "aarch64" },
	])
		assert.throws(() => requireNativeWindows(host), /native Windows/);
});
test("Windows registration must match identity, version, architecture and actual install folder", async () => {
	const c = await msixConfig();
	const fullName = `${c.identity}_${c.version}_x64__123456789abcd`;
	const good = {
		name: c.identity,
		publisher: c.publisher,
		version: c.version,
		architecture: "X64",
		status: "Ok",
		developmentMode: false,
		publisherId: "123456789abcd",
		fullName,
		location: `C:\\Program Files\\WindowsApps\\${fullName}`,
	};
	assert.equal(validateInstalledRegistration(good, c), good.location);
	for (const patch of [
		{ name: "Other.App" },
		{ publisher: "CN=Other" },
		{ version: "9.0.0.0" },
		{ architecture: "Arm64" },
		{ status: "Modified" },
		{ developmentMode: true },
		{ fullName: "Other.App_1.0.0.0_x64__123456789abcd" },
		{ location: `\\\\server\\share\\${fullName}` },
		{ location: `C:\\tmp\\..\\${fullName}` },
		{ location: "C:\\extracted-candidate" },
	])
		assert.throws(() =>
			validateInstalledRegistration({ ...good, ...patch }, c),
		);
});
test("MSIX receipt rejects null fingerprints, alias paths and missing executable", async () => {
	const prepared = {
		schema: 1,
		scope: "development-msix-layout",
		redistributionApproved: false,
		config: await msixConfig(),
		files: Object.fromEntries(
			["AppxManifest.xml", "z8-desktop.exe", "engines/engines.json"].map(
				(name) => [name, { sha256: "a".repeat(64), bytes: 1 }],
			),
		),
	};
	validateMsixReceipt(prepared);
	for (const mutate of [
		(p) => (p.files["z8-desktop.exe"] = null),
		(p) => delete p.files["z8-desktop.exe"],
		(p) => (p.files["Z8-DESKTOP.EXE"] = p.files["z8-desktop.exe"]),
		(p) => (p.files["../escape"] = p.files["z8-desktop.exe"]),
		(p) => (p.files["z8-desktop.exe"].bytes = -1),
	]) {
		const changed = structuredClone(prepared);
		mutate(changed);
		assert.throws(() => validateMsixReceipt(changed));
	}
});
test("MSIX default preflight never signs, installs or claims runtime acceptance", async () => {
	const { adapter, calls } = fixture();
	const report = await runMsixAcceptance(
		adapter,
		newMsixAcceptanceReport(false, native),
	);
	assert.deepEqual(calls, ["verifyInput", "verifyOriginal"]);
	assert.equal(report.status, "passed");
	assert.equal(report.checks.installation, "not-run");
	assert.equal(report.acceptance, "incomplete");
});
test("successful installed workflow rechecks payload then removes its owned registration", async () => {
	const { adapter, calls } = fixture();
	const report = await runMsixAcceptance(
		adapter,
		newMsixAcceptanceReport(true, native),
		true,
	);
	assert.deepEqual(calls, [
		"verifyInput",
		"preflight",
		"sign",
		"checkSigned",
		"install",
		"checkInstalled",
		"runtime",
		"checkInstalled",
		"uninstall",
		"verifyOriginal",
	]);
	assert.equal(report.status, "passed");
	assert.equal(report.checks.uninstall, "passed");
	for (const check of ["gui", "permissions", "upgrade", "wack", "licenses"])
		assert.equal(report.checks[check], "not-run");
	assert.equal(report.storeSubmissionAllowed, false);
});
for (const stage of [
	"verifyInput",
	"preflight",
	"sign",
	"checkSigned",
	"install",
	"checkInstalled",
	"runtime",
	"uninstall",
	"verifyOriginal",
]) {
	test(`MSIX ${stage} failure remains observable and respects cleanup ownership`, async () => {
		const { adapter, calls } = fixture([stage]);
		const report = await runMsixAcceptance(
			adapter,
			newMsixAcceptanceReport(true, native),
			true,
		);
		assert.equal(report.status, "failed");
		assert.equal(calls.at(-1), "verifyOriginal");
		assert.equal(
			calls.includes("uninstall"),
			[
				"checkInstalled",
				"runtime",
				"uninstall",
				"verifyOriginal",
			].includes(stage),
		);
		if (stage === "install") assert.match(report.recovery, /ownership/);
	});
}
test("runtime and cleanup failures are both preserved", async () => {
	const { adapter } = fixture(["runtime", "uninstall"]);
	const report = await runMsixAcceptance(
		adapter,
		newMsixAcceptanceReport(true, native),
		true,
	);
	assert.match(report.error, /runtime failure/);
	assert.match(report.cleanupError, /uninstall failure/);
	assert.equal(report.checks.uninstall, "failed");
});
test("an incomplete runtime report cannot pass even when the subprocess adapter resolves", async () => {
	const { adapter } = fixture();
	adapter.runtime = async () => {};
	const report = await runMsixAcceptance(
		adapter,
		newMsixAcceptanceReport(true, native),
		true,
	);
	assert.equal(report.status, "failed");
	assert.match(report.error, /complete results/);
	assert.equal(report.checks.uninstall, "passed");
});
test("missing WebView2 keeps native acceptance blocked after conversions and cleanup", async () => {
	const { adapter } = fixture([], "blocked");
	const report = await runMsixAcceptance(
		adapter,
		newMsixAcceptanceReport(true, native),
		true,
	);
	assert.equal(report.status, "blocked");
	assert.equal(report.checks.conversions, "passed");
	assert.equal(report.checks.uninstall, "passed");
});
test("non-Windows execute request stops before any signing or installation", async () => {
	const { adapter, calls } = fixture();
	const report = await runMsixAcceptance(
		adapter,
		newMsixAcceptanceReport(true, {
			os: "linux",
			arch: "arm64",
			machine: "aarch64",
		}),
		true,
	);
	assert.equal(report.status, "failed");
	assert.deepEqual(calls, ["verifyInput", "verifyOriginal"]);
});
