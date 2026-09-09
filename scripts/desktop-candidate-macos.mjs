import { validateQuality } from "./lib/desktop-snap-installed.mjs";
// Native .app assembly. Caller supplies a fully relocated, fingerprinted engine
// tree; this tool never selects Homebrew versions, signs sources or downloads.
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, cp } from "node:fs/promises";
import { join, resolve, basename, dirname } from "node:path";
import {
	inspectMacBundle,
	inspectMachO,
	resolveDependency,
	assertMacDeployment,
} from "./lib/desktop-macos.mjs";
import { artifactMatrix, validateBuild } from "./lib/desktop-artifacts.mjs";
import { fileInfo, listFiles } from "./lib/desktop-sources.mjs";
import { assertOutside } from "./lib/desktop-windows-acceptance.mjs";
import { checkVersions } from "./lib/desktop-versions.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["binary", "engines", "output"].map((k) => [k, { type: "string" }]),
	),
});
for (const key of ["binary", "engines", "output"])
	if (!values[key]) throw new Error(`--${key} required`);
if (process.platform !== "darwin" || process.arch !== "arm64")
	throw new Error(
		"Native macOS ARM64 required; cross-inspection is not candidate acceptance",
	);
const binary = resolve(values.binary),
	engines = resolve(values.engines),
	output = resolve(values.output);
await assertOutside(engines, output);
await assertOutside(dirname(binary), output);
const matrix = await artifactMatrix(),
	artifact = matrix.artifacts.find((a) => a.id === "macos-arm64-app");
const versions = await checkVersions();
const config = JSON.parse(
	await readFile("packaging/desktop/macos/development.json", "utf8"),
);
const run = (bin, args, timeout = 60000) =>
	execFileSync(bin, args, {
		encoding: "utf8",
		timeout,
		maxBuffer: 16 * 1024 ** 2,
		env: {
			PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
			LANG: "en_US.UTF-8",
			HOME: process.env.HOME,
			TMPDIR: process.env.TMPDIR,
		},
	});
const application = inspectMachO(await readFile(binary));
assertMacDeployment(application, config.minimumSystemVersion);
if (application.fileType !== 2 || application.rpaths.length)
	throw new Error("Application must be a relocated executable");
for (const dependency of application.dependencies)
	if (!resolveDependency(dependency, "z8-desktop", "z8-desktop").system)
		throw new Error("Application has an unbundled non-system dylib");
const build = JSON.parse(run(binary, ["--build-info"]));
validateBuild(build, artifact, matrix.version);
if (
	config.schema !== 1 ||
	config.publicDistribution !== false ||
	config.signature !== "ad-hoc-local-only" ||
	config.identifier !== build.applicationId ||
	config.name !== build.resourceDirectoryName
)
	throw new Error("macOS development identity mismatch");
const bundle = await inspectMacBundle(engines, config.minimumSystemVersion);
// Do not invalidate engine hashes by signing after inventory. All Mach-O code
// must already have valid signatures from the native engine build/relocation step.
for (const name of await listFiles(engines)) {
	const b = await readFile(join(engines, name));
	if (b.subarray(0, 4).toString("hex") === "cffaedfe")
		run("/usr/bin/codesign", ["--verify", "--strict", join(engines, name)]);
}
await mkdir(output);
const app = join(output, config.name + ".app"),
	contents = join(app, "Contents");
await mkdir(join(contents, "MacOS"), { recursive: true });
await mkdir(join(contents, "Resources"));
await copyFile(binary, join(contents, "MacOS/z8-desktop"));
await cp(engines, join(contents, "Resources/engines"), {
	recursive: true,
	force: false,
	errorOnExist: true,
});
await copyFile("LICENSE", join(contents, "Resources/LICENSE"));
await copyFile(
	"src-tauri/icons/icon.icns",
	join(contents, "Resources/icon.icns"),
);
const escape = (s) =>
	String(s)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
const plist = {
	CFBundleExecutable: "z8-desktop",
	CFBundleIdentifier: config.identifier,
	CFBundleName: "Z8.Work",
	CFBundleInfoDictionaryVersion: "6.0",
	CFBundleDevelopmentRegion: "en",
	CFBundleLocalizations: ["en", "zh-Hans"],
	CFBundleDisplayName: config.name,
	CFBundlePackageType: "APPL",
	CFBundleIconFile: "icon.icns",
	CFBundleShortVersionString: matrix.version,
	CFBundleVersion: versions.macosBundle,
	LSMinimumSystemVersion: config.minimumSystemVersion,
	NSHighResolutionCapable: true,
};
await writeFile(
	join(contents, "Info.plist"),
	'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>' +
		Object.entries(plist)
			.map(
				([k, v]) =>
					`<key>${k}</key>${v === true ? "<true/>" : Array.isArray(v) ? `<array>${v.map((value) => `<string>${escape(value)}</string>`).join("")}</array>` : `<string>${escape(v)}</string>`}`,
			)
			.join("") +
		"</dict></plist>\n",
	{ flag: "wx" },
);
run("/usr/bin/plutil", ["-lint", join(contents, "Info.plist")]);
run("/usr/bin/codesign", ["--force", "--sign", "-", app]);
run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
const packaged = join(contents, "Resources/engines");
const finalBundle = await inspectMacBundle(
	packaged,
	config.minimumSystemVersion,
);
if (bundle.manifestInfo.sha256 !== finalBundle.manifestInfo.sha256)
	throw new Error("Signing changed engine inventory");
const quality = JSON.parse(
	run(
		join(packaged, "validation/bundle-check"),
		[packaged, "--quality"],
		1800000,
	),
);
validateQuality(quality, "macos-aarch64");
await writeFile(
	join(output, "quality.json"),
	JSON.stringify(quality, null, 2) + "\n",
	{ flag: "wx" },
);
const files = {};
for (const name of await listFiles(app))
	files[name] = await fileInfo(app, name);
await inspectMacBundle(engines);
const report = {
	schema: 1,
	artifact: artifact.id,
	version: matrix.version,
	buildInfo: build,
	sourceBinary: await fileInfo(dirname(binary), basename(binary)),
	files,
	engineManifestSha256: bundle.manifestInfo.sha256,
	dependencies: bundle.dependencies,
	deployments: bundle.deployments,
	applicationDeployment: application.deployment,
	signature: "ad-hoc-local-only",
	redistributionApproved: false,
	checks: {
		integrity: "passed",
		conversion: "passed",
		install: "not-run",
		gui: "not-run",
		upgrade: "not-run",
		licenses: "not-run",
		notarization: "not-applicable-local-only",
	},
};
await writeFile(
	join(output, "candidate.json"),
	JSON.stringify(report, null, 2) + "\n",
	{ flag: "wx" },
);
console.log(
	`Local macOS candidate: ${app}; installation and distribution acceptance remain incomplete`,
);
