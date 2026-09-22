import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkVersions } from "./lib/desktop-versions.mjs";
const { values } = parseArgs({
	options: { "upgrade-output": { type: "string" } },
});
const mapping = await checkVersions();
if (values["upgrade-output"]) {
	const root = resolve(values["upgrade-output"]);
	await mkdir(root);
	await writeFile(
		join(root, "tauri.synthetic.json"),
		JSON.stringify(
			{ version: mapping.syntheticUpgrade.application },
			null,
			2,
		) + "\n",
		{ flag: "wx" },
	);
	await writeFile(
		join(root, "upgrade.json"),
		JSON.stringify(
			{
				schema: 1,
				scope: "synthetic-migration-inputs-only",
				published: false,
				from: mapping.syntheticUpgrade,
				to: {
					application: mapping.application,
					developmentMsix: mapping.developmentMsix,
					macosBundle: mapping.macosBundle,
				},
				applicationId: mapping.applicationId,
				msixIdentity: mapping.msixIdentity,
				msixPublisher: mapping.msixPublisher,
				snapName: mapping.snapName,
				packagesBuilt: false,
			},
			null,
			2,
		) + "\n",
		{ flag: "wx" },
	);
}
console.log(JSON.stringify(mapping, null, 2));
