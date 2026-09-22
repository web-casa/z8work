import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	matrixRouteCount,
	validateFormatMatrix,
} from "../../scripts/lib/desktop-format-matrix.mjs";

const digest = "a".repeat(64);

function image() {
	return {
		kind: "image",
		reader: "magick",
		width: 32,
		height: 24,
		distinctColors: 4,
	};
}

function evidence(group, output) {
	if (group === "images") return image();
	if (group === "pdf") {
		if (output === "txt")
			return {
				kind: "text",
				reader: "mutool",
				orderedTokens: true,
				chars: 1,
			};
		return {
			kind: "pages",
			reader: "magick",
			pages: [1, 2, 3].map((page) => ({
				page,
				sha256: digest,
				bytes: 1,
				evidence: image(),
			})),
		};
	}
	if (group === "plain-text" || group === "documents")
		return {
			kind: "text",
			reader: group === "plain-text" ? "native" : "pandoc",
			orderedTokens: true,
			chars: 1,
		};
	return {
		kind: "audio",
		reader: "ffprobe+ffmpeg",
		codec: {
			wav: "pcm_s16le",
			mp3: "mp3",
			flac: "flac",
			opus: "opus",
			m4a: "aac",
			ogg: "vorbis",
			aiff: "pcm_s16be",
			aac: "aac",
			alac: "alac",
		}[output],
		channels: 2,
		sampleRate: "48000",
		durationSeconds: 1,
		durationDeltaSeconds: 0,
	};
}

test("full format-matrix evidence requires every reviewed package route", async () => {
	const scope = JSON.parse(
		await readFile("packaging/desktop/v1-scope.json", "utf8"),
	);
	const report = {
		schema: 1,
		scope: scope.id,
		platform: "linux",
		arch: "aarch64",
		engines: [],
		routes: scope.groups.flatMap((group) =>
			group.inputs.flatMap((input) =>
				group.outputs.map((output) => ({
					group: group.id,
					input,
					output,
					sourceSha256: digest,
					sourceUnchanged: true,
					bytes: 1,
					evidence: evidence(group.id, output),
				})),
			),
		),
	};
	assert.equal(report.routes.length, await matrixRouteCount());
	await validateFormatMatrix(report, { os: "linux", arch: "aarch64" });
	for (const mutate of [
		(value) => value.routes.pop(),
		(value) => value.routes.push(structuredClone(value.routes[0])),
		(value) => (value.routes[0].sourceUnchanged = false),
		(value) => (value.routes[0].evidence.distinctColors = 1),
		(value) =>
			(value.routes.find(
				(route) => route.group === "media",
			).evidence.codec = "wrong"),
		(value) =>
			value.routes
				.find(
					(route) => route.group === "pdf" && route.output !== "txt",
				)
				.evidence.pages.pop(),
	]) {
		const changed = structuredClone(report);
		mutate(changed);
		await assert.rejects(
			validateFormatMatrix(changed, { os: "linux", arch: "aarch64" }),
		);
	}
});
