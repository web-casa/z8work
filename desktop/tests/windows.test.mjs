import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp,
	mkdir,
	writeFile,
	readFile,
	rm,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
	inspectPe,
	inspectWindowsTree,
	dependencyKind,
} from "../../scripts/lib/desktop-windows.mjs";

// Minimal synthetic PE32+ metadata fixture; never executed or called a real app.
function fixture({
	imports = ["KERNEL32.dll"],
	delayed = [],
	dll = false,
} = {}) {
	const bytes = Buffer.alloc(4096),
		pe = 128,
		opt = pe + 24,
		section = opt + 240;
	bytes.writeUInt16LE(0x5a4d);
	bytes.writeUInt32LE(pe, 0x3c);
	bytes.writeUInt32LE(0x4550, pe);
	bytes.writeUInt16LE(0x8664, pe + 4);
	bytes.writeUInt16LE(1, pe + 6);
	bytes.writeUInt16LE(240, pe + 20);
	bytes.writeUInt16LE(2 | (dll ? 0x2000 : 0), pe + 22);
	bytes.writeUInt16LE(0x20b, opt);
	bytes.writeUInt16LE(2, opt + 68);
	bytes.writeUInt32LE(16, opt + 108);
	bytes.writeUInt32LE(3584, section + 8);
	bytes.writeUInt32LE(0x1000, section + 12);
	bytes.writeUInt32LE(3584, section + 16);
	bytes.writeUInt32LE(512, section + 20);
	const rva = (offset) => offset - 512 + 0x1000;
	const directory = (index, offset, size) => {
		bytes.writeUInt32LE(rva(offset), opt + 112 + index * 8);
		bytes.writeUInt32LE(size, opt + 116 + index * 8);
	};
	directory(2, 3000, 16);
	let nameOffset = 1800;
	for (const [index, offset, stride, names] of [
		[1, 512, 20, imports],
		[13, 1000, 32, delayed],
	]) {
		if (!names.length) continue;
		directory(index, offset, stride * (names.length + 1));
		for (const [n, name] of names.entries()) {
			if (index === 13) bytes.writeUInt32LE(1, offset + n * stride);
			bytes.writeUInt32LE(
				rva(nameOffset),
				offset + n * stride + (index === 13 ? 4 : 12),
			);
			bytes.write(name, nameOffset, "ascii");
			nameOffset += name.length + 1;
		}
	}
	return bytes;
}

async function temporary(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-windows-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return root;
}

test("PE parser extracts normal and delay DLL imports, kind and resources", () => {
	const pe = inspectPe(
		fixture({
			imports: ["KERNEL32.dll", "helper.dll"],
			delayed: ["WebView2Loader.dll"],
		}),
	);
	assert.deepEqual(pe.imports, ["helper.dll", "kernel32.dll"]);
	assert.deepEqual(pe.delayImports, ["webview2loader.dll"]);
	assert.equal(pe.kind, "exe");
	assert.equal(pe.arch, "x86_64");
	assert.equal(pe.resourcesPresent, true);
	assert.equal(pe.certificateTablePresent, false);
	assert.equal(inspectPe(fixture({ dll: true })).kind, "dll");
});

test("PE parser rejects truncation, wrong architecture and malformed tables", () => {
	for (const length of [0, 20, 64, 160, 600, 1900])
		assert.throws(() => inspectPe(fixture().subarray(0, length)));
	for (const mutate of [
		(b) => b.writeUInt16LE(0xaa64, 132),
		(b) => b.writeUInt32LE(0xffffffff, 0x3c),
		(b) => b.writeUInt16LE(97, 134),
		(b) => b.writeUInt32LE(17, 260),
		(b) => b.writeUInt32LE(0xffffffff, 524),
		(b) => b.writeUInt32LE(0, 1000),
	]) {
		const bytes = fixture({ delayed: ["helper.dll"] });
		mutate(bytes);
		assert.throws(() => inspectPe(bytes));
	}
});

test("PE import descriptors require bounded terminators and safe module names", () => {
	const unterminated = fixture();
	unterminated.writeUInt32LE(20, 152 + 116 + 8);
	assert.throws(() => inspectPe(unterminated), /Unterminated/);
	assert.throws(
		() => inspectPe(fixture({ imports: ["../escape.dll"] })),
		/Invalid PE DLL/,
	);
	assert.throws(
		() => inspectPe(fixture({ imports: ["x".repeat(260)] })),
		/Unterminated/,
	);
});

test("PE rejects ambiguous sections and invalid certificate file offsets", () => {
	const overlapping = fixture();
	overlapping.writeUInt16LE(2, 134);
	overlapping.copy(overlapping, 432, 392, 432);
	assert.throws(() => inspectPe(overlapping), /Overlapping/);
	const certificate = fixture();
	certificate.writeUInt32LE(4000, 152 + 112 + 4 * 8);
	certificate.writeUInt32LE(200, 152 + 116 + 4 * 8);
	assert.throws(() => inspectPe(certificate), /range/);
});

test("VC runtime and WebView2 loader are private dependencies", () => {
	for (const name of [
		"vcruntime140.dll",
		"vcruntime140_1.dll",
		"msvcp140.dll",
		"webview2loader.dll",
		"api-attacker.dll",
	])
		assert.equal(dependencyKind(name), "private");
	for (const name of [
		"kernel32.dll",
		"combase.dll",
		"api-ms-win-core-synch-l1-2-0.dll",
	])
		assert.equal(dependencyKind(name), "windows-contract");
});

