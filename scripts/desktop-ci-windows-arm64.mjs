// Native ARM64 application/ImageMagick, explicitly documented x64 subprocesses.
// Never load an x64 DLL into the ARM64 application process.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, cp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { sha256 } from "./lib/desktop-artifacts.mjs";
import { fileInfo, listFiles, inspectBundle } from "./lib/desktop-sources.mjs";
import { inspectWindowsTree } from "./lib/desktop-windows.mjs";
import {
	msixConfig,
	msixManifest,
	msixAssets,
	verifyMsixLayout,
	windowsPreviewArchitecture,
} from "./lib/desktop-msix.mjs";
import { validateQuality } from "./lib/desktop-snap-installed.mjs";
if (process.platform !== "win32" || process.arch !== "arm64")
	throw new Error("Native Windows ARM64 runner required");
const root = resolve(".desktop-local/windows-arm-preview");
await mkdir(root);
const source = resolve(".desktop-local/arm-source/engines");
await inspectBundle(source, "windows");
const sourceRecord = JSON.parse(
	await readFile(join(source, "provenance.json"), "utf8"),
);
const sourceLock = JSON.parse(
	await readFile("packaging/desktop/windows/engines.lock.json", "utf8"),
);
if (
	sourceRecord.sourceLockSha256 !==
		sha256(Buffer.from(JSON.stringify(sourceLock))) ||
	sourceRecord.scope !== "engine-resources-only"
)
	throw new Error("Unexpected engine source lock");
const candidate = join(root, "candidate");
await mkdir(candidate);
const engines = join(candidate, "engines");
await cp(source, engines, { recursive: true });
await mkdir(join(engines, "validation"));
await copyFile(
	".desktop-local/ci/application/z8-desktop.exe",
	join(candidate, "z8-desktop.exe"),
);
await copyFile(
	".desktop-local/ci/validation/bundle-check.exe",
	join(engines, "validation/bundle-check.exe"),
);
const run = (cmd, args, timeout = 120000) =>
	execFileSync(cmd, args, {
		encoding: "utf8",
		timeout,
		maxBuffer: 32 * 1024 ** 2,
	});
const magickSource = {
	url: "https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-31/ImageMagick-7.1.2-31-portable-Q16-HDRI-arm64.7z",
	sha256: "4a54aca519fe1e0ef166c8315bf01ea4606a701701a6bed67f81cc75df153fa2",
	bytes: 12447355,
};
const response = await fetch(magickSource.url, {
	signal: AbortSignal.timeout(300000),
});
if (!response.ok) throw new Error(`ImageMagick download: ${response.status}`);
await writeFile(
	join(root, "magick.7z"),
	Buffer.from(await response.arrayBuffer()),
);
const archive = await fileInfo(root, "magick.7z");
if (
	archive.sha256 !== magickSource.sha256 ||
	archive.bytes !== magickSource.bytes
)
	throw new Error("Pinned ImageMagick changed");
run("7z", ["x", "-y", "-o" + join(root, "magick"), join(root, "magick.7z")]);
for (const [from, to] of [
	["magick.exe", "bin/magick.exe"],
	["colors.xml", "magick-config/colors.xml"],
	["LICENSE.txt", "licenses/imagemagick/LICENSE.txt"],
	["NOTICE.txt", "licenses/imagemagick/NOTICE.txt"],
])
	await copyFile(join(root, "magick", from), join(engines, to));
// This private copy no longer contains the old x64 application or verifier.
// Replace only their application notices; all original engine notices remain.
await rm(join(engines, "licenses/application"), {
	recursive: true,
	force: true,
});
const noticesRoot = resolve(".desktop-local/ci/application/notices");
const dossier = JSON.parse(
	await readFile(join(noticesRoot, "dossier.json"), "utf8"),
);
if (dossier.target !== "aarch64-pc-windows-msvc")
	throw new Error("Wrong ARM64 notice dossier");
for (const component of dossier.components)
	for (const notice of component.notices) {
		const actual = await fileInfo(noticesRoot, notice.file, notice.bytes);
		if (actual.sha256 !== notice.sha256 || actual.bytes !== notice.bytes)
			throw new Error("Application notice changed");
	}
await cp(
	".desktop-local/ci/application/notices/licenses",
	join(engines, "licenses/application"),
	{ recursive: true },
);
const runtime = JSON.parse(
	await readFile("packaging/desktop/windows/arm-runtime.json", "utf8"),
);
const runtimeInfo = await fileInfo(".desktop-local/arm-source", "vcomp140.dll");
if (
	runtimeInfo.sha256 !== runtime.sha256 ||
	runtimeInfo.bytes !== runtime.bytes
)
	throw new Error("ARM64 runtime changed");
