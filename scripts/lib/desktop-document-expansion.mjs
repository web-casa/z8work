import assert from "node:assert/strict";
export function validateDocumentExpansion(
	report,
	{ requireNetwork = false } = {},
) {
	assert.equal(report?.schema, 1);
	assert.equal(report.scope, "document-input-expansion-3a");
	const inputs = ["html", "htm", "odt", "epub"].sort();
	assert.deepEqual(report.routes.map((r) => r.input).sort(), inputs);
	assert.ok(
		report.routes.every(
			(r) =>
				r.output === "txt" &&
				r.utf8 === true &&
				r.orderedText === true &&
				r.sourceUnchanged === true &&
				Number.isSafeInteger(r.bytes) &&
				r.bytes > 0,
		),
	);
	assert.deepEqual(report.controls.map((r) => r.input).sort(), inputs);
	assert.ok(
		report.controls.every((r) => r.cancel === true && r.collision === true),
	);
	assert.deepEqual(report.corruptArchivesRejected, ["odt", "epub"]);
	assert.equal(report.resourceIsolation.localFileOmitted, true);
	assert.equal(report.resourceIsolation.scriptOmitted, true);
	const network = report.resourceIsolation.network;
	if (requireNetwork || network.status !== "not-run")
		assert.deepEqual(network, { status: "passed", httpRequests: 0 });
	else assert.deepEqual(network, { status: "not-run" });
}
