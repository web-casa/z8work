import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	inspectMachO,
	resolveDependency,
	inspectMacBundle,
} from "../../scripts/lib/desktop-macos.mjs";
import { sha256 } from "../../scripts/lib/desktop-artifacts.mjs";
import { execFileSync } from "node:child_process";
function macho(type = 2, deps = []) {
	const commands = deps.map((name) => {
		const value = Buffer.from(name + "\0"),
			cmd = Buffer.alloc(Math.ceil((24 + value.length) / 8) * 8);
		cmd.writeUInt32LE(12);
		cmd.writeUInt32LE(cmd.length, 4);
		cmd.writeUInt32LE(24, 8);
		value.copy(cmd, 24);
		return cmd;
	});
	const header = Buffer.alloc(32);
	header.writeUInt32LE(0xfeedfacf);
	header.writeUInt32LE(0x0100000c, 4);
	header.writeUInt32LE(type, 12);
	header.writeUInt32LE(commands.length, 16);
	header.writeUInt32LE(
		commands.reduce((s, c) => s + c.length, 0),
		20,
	);
	return Buffer.concat([header, ...commands]);
}
test("Mach-O embedded loader environment is rejected", () => {
	const bytes = macho(2, ["DYLD_LIBRARY_PATH=/opt/homebrew/lib"]);
	bytes.writeUInt32LE(0x27, 32);
	assert.throws(() => inspectMachO(bytes), /Embedded DYLD/);
});
test("macOS assembler creates a checked inventory without executing foreign code and refuses overwrite", async (t) => {
	const base = await mkdtemp(join(tmpdir(), "z8-mac-assemble-"));
	t.after(() => rm(base, { recursive: true, force: true }));
	const root = join(base, "resources"),
		output = join(base, "bundle");
	await mkdir(root);
	for (const [name, bytes] of Object.entries({
		"bin/tool": macho(),
		"validation/bundle-check": macho(),
		"licenses/NOTICE": Buffer.from("fixture notice"),
	})) {
		await mkdir(join(root, name, ".."), { recursive: true });
		await writeFile(join(root, name), bytes);
	}
	const source = join(base, "development.json"),
		record = join(base, "record.json");
	await writeFile(
		source,
		JSON.stringify({
			schema: 1,
			kind: "development",
			engines: Object.fromEntries(
				["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"].map(
					(id) => [
						id,
						{
							path: join(root, "bin/tool"),
							sha256: sha256(macho()),
							version: "fixture",
						},
					],
				),
			),
		}),
	);
	await writeFile(
		record,
		JSON.stringify({
			schema: 1,
			os: "macos",
			arch: "aarch64",
			sources: [{ scope: "test-only" }],
			redistributionApproved: false,
		}),
	);
	const args = [
		"scripts/desktop-bundle-macos.mjs",
		"--resources",
		root,
		"--manifest",
		source,
		"--record",
		record,
		"--output",
		output,
	];
	const report = JSON.parse(
		execFileSync(process.execPath, args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}),
	);
	assert.equal(report.execution, "not-run");
	assert.equal(report.machObjects, 2);
	assert.equal(report.redistributionApproved, false);
	assert.throws(() =>
		execFileSync(process.execPath, args, { stdio: "pipe" }),
	);
	assert.equal((await inspectMacBundle(output)).manifest.arch, "aarch64");
});
test("Mach-O parser rejects x64, fat, truncated and malformed load commands", () => {
	const bytes = macho(2, ["@loader_path/../lib/a.dylib"]);
	assert.deepEqual(inspectMachO(bytes).dependencies, [
		"@loader_path/../lib/a.dylib",
	]);
	for (const edit of [
		(b) => b.writeUInt32LE(0x01000007, 4),
		(b) => b.writeUInt32LE(0xcafebabe),
		(b) => b.writeUInt32LE(0xffffffff, 20),
		(b) => b.writeUInt32LE(4, 36),
		(b) => b.writeUInt32LE(0xffff, 40),
	]) {
		const changed = Buffer.from(bytes);
		edit(changed);
		assert.throws(() => inspectMachO(changed));
	}
	assert.throws(() => inspectMachO(bytes.subarray(0, 40)));
});
test("dyld closure rejects builder paths, rpath ambiguity and escaping loader paths", () => {
	assert.deepEqual(
		resolveDependency(
			"@loader_path/../lib/a.dylib",
			"bin/magick",
			"bin/magick",
		),
		{ local: "lib/a.dylib" },
	);
	assert.deepEqual(
		resolveDependency("/usr/lib/libSystem.B.dylib", "bin/magick"),
		{ system: "/usr/lib/libSystem.B.dylib" },
	);
	for (const name of [
		"/opt/homebrew/lib/a.dylib",
		"/usr/local/lib/a.dylib",
		"@rpath/a.dylib",
		"@loader_path/../../escape",
		"/usr/lib/../../opt/a.dylib",
		"@executable_path/a.dylib",
	])
		assert.throws(() => resolveDependency(name, "lib/a.dylib"));
});
test("macOS bundle checks every code resource and refuses missing, changed and linked dependencies", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "z8-macos-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const files = {
		"bin/tool": macho(2, ["@loader_path/../lib/a.dylib"]),
		"lib/a.dylib": macho(6, ["/usr/lib/libSystem.B.dylib"]),
		"validation/bundle-check": macho(),
		"provenance.json": Buffer.from('{"schema":1}'),
	};
	for (const [name, bytes] of Object.entries(files)) {
		await mkdir(join(root, name, ".."), { recursive: true });
		await writeFile(join(root, name), bytes);
	}
	const manifest = {
		schema: 2,
		kind: "bundled",
		os: "macos",
		arch: "aarch64",
		engines: Object.fromEntries(
			["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"].map((id) => [
				id,
				{
					path: "bin/tool",
					sha256: sha256(files["bin/tool"]),
					version: "fixture",
				},
			]),
		),
		files: Object.fromEntries(
			Object.entries(files).map(([name, b]) => [
				name,
				{ sha256: sha256(b), bytes: b.length },
			]),
		),
	};
	await writeFile(join(root, "engines.json"), JSON.stringify(manifest));
	assert.equal((await inspectMacBundle(root)).machObjects, 3);
	await writeFile(join(root, "lib/a.dylib"), macho(2));
	await assert.rejects(inspectMacBundle(root), /integrity/);
	await rm(join(root, "lib/a.dylib"));
	await assert.rejects(inspectMacBundle(root), /Missing/);
	if (process.platform !== "win32") {
		await symlink(join(root, "bin/tool"), join(root, "lib/a.dylib"));
		await assert.rejects(inspectMacBundle(root), /Non-regular/);
	}
});
