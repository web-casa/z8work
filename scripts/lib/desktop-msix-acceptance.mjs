import { win32 } from "node:path";
import { validateMsixConfig } from "./desktop-msix.mjs";

export function requireNativeWindows(host) {
	if (host.os !== "win32" || host.arch !== "x64" || host.machine !== "x86_64")
		throw new Error(
			"MSIX execution requires native Windows x64; Wine and ARM emulation do not qualify",
		);
}

export function validateInstalledRegistration(info, config) {
	validateMsixConfig(config);
	if (
		!info ||
		info.name !== config.identity ||
		info.publisher !== config.publisher ||
		info.version !== config.version ||
		info.architecture !== "X64" ||
		info.status !== "Ok" ||
		info.developmentMode !== false ||
		typeof info.publisherId !== "string" ||
		!/^[a-z0-9]{13}$/.test(info.publisherId) ||
		info.fullName !==
			`${config.identity}_${config.version}_x64__${info.publisherId}` ||
		typeof info.location !== "string" ||
		!/^[A-Za-z]:\\/.test(info.location) ||
		win32.normalize(info.location) !== info.location ||
		win32.basename(info.location) !== info.fullName
	)
		throw new Error("Unexpected Windows package registration");
	return info.location;
}

export function newMsixAcceptanceReport(execute, host) {
	return {
		schema: 1,
		scope: "development-msix-acceptance",
		mode: execute ? "native" : "preflight",
		host,
		status: "failed",
		acceptance: "incomplete",
		redistributionApproved: false,
		storeSubmissionAllowed: false,
		checks: Object.fromEntries(
			[
				"input",
				"signature",
				"signedContent",
				"installation",
				"installedContent",
				"buildInfo",
				"webview2",
				"conversions",
				"uninstall",
				"originalUnchanged",
				"gui",
				"permissions",
				"upgrade",
				"wack",
				"licenses",
				"lifecycle",
			].map((key) => [key, "not-run"]),
		),
	};
}

// Small state machine shared by the real Windows adapter and failure-injection tests.
// Cleanup is attempted only after the adapter returns a registration it owns.
// A failed/ambiguous Add-AppxPackage leaves a visible recovery instruction, never
// guesses ownership of a package that another process might have installed.
export async function runMsixAcceptance(adapter, report, execute = false) {
	let installed;
	let installAttempted = false;
	const checked = async (name, action) => {
		report.checks[name] = "failed";
		const value = await action();
		report.checks[name] = "passed";
		return value;
	};
	try {
		await checked("input", () => adapter.verifyInput());
		if (execute) {
			requireNativeWindows(report.host);
			await adapter.preflight();
			await checked("signature", () => adapter.sign());
			await checked("signedContent", () => adapter.checkSigned());
			installAttempted = true;
			installed = await checked("installation", () => adapter.install());
			await checked("installedContent", () =>
				adapter.checkInstalled(installed),
			);
			await adapter.runtime(installed, report);
			if (
				report.checks.buildInfo !== "passed" ||
				report.checks.conversions !== "passed" ||
				!["passed", "blocked"].includes(report.checks.webview2)
			)
				throw new Error(
					"Installed runtime checks did not produce complete results",
				);
			// Recheck installed payload after running the native code.
			await checked("installedContent", () =>
				adapter.checkInstalled(installed),
			);
		}
		report.status =
			report.checks.webview2 === "blocked" ? "blocked" : "passed";
	} catch (error) {
		report.status = "failed";
		report.error = error.message;
	} finally {
		if (installed) {
			try {
				await adapter.uninstall(installed);
				report.checks.uninstall = "passed";
			} catch (error) {
				report.checks.uninstall = "failed";
				report.cleanupError = error.message;
				report.status = "failed";
			}
		} else if (installAttempted) {
			report.checks.uninstall = "not-run";
			report.recovery =
				"Installation did not return a verified registration. Inspect Get-AppxPackage -Name Z8Work.Desktop.Dev in this test account before manually removing it; automatic ownership could not be established.";
		}
		try {
			await adapter.verifyOriginal();
			report.checks.originalUnchanged = "passed";
		} catch (error) {
			report.checks.originalUnchanged = "failed";
			report.integrityError = error.message;
			report.status = "failed";
		}
	}
	return report;
}
