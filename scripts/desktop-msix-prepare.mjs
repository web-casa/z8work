// Development MSIX layout only; no certificates, installation or store submission.
import { parseArgs } from "node:util";
import { checkVersions } from "./lib/desktop-versions.mjs";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertOutside,
	verifyHandoff,
} from "./lib/desktop-windows-acceptance.mjs";
import { fileInfo } from "./lib/desktop-sources.mjs";
import {
	msixConfig,
	msixManifest,
	msixAssets,
	verifyMsixLayout,
} from "./lib/desktop-msix.mjs";
const { values } = parseArgs({
	options: {
		handoff: { type: "string" },
		output: { type: "string" },
		"synthetic-upgrade": { type: "boolean", default: false },
	},
});
if (!values.handoff || !values.output)
	throw new Error("Use --handoff WINDOWS_HANDOFF --output NEW_DIRECTORY");
const versions = await checkVersions();
const handoff = resolve(values.handoff),
	output = resolve(values.output);
await assertOutside(handoff, output);
const source = await verifyHandoff(handoff),
	config = await msixConfig();
if (values["synthetic-upgrade"])
	config.version = versions.syntheticUpgrade.developmentMsix;
const sourceInfo = await fileInfo(handoff, "handoff.json");
await mkdir(output);
const layout = join(output, "layout");
await mkdir(layout);
const files = {};
for (const [name, expected] of Object.entries(source.files)) {
	if (!name.startsWith("candidate/")) continue;
	const target = name.slice("candidate/".length);
	await mkdir(dirname(join(layout, target)), { recursive: true });
	await copyFile(join(handoff, name), join(layout, target));
	const actual = await fileInfo(layout, target);
	if (JSON.stringify(actual) !== JSON.stringify(expected))
		throw new Error("Candidate changed during MSIX preparation");
	files[target] = actual;
}
await mkdir(join(layout, "Assets"));
for (const name of Object.keys(msixAssets)) {
	await copyFile(
		fileURLToPath(
			new URL(
				`../packaging/desktop/windows/msix/Assets/${name}`,
				import.meta.url,
			),
		),
		join(layout, "Assets", name),
	);
	files[`Assets/${name}`] = await fileInfo(layout, `Assets/${name}`);
}
await writeFile(join(layout, "AppxManifest.xml"), msixManifest(config), {
	flag: "wx",
});
files["AppxManifest.xml"] = await fileInfo(layout, "AppxManifest.xml");
const prepared = {
	schema: 1,
	scope: "development-msix-layout",
	config,
	redistributionApproved: false,
	acceptance: "incomplete",
	syntheticUpgrade: values["synthetic-upgrade"]
		? {
				published: false,
				purpose:
					"lower MSIX package version with current application code; not a historical release or old-schema migration proof",
				applicationVersion: versions.application,
				targetPackageVersion: versions.developmentMsix,
			}
		: null,
	sourceHandoff: sourceInfo,
	files,
};
await verifyMsixLayout(layout, prepared);
await verifyHandoff(handoff);
if (
	JSON.stringify(await fileInfo(handoff, "handoff.json")) !==
	JSON.stringify(sourceInfo)
)
	throw new Error("Source handoff changed during preparation");
await writeFile(
	join(output, "prepared.json"),
	JSON.stringify(prepared, null, 2) + "\n",
	{ flag: "wx" },
);
console.log(
	JSON.stringify({
		status: "prepared",
		output,
		files: Object.keys(files).length,
		acceptance: "incomplete",
		storeSubmissionAllowed: false,
	}),
);
