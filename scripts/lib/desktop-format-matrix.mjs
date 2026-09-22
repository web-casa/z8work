// Validates evidence emitted by the separate full-format package verifier.
// The verifier is allowed only for a target whose package-local acceptance file
// grants the entire reviewed scope; a successful source build alone is not
// evidence that a downloadable package can expose these routes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scopeUrl = new URL(
	"../../packaging/desktop/v1-scope.json",
	import.meta.url,
);

const audioCodecs = {
	wav: "pcm_s16le",
	mp3: "mp3",
	flac: "flac",
	opus: "opus",
	m4a: "aac",
	ogg: "vorbis",
	aiff: "pcm_s16be",
	aac: "aac",
	alac: "alac",
};

const hash = (value) =>
	typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const finite = (value) => Number.isFinite(value) && value >= 0;

async function reviewedScope() {
	const scope = JSON.parse(await readFile(scopeUrl, "utf8"));
	assert.equal(scope.schema, 1);
	assert.equal(typeof scope.id, "string");
	assert.ok(Array.isArray(scope.groups));
	return scope;
}

function expectedRoutes(scope) {
	const routes = new Map();
	for (const group of scope.groups) {
		assert.equal(typeof group.id, "string");
		assert.ok(Array.isArray(group.inputs));
		assert.ok(Array.isArray(group.outputs));
		for (const input of group.inputs)
			for (const output of group.outputs) {
				const key = `${group.id}:${input}:${output}`;
				assert.ok(!routes.has(key), `duplicate reviewed route ${key}`);
				routes.set(key, { group: group.id, input, output });
			}
	}
	return routes;
}

function imageEvidence(evidence) {
	assert.deepEqual(Object.keys(evidence).sort(), [
		"distinctColors",
		"height",
		"kind",
		"reader",
		"width",
	]);
	assert.equal(evidence.kind, "image");
	assert.equal(evidence.reader, "magick");
	assert.ok(positiveInteger(evidence.width));
	assert.ok(positiveInteger(evidence.height));
	assert.ok(positiveInteger(evidence.distinctColors));
	assert.ok(evidence.distinctColors >= 2);
}

function textEvidence(evidence, reader) {
	assert.deepEqual(Object.keys(evidence).sort(), [
		"chars",
		"kind",
		"orderedTokens",
		"reader",
	]);
	assert.equal(evidence.kind, "text");
	assert.equal(evidence.reader, reader);
	assert.equal(evidence.orderedTokens, true);
	assert.ok(positiveInteger(evidence.chars));
}

function pageEvidence(evidence) {
	assert.deepEqual(Object.keys(evidence).sort(), ["kind", "pages", "reader"]);
	assert.equal(evidence.kind, "pages");
	assert.equal(evidence.reader, "magick");
	assert.ok(Array.isArray(evidence.pages));
	assert.equal(evidence.pages.length, 3);
	for (const [index, page] of evidence.pages.entries()) {
		assert.deepEqual(Object.keys(page).sort(), [
			"bytes",
			"evidence",
			"page",
			"sha256",
		]);
		assert.equal(page.page, index + 1);
		assert.ok(hash(page.sha256));
		assert.ok(positiveInteger(page.bytes));
		imageEvidence(page.evidence);
	}
}

function audioEvidence(evidence, output) {
	assert.deepEqual(Object.keys(evidence).sort(), [
		"channels",
		"codec",
		"durationDeltaSeconds",
		"durationSeconds",
		"kind",
		"reader",
		"sampleRate",
	]);
	assert.equal(evidence.kind, "audio");
	assert.equal(evidence.reader, "ffprobe+ffmpeg");
	assert.equal(evidence.codec, audioCodecs[output]);
	assert.ok(positiveInteger(evidence.channels));
	assert.ok(positiveInteger(Number(evidence.sampleRate)));
	assert.ok(finite(evidence.durationSeconds) && evidence.durationSeconds > 0);
	assert.ok(
		finite(evidence.durationDeltaSeconds) &&
			evidence.durationDeltaSeconds <= 0.2,
	);
}

function routeEvidence(route) {
	if (route.group === "images") return imageEvidence(route.evidence);
	if (route.group === "pdf") {
		if (route.output === "txt")
			return textEvidence(route.evidence, "mutool");
		return pageEvidence(route.evidence);
	}
	if (route.group === "plain-text")
		return textEvidence(route.evidence, "native");
	if (route.group === "documents")
		return textEvidence(route.evidence, "pandoc");
	if (route.group === "media")
		return audioEvidence(route.evidence, route.output);
	throw new Error(`Unknown matrix route group ${route.group}`);
}

export async function validateFormatMatrix(report, expectedPlatform) {
	const scope = await reviewedScope();
	assert.equal(report?.schema, 1);
	assert.equal(report.scope, scope.id);
	assert.equal(report.platform, expectedPlatform?.os);
	assert.equal(report.arch, expectedPlatform?.arch);
	assert.ok(Array.isArray(report.engines));
	assert.ok(Array.isArray(report.routes));
	const expected = expectedRoutes(scope);
	const seen = new Set();
	for (const route of report.routes) {
		assert.deepEqual(Object.keys(route).sort(), [
			"bytes",
			"evidence",
			"group",
			"input",
			"output",
			"sourceSha256",
			"sourceUnchanged",
		]);
		const key = `${route.group}:${route.input}:${route.output}`;
		assert.ok(expected.has(key), `unexpected matrix route ${key}`);
		assert.ok(!seen.has(key), `duplicate matrix route ${key}`);
		seen.add(key);
		assert.ok(hash(route.sourceSha256));
		assert.equal(route.sourceUnchanged, true);
		assert.ok(positiveInteger(route.bytes));
		routeEvidence(route);
	}
	assert.deepEqual([...seen].sort(), [...expected.keys()].sort());
}

export async function matrixRouteCount() {
	return expectedRoutes(await reviewedScope()).size;
}
