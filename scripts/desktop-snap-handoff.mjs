// Prepare local test-machine inputs. This is not a distributable release bundle.
import { parseArgs } from "node:util";
import {
	readFile,
	writeFile,
	mkdir,
	copyFile,
	cp,
	realpath,
} from "node:fs/promises";
import { resolve, join, dirname, basename, sep } from "node:path";
import { fileInfo, listFiles } from "./lib/desktop-sources.mjs";
import { runFinite } from "./lib/desktop-snap-installed.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["artifact", "prepared", "output"].map((k) => [k, { type: "string" }]),
	),
});
for (const key of ["artifact", "prepared", "output"])
	if (!values[key]) throw new Error(`--${key} required`);
const output = resolve(values.output),
	artifact = resolve(values.artifact),
	prepared = resolve(values.prepared);
const yaml = await realpath("node_modules/yaml");
const canonicalOutput = join(await realpath(dirname(output)), basename(output));
if (canonicalOutput === yaml || canonicalOutput.startsWith(yaml + sep))
	throw new Error("Output cannot be inside dependency input");
if (
	JSON.parse(await readFile(join(yaml, "package.json"), "utf8")).version !==
	"2.8.2"
)
	throw new Error("Reviewed YAML 2.8.2 dependency required");
const before = await fileInfo(dirname(artifact), basename(artifact));
await fileInfo(dirname(prepared), basename(prepared), 1024 ** 2);
await mkdir(output);
for (const [source, target] of [
	[artifact, "candidate.snap"],
	[prepared, "prepared.json"],
	...[
		"scripts/desktop-snap-installed.mjs",
		"scripts/desktop-snap-check.mjs",
		"scripts/lib/desktop-snap-installed.mjs",
		"scripts/lib/desktop-snap.mjs",
		"scripts/lib/desktop-artifacts.mjs",
		"scripts/lib/desktop-sources.mjs",
		"packaging/desktop/artifacts.json",
		"LICENSE",
	].map((p) => [p, p]),
]) {
	await mkdir(dirname(join(output, target)), { recursive: true });
	await copyFile(source, join(output, target));
}
await cp(yaml, join(output, "node_modules/yaml"), {
	recursive: true,
	force: false,
	errorOnExist: true,
});
await writeFile(
	join(output, "package.json"),
	JSON.stringify(
		{
			private: true,
			type: "module",
			scripts: {
				preflight:
					"node scripts/desktop-snap-installed.mjs --preflight",
				installed:
					"node scripts/desktop-snap-installed.mjs --artifact candidate.snap --prepared prepared.json",
			},
		},
		null,
		2,
	) + "\n",
	{ flag: "wx" },
);
await runFinite(
	process.execPath,
	[
		"scripts/desktop-snap-check.mjs",
		"--artifact",
		join(output, "candidate.snap"),
		"--prepared",
		join(output, "prepared.json"),
		"--output",
		join(output, "integrity.json"),
	],
	{ timeout: 120000, cwd: output },
);
if (
	(await fileInfo(output, "candidate.snap")).sha256 !== before.sha256 ||
	(await fileInfo(dirname(artifact), basename(artifact))).sha256 !==
		before.sha256
)
	throw new Error("Candidate changed while copying");
await writeFile(
	join(output, "README.md"),
	`# Z8.Work installed Snap validation inputs

Local development candidate only; redistribution and store approval remain pending.
Candidate SHA-256: ${before.sha256}

Use an Ubuntu 24.04 AMD64 desktop test machine with complete snapd/AppArmor/seccomp.
Required tools: Node 22 or 24, snapd, squashfs-tools, desktop-file-utils.
YAML 2.8.2 is included; npm install is unnecessary. Node and system tools are not bundled.

Verify the transfer before executing anything:

\`\`\`bash
sha256sum --check SHA256SUMS
node scripts/desktop-snap-installed.mjs --preflight --output ../z8-host-check
\`\`\`

On a dedicated test machine, install candidate.snap using snap install --dangerous.
Do not use --devmode, and do not overwrite an existing installation with user data.
As the ordinary logged-in desktop user, from this directory:

\`\`\`bash
node scripts/desktop-snap-installed.mjs --artifact candidate.snap --prepared prepared.json --output ../z8-installed-check
\`\`\`

A successful command validates only the recorded subset. GUI, portals, removable media,
upgrade/uninstall, offline GUI first launch and licenses require separate evidence.
The tool never installs, refreshes, connects interfaces or removes snaps.
It may use sudo -n only to hash the fixed root-owned snapd cache file.
Provide that read-only privilege on the test machine; never run the validator as root.
Output directories must be new and should be outside this immutable handoff directory.
Hashes detect changed bytes; they do not establish publisher identity.
`,
	{ flag: "wx" },
);
const files = {};
for (const name of await listFiles(output))
	files[name] = await fileInfo(output, name);
await writeFile(
	join(output, "handoff.json"),
	JSON.stringify(
		{
			schema: 1,
			status: "prepared-for-native-testing",
			artifact: "linux-amd64-snap",
			candidateSha256: before.sha256,
			redistributionApproved: false,
			files,
		},
		null,
		2,
	) + "\n",
	{ flag: "wx" },
);
files["handoff.json"] = await fileInfo(output, "handoff.json");
await writeFile(
	join(output, "SHA256SUMS"),
	Object.entries(files)
		.map(([name, info]) => `${info.sha256}  ${name}`)
		.join("\n") + "\n",
	{ flag: "wx" },
);
console.log(
	JSON.stringify({
		output,
		candidateSha256: before.sha256,
		status: "prepared-for-native-testing",
	}),
);
