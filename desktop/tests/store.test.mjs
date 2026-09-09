import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
	loadStore,
	renderPage,
	validateContent,
	readReference,
	pngDimensions,
	assessChannel,
	pagePath,
} from "../../scripts/lib/desktop-store.mjs";
import { sha256 } from "../../scripts/lib/desktop-artifacts.mjs";

const shot = await readFile(
	new URL(
		"../../docs/desktop/evidence/phase3/linux-arm64-window.png",
		import.meta.url,
	),
);
async function fixture(t, packageBytes) {
	const root = await mkdtemp(join(tmpdir(), "z8-store-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const data = await loadStore();
	const save = async (file, bytes) => {
		if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(JSON.stringify(bytes));
		await writeFile(join(root, file), bytes);
		return { file, sha256: sha256(bytes) };
	};
	const pkg = await save(
		"candidate.snap",
		packageBytes ?? Buffer.from("hsqs-synthetic-test-fixture"),
	);
	const reports = {};
	const sourceCommit = "a".repeat(40);
	const raw = await save(
		"raw.log",
		Buffer.from(
			"Synthetic unit fixture only; no native acceptance performed.",
		),
	);
	for (const check of [
		"integrity",
		"conversion",
		"gui",
		"install",
		"upgrade",
		"uninstall",
		"licenses",
		"faults",
		"performance",
		"strict-confinement",
		"portal",
	])
		reports[check] = {
			status: "passed",
			report: await save(`${check}.json`, {
				schema: 1,
				check,
				artifact: "linux-amd64-snap",
				os: "linux",
				arch: "x86_64",
				sourceCommit,
				execution: "native",
				evidence: [raw],
				status: "passed",
				artifactSha256: pkg.sha256,
			}),
		};
	const evidence = {
		schema: 1,
		sourceCommit,
		artifact: "linux-amd64-snap",
		redistributionApproved: true,
		sha256: pkg.sha256,
		buildInfo: {
			schema: 1,
			version: data.matrix.version,
			os: "linux",
			arch: "x86_64",
			engines: "bundled",
			debug: false,
			customProtocol: true,
			fileDialog: "xdg-portal",
			processLifetime: "watchdog-pipe-v1",
			updater: false,
		},
		packageIdentity: { name: "z8-work-fixture" },
		checks: reports,
	};
	data.submission.channels.snap = {
		artifact: "linux-amd64-snap",
		displayName: "Z8.Work",
		registeredName: "z8-work-fixture",
		pricing: "free",
		candidate: {
			package: pkg,
			evidence: await save("acceptance.json", evidence),
		},
		screenshots: [],
	};
	for (const locale of data.matrix.languages) {
		const image = await save(`${locale}.png`, shot);
		data.submission.channels.snap.screenshots.push({
			...image,
			locale,
			os: "linux",
			arch: "x86_64",
			candidateSha256: pkg.sha256,
			caption: "Synthetic gate fixture; not store capture evidence",
			captureReport: await save(`capture-${locale}.json`, {
				status: "passed",
				artifactSha256: pkg.sha256,
				screenshotSha256: image.sha256,
				locale,
				os: "linux",
				arch: "x86_64",
			}),
		});
	}
	data.submission.publicPages = {
		status: "verified",
		evidence: await save("pages.json", {
			pages: data.matrix.languages.flatMap((locale) =>
				["privacy", "support"].map((kind) => ({
					url: new URL(pagePath(locale, kind), data.content.website)
						.href,
					status: 200,
					sha256: sha256(
						Buffer.from(renderPage(data.content, locale, kind)),
					),
				})),
			),
		}),
	};
	return { root, ...data, save, evidence };
}
const assess = (f) =>
	assessChannel(f.root, f.content, f.submission, f.matrix, "snap");
test("current store drafts retain all unresolved acceptance and account gates", async () => {
	const { content, submission, matrix } = await loadStore();
	for (const channel of ["snap", "microsoft-store"]) {
		const report = await assessChannel(
			process.cwd(),
			content,
			submission,
			matrix,
			channel,
		);
		assert.equal(report.status, "blocked");
		assert.ok(report.blockers.some((s) => s.includes("candidate")));
		assert.ok(report.blockers.some((s) => s.includes("deployed")));
	}
});
test("listing languages, supported text and store field limits are checked", async () => {
	const { content, matrix } = await loadStore();
	validateContent(content, matrix);
	for (const patch of [
		{ summary: "a".repeat(80) },
		{ description: "<b>HTML</b>" },
		{ description: "https://example.org" },
	]) {
		const copy = structuredClone(content);
		Object.assign(copy.locales.en, patch);
		assert.throws(() => validateContent(copy, matrix));
	}
	const copy = structuredClone(content);
	delete copy.locales.en;
	assert.throws(() => validateContent(copy, matrix));
});
test("privacy/support pages escape text, work without scripts and match checked-in output", async () => {
	const { content, matrix } = await loadStore();
	for (const locale of matrix.languages)
		for (const kind of ["privacy", "support"]) {
			const html = renderPage(content, locale, kind);
			assert.equal(
				await readFile(
					`static${pagePath(locale, kind)}index.html`,
					"utf8",
				),
				html,
			);
			assert.ok(!/<script\b|<iframe\b|<form\b/.test(html));
			assert.match(html, /noindex,follow/);
			assert.match(html, /contact@web.casa/);
		}
	const copy = structuredClone(content);
	copy.locales.en.privacy[0].body = '<img src=x onerror="bad()">';
	assert.ok(renderPage(copy, "en", "privacy").includes("&lt;img"));
	assert.throws(() => renderPage(content, "other", "privacy"));
});
test("PNG validation rejects truncation, forged dimensions and corrupt image bytes", () => {
	assert.deepEqual(pngDimensions(shot), { width: 1100, height: 800 });
	assert.throws(() => pngDimensions(shot.subarray(0, 24)));
	const bad = Buffer.from(shot);
	bad.writeUInt32BE(999999, 16);
	assert.throws(() => pngDimensions(bad));
	const corrupt = Buffer.from(shot);
	corrupt[corrupt.length - 20] ^= 1;
	assert.throws(() => pngDimensions(corrupt));
});
test("hashed references reject stale files and paths outside the dossier workspace", async (t) => {
	const f = await fixture(t);
	const ref = await f.save("data.json", { x: 1 });
	await readReference(f.root, ref);
	await writeFile(join(f.root, ref.file), "changed");
	await assert.rejects(readReference(f.root, ref), /hash/);
	for (const file of ["../x", "/etc/passwd", "a/../x", "a\\b", "C:/x"])
		await assert.rejects(readReference(f.root, { ...ref, file }), /path/);
	if (process.platform !== "win32") {
		await symlink(join(f.root, "data.json"), join(f.root, "link"));
		await assert.rejects(
			readReference(f.root, { ...ref, file: "link" }),
			/symlink/,
		);
	}
});
test("synthetic complete metadata reaches human review, not store approval", async (t) => {
	const f = await fixture(t);
	const report = await assess(f);
	assert.equal(report.status, "ready-for-human-review");
	assert.equal(report.publication, "not-requested");
});
test("a passed string without a hashed check report cannot release a candidate", async (t) => {
	const f = await fixture(t);
	f.evidence.checks.install.report = "claimed passed";
	f.submission.channels.snap.candidate.evidence = await f.save(
		"acceptance.json",
		f.evidence,
	);
	const report = await assess(f);
	assert.equal(report.status, "blocked");
	assert.ok(report.blockers.some((b) => b.includes("reference")));
});
test("another platform's screenshot and a stale public policy stay blocked", async (t) => {
	const f = await fixture(t);
	f.submission.channels.snap.screenshots[0].arch = "aarch64";
	f.content.locales.en.privacy[0].body += " Updated policy.";
	const report = await assess(f);
	assert.ok(report.blockers.some((b) => b.includes("Screenshot")));
	assert.ok(report.blockers.some((b) => b.includes("stale")));
});
test("candidate swap invalidates every previous acceptance report", async (t) => {
	const f = await fixture(t);
	f.submission.channels.snap.candidate.package = await f.save(
		"candidate.snap",
		Buffer.from("hsqs-new-synthetic-candidate"),
	);
	assert.ok(
		(await assess(f)).blockers.some((b) => b.includes("exact candidate")),
	);
});

test("an explicit incomplete redistribution review blocks even passing check reports", async (t) => {
	const f = await fixture(t);
	f.evidence.redistributionApproved = false;
	f.submission.channels.snap.candidate.evidence = await f.save(
		"acceptance.json",
		f.evidence,
	);
	assert.ok(
		(await assess(f)).blockers.some((b) => b.includes("Redistribution")),
	);
});

test("package validation streams candidates larger than the JSON evidence limit", async (t) => {
	const bytes = Buffer.alloc(9 * 1024 * 1024);
	bytes.write("hsqs");
	const f = await fixture(t, bytes);
	assert.equal((await assess(f)).status, "ready-for-human-review");
});

test("one acceptance report cannot stand in for a different check", async (t) => {
	const f = await fixture(t);
	f.evidence.checks.install.report = f.evidence.checks.conversion.report;
	f.submission.channels.snap.candidate.evidence = await f.save(
		"acceptance.json",
		f.evidence,
	);
	const report = await assess(f);
	assert.equal(report.status, "blocked");
	assert.ok(report.blockers.some((b) => b.includes("check identity")));
});

test("foreign, emulated, stale-source and unsupported check reports remain blocked", async (t) => {
	const f = await fixture(t);
	const original = JSON.parse(
		(
			await readReference(f.root, f.evidence.checks.install.report)
		).toString(),
	);
	for (const patch of [
		{ arch: "aarch64" },
		{ os: "windows" },
		{ sourceCommit: "b".repeat(40) },
		{ execution: "emulated" },
		{ execution: "static" },
		{ evidence: [] },
		{ schema: 2 },
	]) {
		f.evidence.checks.install.report = await f.save("install.json", {
			...original,
			...patch,
		});
		f.submission.channels.snap.candidate.evidence = await f.save(
			"acceptance.json",
			f.evidence,
		);
		assert.equal(
			(await assess(f)).status,
			"blocked",
			JSON.stringify(patch),
		);
	}
});

test("missing fault or performance acceptance blocks an otherwise complete dossier", async (t) => {
	const f = await fixture(t);
	for (const name of ["faults", "performance"]) {
		const saved = f.evidence.checks[name];
		delete f.evidence.checks[name];
		f.submission.channels.snap.candidate.evidence = await f.save(
			"acceptance.json",
			f.evidence,
		);
		assert.ok((await assess(f)).blockers.some((b) => b.includes(name)));
		f.evidence.checks[name] = saved;
	}
});

test("raw evidence must exist and retain its reviewed bytes", async (t) => {
	const f = await fixture(t);
	await writeFile(join(f.root, "raw.log"), "tampered");
	assert.ok(
		(await assess(f)).blockers.some((b) => b.includes("hash mismatch")),
	);
	await rm(join(f.root, "raw.log"));
	assert.equal((await assess(f)).status, "blocked");
});

test("standalone candidate gate also verifies concrete report references", async (t) => {
	const f = await fixture(t);
	const args = [
		"scripts/desktop-candidate-check.mjs",
		"--artifact",
		"linux-amd64-snap",
		"--evidence",
		join(f.root, "acceptance.json"),
		"--file",
		join(f.root, "candidate.snap"),
		"--root",
		f.root,
	];
	assert.match(
		execFileSync(process.execPath, args, { encoding: "utf8" }),
		/references verified/,
	);
	f.evidence.checks.install.report = f.evidence.checks.conversion.report;
	await f.save("acceptance.json", f.evidence);
	assert.throws(
		() => execFileSync(process.execPath, args, { stdio: "pipe" }),
		/check identity/,
	);
});
