import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp,
	mkdir,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
	verifyRelease,
	stageRelease,
} from "../scripts/desktop-web-source-release.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-source-release-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const catalog = {
		schema: 2,
		engines: [
			{
				name: "test-engine",
				version: "1.2.3",
				sha256: "b".repeat(64),
				sourceCommit: "c".repeat(40),
				sourceStatus: "verified-rebuilt",
				sourceEvidence: "evidence/test-engine.json",
			},
		],
	};
	const archive = Buffer.from("synthetic corresponding-source archive");
	await writeFile(join(root, "test-engine.tar.gz"), archive);
	const evidence = {
		wasmSha256: catalog.engines[0].sha256,
		archiveSha256: digest(archive),
		archive: "test-engine.tar.gz",
	};
	await mkdir(join(root, "evidence"));
	await writeFile(
		join(root, "evidence", "test-engine.json"),
		JSON.stringify(evidence),
	);
	const manifest = {
		schema: 1,
		status: "draft-local-only",
		urlPlan: {
			status: "location-selected",
			pattern:
				"https://github.com/web-casa/z8work/releases/download/<tag>/<file>",
			releaseTag: "desktop-source-1",
		},
		artifacts: [
			{
				engine: "test-engine",
				version: "1.2.3",
				releaseFileName:
					"z8work-test-engine-1.2.3-corresponding-source.tar.gz",
				localArchive: "test-engine.tar.gz",
				sha256: digest(archive),
				bytes: archive.length,
				wasmSha256: catalog.engines[0].sha256,
				sourceCommit: catalog.engines[0].sourceCommit,
				verificationStatus: catalog.engines[0].sourceStatus,
				evidence: "evidence/test-engine.json",
				publishedUrl: null,
				publishedAt: null,
			},
		],
	};
	return { root, catalog, manifest, archive };
}

test("a consistent manifest passes verification and staging writes SHA256SUMS", async (t) => {
	const { root, catalog, manifest, archive } = await fixture(t);
	assert.deepEqual(verifyRelease(catalog, manifest), []);
	const output = join(root, "staged");
	const staged = await stageRelease({ catalog, manifest, output, root });
	assert.equal(staged.length, 1);
	assert.deepEqual(
		await readFile(join(output, manifest.artifacts[0].releaseFileName)),
		archive,
	);
	const sums = await readFile(join(output, "SHA256SUMS"), "utf8");
	assert.equal(
		sums,
		`${digest(archive)}  ${manifest.artifacts[0].releaseFileName}\n`,
	);
	const readme = await readFile(join(output, "README.txt"), "utf8");
	assert.match(readme, /nothing here is published/);
	assert.match(readme, new RegExp(manifest.artifacts[0].wasmSha256));
	await assert.rejects(
		stageRelease({ catalog, manifest, output, root }),
		/non-empty/,
	);
});

test("verification rejects catalog drift and premature publication claims", async (t) => {
	const { catalog, manifest } = await fixture(t);
	const drift = structuredClone(manifest);
	drift.artifacts[0].wasmSha256 = "d".repeat(64);
	assert.ok(
		verifyRelease(catalog, drift).some((i) => i.includes("wasmSha256")),
	);
	for (const patch of [
		["version", "9.9.9"],
		["sourceCommit", "e".repeat(40)],
		["verificationStatus", "verified-upstream"],
		["evidence", "evidence/other.json"],
		["releaseFileName", "../escape.tar.gz"],
	]) {
		const copy = structuredClone(manifest);
		copy.artifacts[0][patch[0]] = patch[1];
		assert.ok(verifyRelease(catalog, copy).length > 0, patch[0]);
	}
	const empty = structuredClone(manifest);
	empty.artifacts = [];
	assert.ok(verifyRelease(catalog, empty).some((i) => i.includes("exactly")));
	const premature = structuredClone(manifest);
	premature.artifacts[0].publishedUrl = "https://example.invalid/src.tar.gz";
	assert.ok(
		verifyRelease(catalog, premature).some((i) =>
			i.includes("publication"),
		),
	);
	const unknown = structuredClone(manifest);
	unknown.artifacts[0].engine = "missing-engine";
	assert.ok(
		verifyRelease(catalog, unknown).some((i) => i.includes("engines.json")),
	);
});

test("staging refuses archives or evidence that no longer bind", async (t) => {
	const { root, catalog, manifest } = await fixture(t);
	await rm(join(root, manifest.artifacts[0].localArchive));
	await assert.rejects(
		stageRelease({ catalog, manifest, output: join(root, "out1"), root }),
		/(digest mismatch|no such file)/,
	);
	await writeFile(join(root, manifest.artifacts[0].localArchive), "tampered");
	await assert.rejects(
		stageRelease({ catalog, manifest, output: join(root, "out2"), root }),
		/digest mismatch/,
	);
	const staleEvidence = structuredClone(manifest);
	staleEvidence.artifacts[0].sha256 = digest(Buffer.from("tampered"));
	await assert.rejects(
		stageRelease({
			catalog,
			manifest: staleEvidence,
			output: join(root, "out3"),
			root,
		}),
		/differs from evidence/,
	);
	assert.equal(
		await readdir(root).then(
			(f) => f.filter((x) => x.startsWith("out")).length,
		),
		0,
	);
});

test("the z8.work source page renders final URLs and matches the checked-in page", async (t) => {
	const { catalog, manifest } = await fixture(t);
	const { renderSourcePage, artifactUrl, formatBytes } = await import(
		"../scripts/desktop-web-source-page.mjs"
	);
	const url = artifactUrl(manifest, manifest.artifacts[0]);
	assert.equal(
		url,
		`https://github.com/web-casa/z8work/releases/download/desktop-source-1/${manifest.artifacts[0].releaseFileName}`,
	);
	assert.equal(formatBytes(1281196), "1,281,196 bytes (1.2 MiB)");
	const html = renderSourcePage(catalog, manifest);
	assert.ok(html.includes(manifest.artifacts[0].releaseFileName));
	assert.ok(html.includes(url));
	assert.ok(!/<script\b|<iframe\b|<form\b/.test(html));
	assert.throws(() => formatBytes(0));
	const published = structuredClone(manifest);
	published.artifacts[0].publishedUrl = "https://mirror.invalid/src.tar.gz";
	assert.equal(
		artifactUrl(published, published.artifacts[0]),
		"https://mirror.invalid/src.tar.gz",
	);
	const checkedIn = await readFile(
		new URL("../static/desktop-source/index.html", import.meta.url),
		"utf8",
	);
	const { engines: realEngines } = JSON.parse(
		await readFile("packaging/desktop-web/engines.json", "utf8"),
	);
	const realManifest = JSON.parse(
		await readFile("packaging/desktop-web/source-release.json", "utf8"),
	);
	assert.equal(
		renderSourcePage({ engines: realEngines }, realManifest),
		checkedIn,
	);
});
