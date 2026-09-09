import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { sha256 } from "../../scripts/lib/desktop-artifacts.mjs";
import { inspectBundle } from "../../scripts/lib/desktop-sources.mjs";
import { validateConversions } from "../../scripts/lib/desktop-snap-installed.mjs";
import {
	windowsResource,
	validateWindowsLock,
	assembleWindowsBundle,
	readWindowsLock,
} from "../../scripts/lib/desktop-windows-bundle.mjs";

// Structural PE fixture only; these bytes are never executed.
function pe(dll = false) {
	const b = Buffer.alloc(1024);
	for (const [at, value] of [
		[0, 0x5a4d],
		[132, 0x8664],
		[134, 1],
		[148, 240],
		[150, dll ? 0x2002 : 2],
		[152, 0x20b],
		[220, 3],
	])
		b.writeUInt16LE(value, at);
	for (const [at, value] of [
		[60, 128],
		[128, 0x4550],
		[260, 16],
		[400, 512],
		[404, 4096],
		[408, 512],
		[412, 512],
	])
		b.writeUInt32LE(value, at);
	return b;
}
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-bundle-win-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const archives = join(root, "archives"),
		extracted = join(root, "extracted");
	await mkdir(archives);
	await mkdir(extracted);
	const lock = {
		schema: 1,
		os: "windows",
		arch: "x86_64",
		redistributionApproved: false,
		sources: [],
	};
	for (const id of ["magick", "ffmpeg", "pandoc", "mutool", "vcredist"]) {
		await mkdir(join(extracted, id));
		const bytes = Buffer.from(id),
			archive = {
				file: `${id}.zip`,
				url: `https://example.invalid/${id}.zip`,
				bytes: bytes.length,
				sha256: sha256(bytes),
			};
		await writeFile(join(archives, archive.file), bytes);
		const source = {
			id,
			version: "1.0",
			archive,
			extractor: "7z",
			files: [],
		};
		const names =
			id === "vcredist"
				? ["runtime.dll"]
				: id === "ffmpeg"
					? ["ffmpeg.exe", "ffprobe.exe"]
					: [`${id}.exe`];
		if (id === "magick") names.push("colors.xml");
		for (const name of names) {
			const content = name.endsWith(".xml")
				? Buffer.from("<colors/>")
				: pe(name.endsWith(".dll"));
			await writeFile(join(extracted, id, name), content);
			source.files.push({
				from: name,
				to: name.endsWith(".xml")
					? "magick-config/colors.xml"
					: `bin/${name}`,
				bytes: content.length,
				sha256: sha256(content),
			});
		}
		lock.sources.push(source);
	}
	const verifier = join(root, "verifier.exe");
	await writeFile(verifier, pe());
	return {
		root,
		lock,
		archives,
		extracted,
		verifier,
		output: join(root, "bundle"),
	};
}

test("Windows source lock is pinned and rejects unsafe paths, collisions and incomplete inputs", async () => {
	const lock = await readWindowsLock();
	validateWindowsLock(lock);
	for (const path of [
		"../x",
		"/root",
		"x\\y",
		"a:",
		"bin/NUL.dll",
		"bin/x.",
		"bin/x ",
		"x?",
		"bin/a\n",
	])
		assert.throws(() => windowsResource(path));
	assert.equal(windowsResource("bin/magick.exe"), "bin/magick.exe");
	for (const change of [
		(l) => {
			l.sources[0].archive.sha256 = "x";
		},
		(l) => {
			l.sources[1].id = "magick";
		},
		(l) => {
			l.sources[0].files.push({
				...l.sources[0].files[0],
				to: "BIN/MAGICK.EXE",
			});
		},
		(l) => {
			l.sources[0].files = l.sources[0].files.filter(
				(f) => !f.to.endsWith("colors.xml"),
			);
		},
		(l) => {
			l.redistributionApproved = true;
		},
	]) {
		const changed = structuredClone(lock);
		change(changed);
		assert.throws(() => validateWindowsLock(changed));
	}
});

