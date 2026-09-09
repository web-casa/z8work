// Read-only acceptance gate. It does not upload or publish; reports must be reviewed separately.
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import {
	artifactMatrix,
	sha256,
	validateEvidence,
} from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["artifact", "evidence", "file"].map((k) => [k, { type: "string" }]),
	),
});
for (const key of ["artifact", "evidence", "file"])
	if (!values[key]) throw new Error(`--${key} required`);
const artifact = (await artifactMatrix()).artifacts.find(
	(a) => a.id === values.artifact,
);
if (!artifact) throw new Error("Unknown artifact target");
const evidence = JSON.parse(await readFile(values.evidence, "utf8"));
validateEvidence(evidence, sha256(await readFile(values.file)), artifact);
console.log(
	`Local evidence structure accepted for ${artifact.id}; no signature or store approval is inferred.`,
);
