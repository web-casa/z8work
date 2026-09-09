// Read-only acceptance gate. It does not upload or publish; reports must be reviewed separately.
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { verifyEvidenceReports } from "./lib/desktop-store.mjs";
import {
	artifactMatrix,
	sha256,
	validateEvidence,
} from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({
	options: Object.fromEntries(
		["artifact", "evidence", "file", "root"].map((k) => [
			k,
			{ type: "string" },
		]),
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
await verifyEvidenceReports(values.root ?? process.cwd(), evidence, artifact);
console.log(
	`Local evidence references verified for ${artifact.id}; native results still require review. No signature, redistribution or store approval is inferred.`,
);
