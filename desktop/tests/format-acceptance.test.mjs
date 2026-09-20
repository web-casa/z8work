import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatAcceptance } from "../../scripts/lib/desktop-format-acceptance.mjs";

test("Linux ARM64 acceptance grants the reviewed expansion while other targets stay conservative", async () => {
	const scope = JSON.parse(
		await readFile("packaging/desktop/v1-scope.json", "utf8"),
	);
	const acceptance = await formatAcceptance("linux", "aarch64");
	assert.equal(acceptance.schema, 1);
	assert.equal(acceptance.scope, scope.id);
	assert.equal(acceptance.os, "linux");
	assert.equal(acceptance.arch, "aarch64");
	const reviewed = new Map(
		scope.groups.flatMap((group) =>
			group.inputs.map((input) => [input, new Set(group.outputs)]),
		),
	);
	assert.ok(acceptance.routes.length > 0);
	assert.equal(
		acceptance.routes.length,
		scope.groups.reduce((n, group) => n + group.inputs.length, 0),
	);
	for (const route of acceptance.routes) {
		assert.deepEqual(route.outputs, [...reviewed.get(route.input)]);
	}
	assert.equal(
		new Set(acceptance.routes.map((route) => route.input)).size,
		acceptance.routes.length,
	);
	for (const [os, arch] of [
		["linux", "x86_64"],
		["windows", "x86_64"],
		["windows", "aarch64"],
		["macos", "x86_64"],
		["macos", "aarch64"],
	]) {
		const conservative = await formatAcceptance(os, arch);
		assert.ok(
			conservative.routes.length < acceptance.routes.length,
			`${os}/${arch} must not be promoted by Linux ARM64 evidence`,
		);
	}
});

test("acceptance generation refuses an unknown package target", async () => {
	for (const [os, arch] of [
		["android", "aarch64"],
		["linux", "arm64"],
	])
		await assert.rejects(formatAcceptance(os, arch));
});
