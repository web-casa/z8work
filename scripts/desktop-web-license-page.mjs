// Generate offline notices after the frontend build; no HTML or remote fetches.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "./lib/desktop-artifacts.mjs";
import { fileInfo } from "./lib/desktop-sources.mjs";
const directory = process.argv[2];
if (!directory) throw Error("Expected collected notice directory");
const dossier = JSON.parse(
	await readFile(join(directory, "dossier.json"), "utf8"),
);
if (dossier.missingNotices.length) throw Error("Missing dependency notices");
const components = [];
for (const component of dossier.components) {
	const notices = [];
	for (const notice of component.notices) {
		if ((await fileInfo(directory, notice.file)).sha256 !== notice.sha256)
			throw Error("Notice digest mismatch");
		notices.push(await readFile(join(directory, notice.file), "utf8"));
	}
	components.push({
		name: component.name,
		version: component.version,
		license: component.declaredLicense,
		notices,
	});
}
await writeFile(
	"desktop/dist/desktop-notices.json",
	JSON.stringify({ schema: 1, target: dossier.target, components }),
);
await writeFile(
	".desktop-local/web-notices-current.json",
	JSON.stringify({
		directory,
		offlineSha256: sha256(
			await readFile("desktop/dist/desktop-notices.json"),
		),
	}),
);
console.log(
	`Offline notices: ${components.length} components (${dossier.target})`,
);
