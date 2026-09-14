import assert from "node:assert/strict";
import { validateQuality } from "./desktop-snap-installed.mjs";

// Install/purge always target a disposable container, never the host package manager.
export async function inspectDebInContainer({
	docker,
	name,
	image,
	candidate,
	script,
	source,
	record,
}) {
	const machine = source.arch === "arm64" ? "aarch64" : "x86_64";
	assert.match(source.sha256, /^[a-f0-9]{64}$/);
	assert.equal(source.os, "linux");
	assert.ok(["arm64", "x64"].includes(source.arch));
	assert.match(image, /^ubuntu(?::24\.04)?@sha256:[a-f0-9]{64}$/);
	let result;
	try {
		await docker([
			"create",
			"--name",
			name,
			"--init",
			"--network",
			"bridge",
			"--env",
			"Z8_DISPOSABLE_CHECK=1",
			"--env",
			`Z8_MACHINE=${machine}`,
			"--env",
			`Z8_PACKAGE_SHA256=${source.sha256}`,
			image,
			"sleep",
			"3600",
		]);
		await docker(["start", name]);
		await docker(["cp", candidate, `${name}:/candidate.deb`]);
		await docker(["cp", script, `${name}:/check.py`]);
		await docker(
			[
				"exec",
				name,
				"sh",
				"-ec",
				"apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=30 update && apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=30 install --no-install-recommends -y python3",
			],
			600000,
		);
		await docker(["exec", name, "python3", "/check.py", "prepare"], 900000);
		await docker(["network", "disconnect", "bridge", name]);
		const networks = JSON.parse(
			await docker([
				"inspect",
				"--format",
				"{{json .NetworkSettings.Networks}}",
				name,
			]),
		);
		assert.deepEqual(
			networks,
			{},
			"Container is still connected to a network",
		);
		await docker(["exec", name, "python3", "/check.py", "verify"], 2100000);
		const reports = {};
		for (const file of ["quality.json", "build-info.json", "check.json"]) {
			const contents = await docker(["exec", name, "cat", `/${file}`]);
			await record(file, contents);
			reports[file] = JSON.parse(contents);
		}
		validateQuality(reports["quality.json"], `linux-${machine}`);
		const check = reports["check.json"];
		assert.equal(check.status, "passed");
		assert.equal(check.machine, machine);
		assert.ok(
			Number.isInteger(check.ordinaryUserUid) &&
				check.ordinaryUserUid > 0,
		);
		assert.ok(
			Number.isInteger(check.installedFilesChecked) &&
				check.installedFilesChecked > 0,
		);
		assert.match(check.installedApplicationHash, /^[a-f0-9]{64}$/);
		assert.deepEqual(check.networkInterfaces, ["lo"]);
		assert.equal(check.installation, "passed");
		assert.equal(check.removal, "passed");
		assert.equal(check.unownedFileRetained, true);
		assert.equal(check.gui, "not-run");
		assert.equal(check.upgrade, "not-run");
		assert.equal(reports["build-info.json"].arch, machine);
		assert.equal(reports["build-info.json"].engines, "bundled");
		result = {
			status: "passed",
			source,
			image,
			network: "disconnected-before-conversion",
			quality: "passed",
			installation: check,
			hostInstallationModified: false,
		};
	} finally {
		// Killing the Docker CLI alone does not stop a timed-out container command.
		// A failed cleanup must also fail the acceptance result.
		await docker(["rm", "--force", name]);
	}
	return result;
}
