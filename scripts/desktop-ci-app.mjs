// Native CI application artifacts, deliberately separate from runnable engine bundles.
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile, cp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileInfo } from "./lib/desktop-sources.mjs";
const matrix = JSON.parse(
	await readFile("packaging/desktop/ci-matrix.json", "utf8"),
);
const entry = matrix.find((e) => e.id === process.argv[2]);
if (
	!entry ||
	(entry.os === "windows"
		? "win32"
		: entry.os === "macos"
			? "darwin"
			: "linux") !== process.platform ||
	(entry.arch === "aarch64" ? "arm64" : "x64") !== process.arch
)
	throw new Error("Expected a matching native CI host");
const root = resolve(".desktop-local/ci");
await mkdir(root, { recursive: true });
const run = (cmd, args) =>
	execFileSync(cmd, args, { stdio: "inherit", timeout: 45 * 60 * 1000 });
run(process.execPath, [
	"scripts/desktop-windows-inputs.mjs",
	"--output",
	join(root, "build-inputs.json"),
]);
const common = [
	"--locked",
	"--manifest-path",
	"src-tauri/Cargo.toml",
	"--release",
	"--target",
	entry.target,
	"--no-default-features",
];
if (entry.os === "windows")
	common.push("--config", "packaging/desktop/windows/cargo-config.toml");
const features =
	"packaged-engines,custom-protocol" +
	(entry.os === "linux" ? ",gtk-dialog" : "");
run("cargo", ["build", ...common, "-p", "z8-desktop", "--features", features]);
run("cargo", ["test", ...common, "-p", "z8-native"]);
const payload = join(root, "application");
await mkdir(payload);
const binary = "z8-desktop" + (entry.os === "windows" ? ".exe" : "");
await copyFile(
	`src-tauri/target/${entry.target}/release/${binary}`,
	join(payload, binary),
);
// copyFile retains executable mode on Unix; assert the actual executable can start.
run(join(payload, binary), [
	"--build-info-file",
	join(root, "build-info.json"),
]);
const info = JSON.parse(await readFile(join(root, "build-info.json"), "utf8"));
if (
	info.os !== entry.os ||
	info.arch !== entry.arch ||
	info.debug !== false ||
	info.customProtocol !== true ||
	info.engines !== "bundled" ||
	info.updater !== false
)
	throw new Error("Unexpected compiled build information");
run(process.execPath, [
	"scripts/desktop-notices.mjs",
	"--output",
	join(root, "notices"),
	"--target",
	entry.target,
]);
await cp(join(root, "notices"), join(payload, "notices"), { recursive: true });
await copyFile("LICENSE", join(payload, "LICENSE"));
await writeFile(
	join(payload, "README.txt"),
	`Z8.Work ${info.version} ${entry.id} - APPLICATION ONLY\n\nThis native application binary does not include conversion engines and is not a usable converter package.\nIt is provided for build validation and downstream packaging. See docs/desktop/GITHUB_BUILDS.md.\nNo installer, signing, notarization or Store approval is implied.\n`,
);
const receipt = {
	schema: 1,
	scope: "application-only",
	entry,
	info,
	binary: await fileInfo(payload, binary),
	enginesIncluded: false,
	nativeGui: "not-run",
	publicRelease: false,
};
await writeFile(
	join(payload, "application.json"),
	JSON.stringify(receipt, null, 2) + "\n",
);
if (entry.os === "windows" || entry.os === "macos") {
	const tools = join(root, "validation");
	await mkdir(tools);
	run("cargo", [
		"build",
		...common,
		"-p",
		"z8-native",
		"--features",
		"engine-validation",
		"--bin",
		"bundle-check",
		"--bin",
		"validation-run",
	]);
	for (const name of ["bundle-check", "validation-run"].map(
		(n) => n + (entry.os === "windows" ? ".exe" : ""),
	))
		await copyFile(
			`src-tauri/target/${entry.target}/release/${name}`,
			join(tools, name),
		);
	const output = execFileSync(
		"cargo",
		[
			"test",
			...common,
			"-p",
			"z8-native",
			"--no-run",
			"--message-format=json",
		],
		{ encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
	);
	const tests = output
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l))
		.filter(
			(v) =>
				v.reason === "compiler-artifact" &&
				v.target.name === "z8_native" &&
				v.profile.test &&
				v.executable,
		);
	if (tests.length !== 1)
		throw new Error("Expected exactly one native test executable");
	await copyFile(
		tests[0].executable,
		join(tools, "native-tests" + (entry.os === "windows" ? ".exe" : "")),
	);
}
run(process.execPath, [
	"scripts/desktop-windows-inputs.mjs",
	"--verify",
	join(root, "build-inputs.json"),
]);
await mkdir(join(root, "downloads"));
const archive = `Z8.Work-${info.version}-${entry.id}-application-only.tar.gz`;
run("tar", [
	"-czf",
	join(root, "downloads", archive),
	"-C",
	root,
	"application",
]);
const hash = await fileInfo(join(root, "downloads"), archive);
await writeFile(
	join(root, "downloads", "SHA256SUMS"),
	`${hash.sha256}  ${archive}\n`,
);
