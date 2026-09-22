// Mutates only an ephemeral GitHub native Linux runner; local inspection uses
// desktop-preview-gui.mjs with an extracted candidate instead of installing.
import assert from "node:assert/strict";
import {
	readFile,
	mkdir,
	writeFile,
	appendFile,
	lstat,
	readdir,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileInfo } from "./lib/desktop-sources.mjs";
import { runFinite } from "./lib/desktop-snap-installed.mjs";
import { validatePackagedGuiReport } from "./lib/desktop-packaged-gui-report.mjs";
const [id, input, destination] = process.argv.slice(2);
if (
	process.argv.length !== 5 ||
	process.env.GITHUB_ACTIONS !== "true" ||
	process.env.RUNNER_ENVIRONMENT !== "github-hosted" ||
	process.platform !== "linux" ||
	process.getuid() === 0
)
	throw new Error(
		"Usage on an ephemeral GitHub-hosted Linux runner: desktop-installed-gui.mjs ID INPUT NEW_OUTPUT",
	);
const source = JSON.parse(
	await readFile("packaging/desktop/capability-sources.json", "utf8"),
).find((s) => s.id === id);
assert.ok(
	source && source.os === "linux" && source.arch === process.arch,
	"Native Linux runner required",
);
const artifact = await fileInfo(input, source.file);
assert.equal(artifact.sha256, source.sha256, "Reviewed deb changed");
await assert.rejects(lstat("/usr/bin/z8-desktop"), { code: "ENOENT" });
const root = resolve(destination);
await mkdir(root);
const run = async (binary, args, options = {}) => {
	await appendFile(
		join(root, "commands.log"),
		JSON.stringify([binary, ...args]) + "\n",
	);
	try {
		const result = await runFinite(binary, args, {
			timeout: 120000,
			limit: 16 * 1024 ** 2,
			...options,
		});
		await appendFile(
			join(root, "commands.log"),
			result.stdout + result.stderr,
		);
		return result.stdout;
	} catch (error) {
		await appendFile(
			join(root, "commands.log"),
			`${error.message}\n${error.stderr ?? ""}\n`,
		);
		throw error;
	}
};
const candidate = resolve(input, source.file);
assert.equal(
	(await run("dpkg-deb", ["-f", candidate, "Package"])).trim(),
	"z8-work",
);
const extracted = join(root, "extracted");
await run("dpkg-deb", ["-x", candidate, extracted]);
const app = await fileInfo(extracted, "usr/bin/z8-desktop");
const session = join(root, "session");
await mkdir(session);
await writeFile(
	join(root, "source.json"),
	JSON.stringify(
		{
			source,
			artifact,
			application: app,
			toolCommit: process.env.GITHUB_SHA,
			host: await readFile("/etc/os-release", "utf8"),
		},
		null,
		2,
	) + "\n",
);
let failure, files;
try {
	await run(
		"sudo",
		[
			"-n",
			"apt-get",
			"install",
			"--no-install-recommends",
			"-y",
			candidate,
		],
		{ timeout: 600000 },
	);
	assert.deepEqual(await fileInfo("/usr/bin", "z8-desktop"), app);
	const info = JSON.parse(await run("/usr/bin/z8-desktop", ["--build-info"]));
	assert.equal(info.engines, "bundled");
	assert.equal(info.fileDialog, "xdg-portal");
	await writeFile(
		join(root, "build-info.json"),
		JSON.stringify(info, null, 2) + "\n",
	);
	await run(
		"xvfb-run",
		[
			"-a",
			"-s",
			"-screen 0 1280x1024x24",
			"dbus-run-session",
			"--",
			"bash",
			"scripts/desktop-gui-session.sh",
		],
		{
			timeout: 600000,
			env: {
				...process.env,
				Z8_GUI_BINARY: "/usr/bin/z8-desktop",
				Z8_XDOTOOL: "/usr/bin/xdotool",
				Z8_GUI_OUTPUT: join(root, "gui"),
				Z8_GUI_SESSION_ROOT: session,
			},
		},
	);
	const report = JSON.parse(
		await readFile(join(root, "gui/report.json"), "utf8"),
	);
	validatePackagedGuiReport(report, {
		arch: source.arch,
		sha256: app.sha256,
	});
	assert.deepEqual(await fileInfo("/usr/bin", "z8-desktop"), app);
	assert.deepEqual(await fileInfo(input, source.file), artifact);
	files = {};
	for (const name of await readdir(join(root, "gui/results")))
		files[name] = await fileInfo(join(root, "gui/results"), name);
	assert.ok(Object.keys(files).length > 0);
} catch (error) {
	failure = error;
}
try {
	await run("sudo", ["-n", "apt-get", "purge", "-y", "z8-work"]);
	await assert.rejects(lstat("/usr/bin/z8-desktop"), { code: "ENOENT" });
	for (const [name, info] of Object.entries(files ?? {}))
		assert.deepEqual(await fileInfo(join(root, "gui/results"), name), info);
} catch (error) {
	failure = failure
		? new AggregateError([failure, error], "GUI and uninstall failed")
		: error;
}
await writeFile(
	join(root, "report.json"),
	JSON.stringify(
		{
			status: failure ? "failed" : "passed",
			gui: failure ? "not-accepted" : "passed",
			installation: "native-github-runner",
			source,
			application: app,
			resultsRetained: files ?? null,
			error: failure?.message,
			upgrade: "not-run",
			networkIsolation: "not-run",
		},
		null,
		2,
	) + "\n",
);
if (failure) throw failure;