test("tree resolves private DLLs recursively and exposes missing delay imports", async (t) => {
	const root = await temporary(t);
	await writeFile(
		join(root, "z8-desktop.exe"),
		fixture({ imports: ["helper.dll"] }),
	);
	await writeFile(
		join(root, "Helper.DLL"),
		fixture({ dll: true, delayed: ["vcruntime140.dll"] }),
	);
	const report = await inspectWindowsTree(root);
	assert.equal(report.images.length, 2);
	assert.deepEqual(
		report.missing.map((d) => d.name),
		["vcruntime140.dll"],
	);
	assert.equal(report.images[0].sha256.length, 64);
});

test("tree refuses engine DLL lookup through unrelated directories", async (t) => {
	const root = await temporary(t);
	await mkdir(join(root, "engine"));
	await writeFile(
		join(root, "engine", "magick.exe"),
		fixture({ imports: ["helper.dll"] }),
	);
	await writeFile(join(root, "helper.dll"), fixture({ dll: true }));
	assert.equal((await inspectWindowsTree(root)).missing.length, 1);
});

test("tree refuses DLL shadowing, wrong kind and symlinks", async (t) => {
	const root = await temporary(t);
	await writeFile(join(root, "app.exe"), fixture());
	await writeFile(
		join(root, "kernel32.dll"),
		fixture({ dll: true, imports: [] }),
	);
	await assert.rejects(inspectWindowsTree(root), /shadows/);
	await rm(join(root, "kernel32.dll"));
	await writeFile(join(root, "bad.dll"), fixture());
	await assert.rejects(inspectWindowsTree(root), /kind/);
	await rm(join(root, "bad.dll"));
	if (process.platform !== "win32") {
		await symlink(join(root, "app.exe"), join(root, "link.exe"));
		await assert.rejects(inspectWindowsTree(root), /Non-regular/);
	}
});

test(
	"tree rejects case-colliding package names on case-sensitive hosts",
	{ skip: process.platform !== "linux" },
	async (t) => {
		const root = await temporary(t);
		await writeFile(join(root, "app.exe"), fixture());
		await writeFile(join(root, "APP.EXE"), fixture());
		await assert.rejects(inspectWindowsTree(root), /collision/);
	},
);

test("CLI records static-only success, blocks foreign runtime and never overwrites", async (t) => {
	const root = await temporary(t),
		input = join(root, "application");
	await mkdir(input);
	await writeFile(join(input, "z8-desktop.exe"), fixture());
	const cli = (output, args = []) =>
		execFileSync(
			process.execPath,
			[
				"scripts/desktop-windows-check.mjs",
				"--root",
				input,
				"--output",
				output,
				...args,
			],
			{ encoding: "utf8", timeout: 10000, stdio: "pipe" },
		);
	const output = join(root, "static");
	cli(output);
	const report = JSON.parse(await readFile(join(output, "report.json")));
	assert.equal(report.status, "passed");
	assert.equal(report.checks.buildInfo, "not-run");
	assert.equal(report.acceptance, "incomplete");
	assert.equal(report.redistributionApproved, false);
	assert.throws(() => cli(output));
	if (process.platform !== "win32") {
		assert.throws(
			() => cli(join(root, "runtime"), ["--runtime"]),
			(e) => e.status === 2,
		);
		assert.equal(
			JSON.parse(await readFile(join(root, "runtime/report.json")))
				.status,
			"blocked",
		);
	}
	await writeFile(
		join(input, "z8-desktop.exe"),
		fixture({ imports: ["vcruntime140.dll"] }),
	);
	assert.throws(
		() => cli(join(root, "missing")),
		(e) => e.status === 1,
	);
	assert.match(
		JSON.parse(await readFile(join(root, "missing/report.json"))).error,
		/Missing private DLLs/,
	);
});

test("source receipts cover working-tree files and reject changed or overwritten evidence", async (t) => {
	const root = await temporary(t),
		record = join(root, "inputs.json");
	const run = (args) =>
		execFileSync(
			process.execPath,
			["scripts/desktop-windows-inputs.mjs", ...args],
			{ encoding: "utf8", timeout: 15000, stdio: "pipe" },
		);
	run(["--output", record]);
	run(["--verify", record]);
	const data = JSON.parse(await readFile(record));
	assert.ok(data.files["src-tauri/src/main.rs"]);
	assert.ok(data.files["src/lib/css/pixel.scss"]);
	assert.ok(data.files["src/lib/components/pixel/PixelIcon.svelte"]);
	assert.ok(data.files["postcss.config.js"]);
	assert.ok(data.files["packaging/desktop/windows/cargo-config.toml"]);
	assert.ok(
		!Object.keys(data.files).some(
			(p) => p.includes("/target/") || p.startsWith(".env"),
		),
	);
	assert.throws(() => run(["--output", record]));
	data.files["src-tauri/src/main.rs"].sha256 = "0".repeat(64);
	await writeFile(record, JSON.stringify(data));
	assert.throws(
		() => run(["--verify", record]),
		(e) => /inputs changed/.test(e.stderr),
	);
});

test("ARM64 PE inspection is explicit and does not relax the default x64 gate", () => {
	const bytes = fixture();
	bytes.writeUInt16LE(0xaa64, 132);
	assert.throws(() => inspectPe(bytes));
	assert.equal(inspectPe(bytes, "aarch64").arch, "aarch64");
	assert.throws(() => inspectPe(fixture(), "aarch64"));
});

test("Mixed-process architecture inspection rejects cross-architecture private DLL loading", async (t) => {
	const root = await temporary(t);
	const exe = fixture({ imports: ["helper.dll"] });
	exe.writeUInt16LE(0xaa64, 132);
	await writeFile(join(root, "app.exe"), exe);
	await writeFile(join(root, "helper.dll"), fixture({ dll: true }));
	await assert.rejects(
		inspectWindowsTree(root, (name) =>
			name === "app.exe" ? "aarch64" : "x86_64",
		),
		/Private DLL architecture mismatch/,
	);
});
