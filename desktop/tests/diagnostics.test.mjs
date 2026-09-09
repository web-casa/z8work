import test from "node:test";
import assert from "node:assert/strict";
import { parseDiagnosticPreview } from "../src/platform/diagnostics.ts";
const valid = {
	id: "12345678-1234-1234-1234-123456789abc",
	text: '{"schema":1,"product":"Z8.Work"}\n',
};
test("diagnostic preview preserves exact reviewed bytes", () => {
	assert.deepEqual(parseDiagnosticPreview(valid), valid);
});
test("diagnostic preview rejects malformed ids schemas and oversized UTF-8", () => {
	for (const value of [
		null,
		[],
		{},
		{ ...valid, id: "/home/private" },
		{ ...valid, id: "-".repeat(36) },
		{ ...valid, text: "broken" },
		{ ...valid, text: '{"schema":2,"product":"Z8.Work"}' },
		{
			...valid,
			text: JSON.stringify({
				schema: 1,
				product: "Z8.Work",
				data: "中".repeat(3000),
			}),
		},
	])
		assert.throws(() => parseDiagnosticPreview(value));
});