await copyFile(
	".desktop-local/arm-source/vcomp140.dll",
	join(engines, "bin/vcomp140.dll"),
);
const manifest = JSON.parse(
	await readFile(join(engines, "engines.json"), "utf8"),
);
manifest.arch = "aarch64";
manifest.engines.magick.sha256 = (
	await fileInfo(engines, "bin/magick.exe")
).sha256;
manifest.engines.magick.version = run(join(engines, "bin/magick.exe"), [
	"-version",
])
	.trim()
	.split(/\r?\n/)[0];
const compatibility = {
	minimumWindows: "11",
	application: "aarch64",
	magick: "aarch64",
	ffmpeg: "x86_64-emulated",
	ffprobe: "x86_64-emulated",
	pandoc: "x86_64-emulated",
	mutool: "x86_64-emulated",
};
const provenance = JSON.parse(
	await readFile(join(engines, "provenance.json"), "utf8"),
);
provenance.arm64Preview = {
	sourceManifest: await fileInfo(source, "engines.json"),
	sourceLockSha256: sourceRecord.sourceLockSha256,
	magickSource,
	runtime,
	applicationNotices: await fileInfo(noticesRoot, "dossier.json"),
	compatibility,
	redistributionApproved: false,
};
await writeFile(
	join(engines, "provenance.json"),
	JSON.stringify(provenance, null, 2) + "\n",
);
manifest.files = {};
for (const name of await listFiles(engines))
	if (name !== "engines.json")
		manifest.files[name] = await fileInfo(engines, name);
await writeFile(
	join(engines, "engines.json"),
	JSON.stringify(manifest, null, 2) + "\n",
);
const notices = Object.entries(manifest.files).filter(([name]) =>
	name.startsWith("licenses/"),
);
if (
	notices.length > 1024 ||
	notices.some(([, info]) => info.bytes > 2 * 1024 ** 2)
)
	throw new Error("Notice inventory exceeds application limits");
const pe = await inspectWindowsTree(candidate, windowsPreviewArchitecture);
if (pe.missing.length) throw new Error("Unresolved native/compatibility DLL");
const infoPath = join(root, "build-info.json");
run(join(candidate, "z8-desktop.exe"), ["--build-info-file", infoPath]);
const info = JSON.parse(await readFile(infoPath, "utf8"));
if (
	info.arch !== "aarch64" ||
	info.os !== "windows" ||
	info.engines !== "bundled" ||
	info.debug !== false ||
	info.customProtocol !== true ||
	info.updater !== false
)
	throw new Error("Wrong application build");
const quality = JSON.parse(
	run(
		join(engines, "validation/bundle-check.exe"),
		[engines, "--quality"],
		1800000,
	),
);
validateQuality(quality, "windows-aarch64");
await writeFile(
	join(root, "quality.json"),
	JSON.stringify(quality, null, 2) + "\n",
);
await writeFile(
	join(root, "compatibility.json"),
	JSON.stringify(
		{ compatibility, pe, gui: "not-run", nativeHostConversion: "passed" },
		null,
		2,
	) + "\n",
);
await writeFile(
	join(candidate, "README.txt"),
	"Z8.Work Windows 11 ARM64 preview\r\nExtract all files and run z8-desktop.exe. Keep engines beside the EXE.\r\nARM64 application and ImageMagick; FFmpeg, FFprobe, Pandoc and MuPDF use Windows 11 x64 emulation.\r\nMicrosoft Edge WebView2 Runtime is required. Unsigned development preview; GUI/install/upgrade acceptance pending.\r\n",
);
const preparedRoot = join(root, "msix-prepared");
await mkdir(preparedRoot);
const layout = join(preparedRoot, "layout");
await cp(candidate, layout, { recursive: true });
await mkdir(join(layout, "Assets"));
for (const name of Object.keys(msixAssets))
	await copyFile(
		join("packaging/desktop/windows/msix/Assets", name),
		join(layout, "Assets", name),
	);
const config = await msixConfig();
config.architecture = "arm64";
config.minimumWindowsVersion = "10.0.22000.0";
config.maxVersionTested = "10.0.22000.0";
await writeFile(join(layout, "AppxManifest.xml"), msixManifest(config));
const files = {};
for (const name of await listFiles(layout))
	files[name] = await fileInfo(layout, name);
const prepared = {
	schema: 1,
	scope: "development-msix-layout",
	config,
	redistributionApproved: false,
	acceptance: "incomplete",
	files,
};
await verifyMsixLayout(layout, prepared);
await writeFile(
	join(preparedRoot, "prepared.json"),
	JSON.stringify(prepared, null, 2) + "\n",
);
console.log(
	"ARM64 host conversions passed; prepared Windows 11 compatibility preview",
);
