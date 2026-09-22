// Inspect an explicitly supplied locally built Snap against its prepared payload.
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile, lstat } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import {
	artifactMatrix,
	assertElf,
	validateBuild,
} from "./lib/desktop-artifacts.mjs";
import { inspectBundle, fileInfo } from "./lib/desktop-sources.mjs";
import {
	snapMetadata,
	validateSnap,
	validateSnapPayload,
	checkSnapDesktop,
} from "./lib/desktop-snap.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["artifact", "prepared", "output"].map((k) => [k, { type: "string" }]),
	),
});
for (const key of ["artifact", "prepared", "output"])
	if (!values[key]) throw new Error(`--${key} required`);
const file = resolve(values.artifact),
	prepared = resolve(values.prepared);
await fileInfo(dirname(prepared), basename(prepared), 1024 ** 2);
const expected = JSON.parse(await readFile(prepared, "utf8"));
const matrix = await artifactMatrix(),
	artifact = matrix.artifacts.find((a) => a.id === "linux-amd64-snap");
if (
	expected.schema !== 1 ||
	expected.artifact !== artifact.id ||
	expected.version !== matrix.version
)
	throw new Error("Prepared payload target mismatch");
validateBuild(expected.buildInfo, artifact, matrix.version);
const fingerprint = await fileInfo(dirname(file), basename(file));
const directory = await mkdtemp(join(tmpdir(), "z8-snap-check-"));
try {
	execFileSync(
		"unsquashfs",
		[
			"-no-progress",
			"-processors",
			"2",
			"-d",
			join(directory, "snap"),
			file,
		],
		{ timeout: 120000, maxBuffer: 1024 ** 2 },
	);
	const root = join(directory, "snap");
	await fileInfo(root, "meta/snap.yaml", 1024 ** 2);
	const meta = snapMetadata(
		await readFile(join(root, "meta/snap.yaml"), "utf8"),
	);
	validateSnap(meta, matrix.version, true);
	const app = await fileInfo(root, "usr/bin/z8-desktop");
	if (!((await lstat(join(root, "usr/bin/z8-desktop"))).mode & 0o111))
		throw new Error("Snap application is not executable");
	assertElf(await readFile(join(root, "usr/bin/z8-desktop")), artifact.arch);
	if (app.sha256 !== expected.applicationSha256)
		throw new Error("Snap application differs from prepared bytes");
	const resourceName = expected.buildInfo.resourceDirectoryName;
	if (
		!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(resourceName) ||
		resourceName.includes("..")
	)
		throw new Error("Unsafe resource directory");
	const bundle = await inspectBundle(
		join(root, "usr/lib", resourceName, "engines"),
	);
	validateSnapPayload(bundle, expected.buildInfo, artifact, matrix.version);
	if (bundle.manifestInfo.sha256 !== expected.engineManifestSha256)
		throw new Error("Snap engine manifest differs from prepared bytes");
	for (const name of [
		"meta/gui/z8-work.desktop",
		"usr/share/icons/hicolor/192x192/apps/z8-work.png",
		"usr/share/licenses/z8-work/LICENSE",
	])
		await fileInfo(root, name, 1024 ** 2);
	for (const command of [
		"snap/command-chain/run",
		...meta.apps["z8-work"]["command-chain"],
		...(meta.hooks?.configure?.["command-chain"] ?? []),
	]) {
		await fileInfo(root, command, 1024 ** 2);
		if (!((await lstat(join(root, command))).mode & 0o111))
			throw new Error("Snap wrapper is not executable");
	}
	const desktop = join(root, "meta/gui/z8-work.desktop");
	await checkSnapDesktop(desktop);
	const icon = await readFile(
		join(root, "usr/share/icons/hicolor/192x192/apps/z8-work.png"),
	);
	if (
		icon.length < 24 ||
		icon.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
		icon.readUInt32BE(16) !== 192 ||
		icon.readUInt32BE(20) !== 192
	)
		throw new Error("Invalid application icon");
	if (
		(await fileInfo(dirname(file), basename(file))).sha256 !==
		fingerprint.sha256
	)
		throw new Error("Snap changed during inspection");
	const report = {
		schema: 1,
		artifact: artifact.id,
		filename: basename(file),
		...fingerprint,
		applicationSha256: app.sha256,
		engineManifestSha256: bundle.manifestInfo.sha256,
		buildInfo: expected.buildInfo,
		redistributionApproved: false,
		checks: {
			integrity: {
				status: "passed",
				report: "Final Snap extracted; metadata, app hash and full engine inventory match prepared bytes",
			},
			conversion: { status: "not-run" },
			gui: { status: "not-run" },
			install: { status: "not-run" },
			upgrade: { status: "not-run" },
			uninstall: { status: "not-run" },
			licenses: { status: "not-run" },
			"strict-confinement": { status: "not-run" },
			portal: { status: "not-run" },
		},
	};
	await writeFile(values.output, JSON.stringify(report, null, 2) + "\n", {
		flag: "wx",
	});
	console.log(
		JSON.stringify({
			artifact: artifact.id,
			sha256: fingerprint.sha256,
			integrity: "passed",
			acceptance: "incomplete",
		}),
	);
} finally {
	await rm(directory, { recursive: true, force: true });
}