test("assembler creates a schema 2 bundle with exact copied hashes and no host fallback", async (t) => {
	const f = await fixture(t),
		bundle = await assembleWindowsBundle(f);
	assert.equal(bundle.manifest.os, "windows");
	assert.equal(Object.keys(bundle.manifest.engines).length, 5);
	assert.equal(bundle.manifest.loader, null);
	assert.equal(bundle.provenance.redistributionApproved, false);
	assert.equal(bundle.provenance.execution, "not-run");
	await assert.rejects(inspectBundle(f.output), /linux/);
	const before = await readFile(join(f.output, "engines.json"));
	await assert.rejects(assembleWindowsBundle(f), /EEXIST/);
	assert.deepEqual(await readFile(join(f.output, "engines.json")), before);
	await writeFile(join(f.output, "unlisted.txt"), "unlisted");
	await assert.rejects(inspectBundle(f.output, "windows"), /unlisted/);
});

test("assembler rejects corrupted archives before extraction", async (t) => {
	const f = await fixture(t);
	await writeFile(join(f.archives, "magick.zip"), "xxxxxx");
	await assert.rejects(assembleWindowsBundle(f), /Archive hash mismatch/);
});

test("assembler rejects tampered extracted resources even with a valid archive receipt", async (t) => {
	const f = await fixture(t);
	await writeFile(
		join(f.extracted, "magick", "magick.exe"),
		Buffer.alloc(1024),
	);
	await assert.rejects(
		assembleWindowsBundle(f),
		/Extracted resource mismatch/,
	);
});

test("assembler detects wrong PE architecture independently of file hashes", async (t) => {
	const f = await fixture(t),
		b = pe();
	b.writeUInt16LE(0xaa64, 132);
	await writeFile(join(f.extracted, "magick", "magick.exe"), b);
	f.lock.sources[0].files[0].sha256 = sha256(b);
	await assert.rejects(assembleWindowsBundle(f), /x64 PE machine/);
});

test("Windows matrix validation keeps Linux default and requires all decoded routes", async () => {
	const sample = JSON.parse(
		await readFile(
			new URL(
				"../../docs/desktop/evidence/phase27/formats.json",
				import.meta.url,
			),
		),
	);
	// Synthetic platform label only; this is a parser test.
	sample.platform = "linux-x86_64";
	validateConversions(sample);
	sample.platform = "windows-x86_64";
	assert.throws(() => validateConversions(sample));
	validateConversions(sample, "windows-x86_64");
	assert.throws(() => validateConversions(sample, "other"));
	sample.routes[0].decoded = false;
	assert.throws(
		() => validateConversions(sample, "windows-x86_64"),
		/decoded/,
	);
});

test("engine CLI records static checks and blocks execution on the wrong host", async (t) => {
	const f = await fixture(t);
	await assembleWindowsBundle(f);
	const run = (path, args = []) =>
		execFileSync(
			process.execPath,
			[
				"scripts/desktop-windows-engines-check.mjs",
				"--root",
				f.output,
				"--output",
				path,
				...args,
			],
			{ stdio: "pipe", timeout: 10000 },
		);
	const output = join(f.root, "static");
	run(output);
	const report = JSON.parse(await readFile(join(output, "report.json")));
	assert.equal(report.checks.static, "passed");
	assert.equal(report.checks.conversions, "not-run");
	assert.equal(report.redistributionApproved, false);
	assert.equal(report.acceptance, "incomplete");
	if (process.platform !== "win32") {
		const blocked = join(f.root, "blocked");
		assert.throws(
			() => run(blocked, ["--runtime", "native", "--full"]),
			(e) => e.status === 2,
		);
		assert.equal(
			JSON.parse(await readFile(join(blocked, "report.json"))).checks
				.nativeWindows,
			"not-run",
		);
	}
});
