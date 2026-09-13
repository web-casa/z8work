import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateDocumentExpansion } from "../../scripts/lib/desktop-document-expansion.mjs";
test("document gate rejects missing routes, coercion, unsafe resources and failed controls", async () => {
	const report = JSON.parse(
		await readFile(
			"docs/desktop/evidence/format-phase3a-20260913/local-documents.json",
			"utf8",
		),
	);
	validateDocumentExpansion(report, { requireNetwork: true });
	for (const change of [
		(r) => r.routes.pop(),
		(r) => r.routes.push(r.routes[0]),
		(r) => (r.routes[0].utf8 = "true"),
		(r) => (r.routes[0].bytes = "100"),
		(r) => (r.routes[0].orderedText = false),
		(r) => (r.routes[0].sourceUnchanged = false),
		(r) => (r.routes[0].output = "html"),
		(r) => (r.resourceIsolation.network.httpRequests = 1),
		(r) => (r.resourceIsolation.localFileOmitted = false),
		(r) => (r.controls[0].cancel = false),
		(r) => (r.controls[0].collision = false),
		(r) => r.corruptArchivesRejected.pop(),
	]) {
		const broken = structuredClone(report);
		change(broken);
		assert.throws(() =>
			validateDocumentExpansion(broken, { requireNetwork: true }),
		);
	}
});
