import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	mkdtemp,
	mkdir,
	copyFile,
	writeFile,
	readFile,
	rm,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

test("source receipt detects fixture/config/addition/deletion drift and excludes ignored secrets", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "z8 inputs "));
	t.after(() => rm(root, { recursive: true, force: true }));
	const git = (...args) =>
		execFileSync("git", args, { cwd: root, stdio: "pipe", timeout: 10000 });
	const put = async (name, body) => {
		await mkdir(dirname(join(root, name)), { recursive: true });
		await writeFile(join(root, name), body);
	};
	for (const name of [
		"scripts/desktop-windows-inputs.mjs",
		"scripts/lib/desktop-artifacts.mjs",
		"scripts/lib/desktop-inputs.mjs",
	]) {
		await mkdir(dirname(join(root, name)), { recursive: true });
		await copyFile(
			new URL(`../../${name}`, import.meta.url),
			join(root, name),
		);
	}
	await put(".gitignore", ".env\n.desktop-local/\n");
	await put("tests/fixtures/input.png", "fixture");
	await put("rust-toolchain.toml", "toolchain");
	await put(".env", "FAKE_TEST_ONLY=do-not-archive");
	await mkdir(join(root, ".desktop-local"));
	git("init", "--quiet");
	git("add", ".");
	git(
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.invalid",
		"-c",
		"commit.gpgsign=false",
		"commit",
		"--quiet",
		"-m",
		"fixture",
	);
	const receipt = join(root, ".desktop-local/inputs.json");
	const run = (flag) =>
		execFileSync(
			process.execPath,
			[join(root, "scripts/desktop-windows-inputs.mjs"), flag, receipt],
			{ cwd: root, stdio: "pipe", timeout: 10000 },
		);
	run("--output");
	run("--verify");
	const bytes = await readFile(receipt, "utf8");
	const record = JSON.parse(bytes);
	assert.ok(record.files["tests/fixtures/input.png"]);
	assert.ok(record.files["rust-toolchain.toml"]);
	assert.ok(!record.files[".env"]);
	assert.throws(() => run("--output"));
	assert.equal(await readFile(receipt, "utf8"), bytes);
	await put(".env", "FAKE_TEST_ONLY=changed");
	run("--verify");
	for (const [name, original] of [
		["tests/fixtures/input.png", "fixture"],
		["rust-toolchain.toml", "toolchain"],
	]) {
		await put(name, "changed");
		assert.throws(() => run("--verify"));
		await put(name, original);
	}
	await put("desktop/new.ts", "export {};");
	assert.throws(() => run("--verify"));
	await rm(join(root, "desktop/new.ts"));
	await rm(join(root, "tests/fixtures/input.png"));
	assert.throws(() => run("--verify"));
	await put("tests/fixtures/input.png", "fixture");
	if (process.platform !== "win32") {
		await symlink(join(root, ".env"), join(root, "desktop/secret-link"));
		assert.throws(() => run("--verify"));
		await rm(join(root, "desktop/secret-link"));
	}
	run("--verify");
});
