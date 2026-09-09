import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { parse } from "yaml";
import { formats } from "../src/platform/queue-contract.ts";
import { defaults, parsePreferences } from "../src/platform/preferences.ts";
import { inputPaths } from "../../scripts/lib/desktop-inputs.mjs";

const root = new URL("../../", import.meta.url);
const json = async (path) =>
	JSON.parse(await readFile(new URL(path, root), "utf8"));
const scope = await json("packaging/desktop/v1-scope.json");

test("frozen desktop scope matches UI formats, languages and artifact identities", async () => {
	assert.equal(scope.schema, 1);
	assert.equal(scope.id, "v1-r1");
	const matrix = await json("packaging/desktop/artifacts.json");
	assert.deepEqual(scope.languages, matrix.languages);
	assert.deepEqual(
		scope.artifacts,
		matrix.artifacts.map((a) => a.id),
	);
	const inputs = scope.groups.flatMap((g) => g.inputs);
	assert.equal(new Set(inputs).size, inputs.length);
	assert.equal(inputs.length, 20);
	assert.deepEqual(
		[...new Set(scope.groups.flatMap((g) => g.outputs))].sort(),
		[...formats].sort(),
	);
	assert.equal(
		scope.groups.reduce(
			(n, g) => n + g.inputs.length * g.outputs.length,
			0,
		),
		84,
	);
	for (const language of scope.languagePreferences)
		assert.equal(
			parsePreferences({ ...defaults(), language }).language,
			language,
		);
	assert.throws(() => parsePreferences({ ...defaults(), language: "fr" }));
	for (const group of scope.groups) {
		assert.ok(group.sampleNotes.length > 0);
		for (const path of [group.implementation, ...group.samples])
			assert.ok((await stat(new URL(path, root))).isFile(), path);
	}
	for (const limit of scope.limits) {
		assert.ok(Number.isSafeInteger(limit.value) && limit.value > 0);
		assert.ok((await stat(new URL(limit.source, root))).isFile());
	}
});

test("desktop CI covers every receipt input and uses the pinned Rust toolchain", async () => {
	const workflow = parse(
		await readFile(new URL(".github/workflows/desktop.yml", root), "utf8"),
	);
	for (const event of ["pull_request", "push"]) {
		const paths = workflow.on[event].paths;
		for (const input of inputPaths)
			assert.ok(
				paths.includes(input) || paths.includes(`${input}/**`),
				`${event} missing ${input}`,
			);
	}
	const toolchain = await readFile(
		new URL("rust-toolchain.toml", root),
		"utf8",
	);
	const version = toolchain.match(/^channel = "([0-9.]+)"$/m)?.[1];
	assert.ok(version);
	let jobs = 0;
	for (const job of Object.values(workflow.jobs)) {
		const rust = job.steps.filter((s) =>
			s.uses?.startsWith("dtolnay/rust-toolchain@"),
		);
		for (const step of rust) {
			assert.equal(step.uses, `dtolnay/rust-toolchain@${version}`);
			jobs++;
		}
		if (job.steps.some((s) => s.run?.includes("bun install")))
			assert.ok(
				job.steps.some(
					(s) =>
						s.uses?.startsWith("actions/setup-node@") &&
						s.with["node-version"] === "22.22.2",
				),
			);
	}
	assert.equal(
		jobs,
		Object.values(workflow.jobs).filter((job) =>
			job.steps.some((s) =>
				/\bcargo (?:build|check|test|clippy|fmt)\b/.test(s.run ?? ""),
			),
		).length,
	);
});
