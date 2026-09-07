import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const { outputText } = ts.transpileModule(
	await readFile(
		new URL("../src/lib/util/buffer-limit.ts", import.meta.url),
		"utf8",
	),
	{ compilerOptions: { module: ts.ModuleKind.ESNext } },
);
const { supportedBufferLimit, SUPPORTED_BUFFER_LIMIT } = await import(
	`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
test("file ceiling honors lower cached limits and rejects invalid or oversized values", () => {
	assert.equal(supportedBufferLimit("1048576"), 1048576);
	for (const value of [
		null,
		"",
		"0",
		"-1",
		"NaN",
		"Infinity",
		"1.5",
		"9007199254740992",
		"4294967296",
	]) {
		assert.equal(
			supportedBufferLimit(value),
			SUPPORTED_BUFFER_LIMIT,
			String(value),
		);
	}
	assert.equal(SUPPORTED_BUFFER_LIMIT, 2145386496);
});
