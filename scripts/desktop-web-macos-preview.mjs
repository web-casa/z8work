import { execFileSync } from "node:child_process";
import {
	readFile,
	readdir,
	mkdir,
	copyFile,
	writeFile,
	stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

assert.equal(process.platform, "darwin", "Run on a native macOS runner");
assert.equal(process.arch, "arm64", "Run on an Apple Silicon runner");
const run = (file, args) =>
	execFileSync(file, args, { encoding: "utf8", timeout: 120000 }).trim();
const config = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const bundle = resolve("src-tauri/target/aarch64-apple-darwin/release/bundle");
const app = join(bundle, "macos", `${config.productName}.app`);
const plist = join(app, "Contents", "Info.plist");
const value = (key) =>
	run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist]);
const binary = join(app, "Contents", "MacOS", value("CFBundleExecutable"));
const arch = run("lipo", ["-archs", binary]);
assert.equal(arch, "arm64");
assert.equal(value("CFBundleShortVersionString"), config.version);
assert.equal(value("CFBundleIdentifier"), config.identifier);
run("codesign", ["--verify", "--deep", "--strict", app]);
const dependencies = run("otool", ["-L", binary]);
assert.doesNotMatch(dependencies, /\/opt\/homebrew|\/usr\/local|\/Users\//);

const output = resolve(".desktop-local/macos-web-preview");
await mkdir(output, { recursive: true });
const zip = `Z8.Work-${config.version}-macos-arm64-preview.app.zip`;
run("ditto", [
	"-c",
	"-k",
	"--sequesterRsrc",
	"--keepParent",
	app,
	join(output, zip),
]);
// Verify the actual downloadable ZIP retains executable mode and valid signing.
const extracted = resolve(".desktop-local/macos-web-preview-extracted");
run("ditto", ["-x", "-k", join(output, zip), extracted]);
const extractedApp = join(extracted, `${config.productName}.app`);
run("codesign", ["--verify", "--deep", "--strict", extractedApp]);
assert.ok(
	(
		await stat(
			join(
				extractedApp,
				"Contents",
				"MacOS",
				value("CFBundleExecutable"),
			),
		)
	).mode & 0o111,
);
const dmgs = (await readdir(join(bundle, "dmg"))).filter((name) =>
	name.endsWith(".dmg"),
);
assert.equal(dmgs.length, 1);
const dmg = `Z8.Work-${config.version}-macos-arm64-preview.dmg`;
await copyFile(join(bundle, "dmg", dmgs[0]), join(output, dmg));
run("hdiutil", ["verify", join(output, dmg)]);
const files = [];
for (const name of [zip, dmg]) {
	const bytes = await readFile(join(output, name));
	files.push({
		name,
		bytes: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	});
}
const report = {
	version: config.version,
	identifier: config.identifier,
	source: run("git", ["rev-parse", "HEAD"]),
	runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
	arch,
	os: run("sw_vers", ["-productVersion"]),
	signing: "ad-hoc",
	notarization: "not performed",
	guiConversion: "not performed; user testing requested",
	dependencies,
	files,
};
await writeFile(
	join(output, "build-report.json"),
	JSON.stringify(report, null, 2) + "\n",
);
await writeFile(
	join(output, "SHA256SUMS"),
	files.map((f) => `${f.sha256}  ${f.name}`).join("\n") + "\n",
);
await writeFile(
	join(output, "README.txt"),
	`Z8.Work ${config.version} — macOS Apple Silicon 测试版\n\n优先下载 DMG，打开后将应用拖入 Applications。APP ZIP 为备用包。\n当前构建仅临时签名，未经 Apple 公证，首次打开可能被 macOS 安全检查拦截。\n内置网页 WASM 转换引擎，无需安装 FFmpeg 等转换软件。\n请测试图片、音频、文档、PDF 的导入、转换、保存和取消。退出前请保存结果，队列不会跨重启保留。\n\n源码：${report.source}\n构建：${report.runUrl}\n架构、签名完整性及 DMG/ZIP 核验通过；本包尚未完成真实 GUI 转换验收。\n`,
);
console.log(JSON.stringify(report, null, 2));
