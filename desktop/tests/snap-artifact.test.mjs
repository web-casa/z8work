import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp,
	mkdir,
	writeFile,
	readFile,
	rm,
	chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const available = !spawnSync("mksquashfs", ["-version"], { stdio: "ignore" })
	.error;
const hash = (b) => createHash("sha256").update(b).digest("hex");
const save = async (root, name, body) => {
	await mkdir(dirname(join(root, name)), { recursive: true });
	await writeFile(join(root, name), body);
};
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-snap-artifact-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const stage = join(root, "stage"),
		resource = "usr/lib/Z8.Work Desktop Dev/engines";
	const app = Buffer.alloc(64);
	app.set([127, 69, 76, 70, 2, 1]);
	app.writeUInt16LE(62, 18);
	await save(stage, "usr/bin/z8-desktop", app);
	await chmod(join(stage, "usr/bin/z8-desktop"), 0o755);
	const manifest = {
		schema: 2,
		kind: "bundled",
		os: "linux",
		arch: "x86_64",
		engines: {},
		files: {},
	};
	for (const id of ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]) {
		const file = "bin/" + id;
		await save(stage, resource + "/" + file, app);
		manifest.files[file] = { sha256: hash(app), bytes: app.length };
		manifest.engines[id] = { path: file, sha256: hash(app) };
	}
	const provenance = JSON.stringify({
		schema: 1,
		host: 'ID=ubuntu\nVERSION_ID="24.04"',
		packages: {},
		resources: {},
	});
	await save(stage, resource + "/provenance.json", provenance);
	manifest.files["provenance.json"] = {
		sha256: hash(provenance),
		bytes: Buffer.byteLength(provenance),
	};
	const body = JSON.stringify(manifest);
	await save(stage, resource + "/engines.json", body);
	for (const file of [
		"meta/gui/z8-work.desktop",
		"usr/share/icons/hicolor/192x192/apps/z8-work.png",
		"usr/share/licenses/z8-work/LICENSE",
	])
		await save(stage, file, "fixture");
	await save(
		stage,
		"meta/gui/z8-work.desktop",
		await readFile("packaging/desktop/snap/z8-work.desktop"),
	);
	await save(
		stage,
		"usr/share/icons/hicolor/192x192/apps/z8-work.png",
		await readFile("src-tauri/icons/icon.png"),
	);
	for (const command of ["gpu-2404-wrapper", "desktop-launch", "run"]) {
		const file = "snap/command-chain/" + command;
		await save(stage, file, "#!/bin/sh\nexit 0\n");
		await chmod(join(stage, file), 0o755);
	}
	await save(
		stage,
		"meta/snap.yaml",
		JSON.stringify({
			name: "z8-work",
			version: "0.1.0",
			base: "core24",
			grade: "devel",
			confinement: "strict",
			architectures: ["amd64"],
			apps: {
				"z8-work": {
					command: "usr/bin/z8-desktop",
					plugs: ["home", "removable-media"],
					"command-chain": [
						"snap/command-chain/gpu-2404-wrapper",
						"snap/command-chain/desktop-launch",
					],
				},
			},
		}),
	);
	await save(
		root,
		"prepared.json",
		JSON.stringify({
			schema: 1,
			artifact: "linux-amd64-snap",
			version: "0.1.0",
			applicationSha256: hash(app),
			engineManifestSha256: hash(body),
			buildInfo: {
				schema: 1,
				version: "0.1.0",
				os: "linux",
				arch: "x86_64",
				engines: "bundled",
				debug: false,
				customProtocol: true,
				processLifetime: "watchdog-pipe-v1",
				updater: false,
				fileDialog: "xdg-portal",
				resourceDirectoryName: "Z8.Work Desktop Dev",
			},
		}),
	);
	return { root, stage, resource };
}
function pack(f, name) {
	const output = join(f.root, name + ".snap");
	execFileSync(
		"mksquashfs",
		[f.stage, output, "-noappend", "-no-progress", "-processors", "1"],
		{ stdio: "pipe", timeout: 15000 },
	);
	return output;
}
function check(f, file, name) {
	return execFileSync(
		process.execPath,
		[
			"scripts/desktop-snap-check.mjs",
			"--artifact",
			file,
			"--prepared",
			join(f.root, "prepared.json"),
			"--output",
			join(f.root, name + ".json"),
		],
		{ stdio: "pipe", timeout: 15000 },
	);
}
test(
	"final Snap byte inspection stays distinct from runtime and installation acceptance",
	{ skip: !available },
	async (t) => {
		const f = await fixture(t);
		check(f, pack(f, "valid"), "result");
		const report = JSON.parse(
			await readFile(join(f.root, "result.json"), "utf8"),
		);
		assert.equal(report.checks.integrity.status, "passed");
		assert.equal(report.checks.conversion.status, "not-run");
		assert.equal(report.checks["strict-confinement"].status, "not-run");
	},
);
test(
	"final Snap inspection rejects changed engines, missing helpers and non-executable applications",
	{ skip: !available },
	async (t) => {
		const f = await fixture(t);
		await chmod(join(f.stage, "usr/bin/z8-desktop"), 0o644);
		assert.throws(
			() => check(f, pack(f, "mode"), "bad-mode"),
			/not executable/,
		);
		await chmod(join(f.stage, "usr/bin/z8-desktop"), 0o755);
		await rm(join(f.stage, "snap/command-chain/run"));
		assert.throws(
			() => check(f, pack(f, "missing-helper"), "bad-helper"),
			/ENOENT/,
		);
		await save(f.stage, "snap/command-chain/run", "#!/bin/sh\nexit 0\n");
		await chmod(join(f.stage, "snap/command-chain/run"), 0o755);
		await writeFile(join(f.stage, f.resource, "bin/magick"), "changed");
		assert.throws(
			() => check(f, pack(f, "tampered"), "bad-engine"),
			/integrity mismatch/,
		);
	},
);
