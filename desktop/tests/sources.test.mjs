import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp,
	mkdir,
	writeFile,
	readFile,
	rm,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
	parseControl,
	sourceIdentity,
	builtUsing,
	relativeName,
	fileInfo,
	inspectBundle,
	auditSources,
	verifyDsc,
} from "../../scripts/lib/desktop-sources.mjs";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const save = async (p, data) => {
	await mkdir(join(p, ".."), { recursive: true });
	await writeFile(p, data);
};
const json = (p, obj) => save(p, JSON.stringify(obj));
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-source-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const manifest = {
		schema: 2,
		kind: "bundled",
		os: "linux",
		arch: "aarch64",
		engines: {},
		files: {},
	};
	const provenance = {
		schema: 1,
		packages: {
			"fixture:arm64": "fixture:arm64\t1.2+b1\tfixture-src\t1.2",
		},
		resources: {},
	};
	for (const id of ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]) {
		const name = "bin/" + id,
			bytes = Buffer.from("test " + id);
		await save(join(root, name), bytes);
		manifest.files[name] = { sha256: hash(bytes), bytes: bytes.length };
		manifest.engines[id] = { path: name, sha256: hash(bytes) };
		provenance.resources[name] = {
			source: "/explicit/usr/bin/" + id,
			...manifest.files[name],
			package:
				id === "pandoc"
					? "extracted-deb-see-provenance"
					: "fixture:arm64",
		};
	}
	for (const name of [
		"licenses/fixture_arm64.copyright",
		"licenses/extracted-pandoc.copyright",
	]) {
		const body = Buffer.from("Fixture license notice");
		await save(join(root, name), body);
		manifest.files[name] = { sha256: hash(body), bytes: body.length };
	}
	const body = JSON.stringify(provenance);
	await save(join(root, "provenance.json"), body);
	manifest.files["provenance.json"] = {
		sha256: hash(body),
		bytes: Buffer.byteLength(body),
	};
	await json(join(root, "engines.json"), manifest);
	const catalog = {
		schema: 1,
		debs: [
			{
				file: "pandoc.deb",
				sha256: "a".repeat(64),
				control:
					"Package: pandoc\nVersion: 3.1+b2\nSource: pandoc-src (3.1)\nBuilt-Using: static-lib (= 2:4.0-1)\n",
				resources: {
					"bin/pandoc": {
						member: "usr/bin/pandoc",
						...manifest.files["bin/pandoc"],
					},
				},
			},
		],
	};
	return { root, manifest, provenance, catalog };
}
test("Debian source identity preserves epoch and binNMU distinction", () => {
	assert.deepEqual(
		sourceIdentity(
			parseControl(
				"Package: example\nVersion: 2:1.0-2+b1\nSource: original (2:1.0-2)\n",
			),
		),
		{
			package: "example",
			version: "2:1.0-2+b1",
			source: "original",
			sourceVersion: "2:1.0-2",
		},
	);
	assert.equal(
		sourceIdentity(parseControl("Package: example\nVersion: 1.0\n")).source,
		"example",
	);
	assert.throws(() =>
		sourceIdentity({ package: "bad;command", version: "1.0" }),
	);
	assert.throws(() =>
		sourceIdentity({
			package: "example",
			version: "1.0",
			source: "bad (= 1.0)",
		}),
	);
});
test("control parser handles signed CRLF and rejects duplicate fields", () => {
	const signed =
		"-----BEGIN PGP SIGNED MESSAGE-----\r\nHash: SHA256\r\n\r\nSource: demo\r\nVersion: 1.0\r\n-----BEGIN PGP SIGNATURE-----\r\nfake\r\n";
	assert.equal(parseControl(signed).source, "demo");
	assert.throws(() => parseControl("Version: 1\nversion: 2"));
	assert.throws(() => parseControl(" continuation"));
});
test("both static source declaration fields require exact versions", () => {
	assert.deepEqual(
		builtUsing({
			"built-using": "one (= 1.2),\n two (= 2:3.0)",
			"static-built-using": "three (= 4.0)",
		}).map((x) => x.source),
		["one", "two", "three"],
	);
	assert.throws(() => builtUsing({ "built-using": "one (>= 1)" }));
});
test("bundle audit checks every byte and rejects unlisted or changed files", async (t) => {
	const f = await fixture(t);
	await inspectBundle(f.root);
	await save(join(f.root, "unlisted"), "extra");
	await assert.rejects(inspectBundle(f.root), /unlisted/);
	await rm(join(f.root, "unlisted"));
	await save(join(f.root, "bin/magick"), "modified");
	await assert.rejects(inspectBundle(f.root), /integrity/);
});
test("package-relative files reject traversal and symbolic links", async (t) => {
	for (const name of [
		"../escape",
		"/absolute",
		"a//b",
		"a/./b",
		"C:drive",
		"a\\b",
	])
		assert.throws(() => relativeName(name));
	const f = await fixture(t);
	await symlink(join(f.root, "bin/magick"), join(f.root, "link"));
	await assert.rejects(fileInfo(f.root, "link"), /Symlink/);
});
test("exact Debian content resolves extracted resources and preserves static source requirements", async (t) => {
	const f = await fixture(t);
	const bundle = await inspectBundle(f.root);
	const missing = await auditSources(bundle);
	assert.equal(missing.counts.unresolvedRuntimeFiles, 1);
	const report = await auditSources(bundle, f.catalog);
	assert.equal(report.counts.mappedRuntimeFiles, 5);
	assert.equal(report.counts.unresolvedRuntimeFiles, 0);
	assert.equal(report.counts.sourceVersions, 3);
	assert.equal(report.redistributionApproved, false);
	assert.equal(
		report.sources.find((s) => s.source === "fixture-src").version,
		"1.2",
	);
	assert.equal(
		report.sources.find((s) => s.source === "static-lib").version,
		"2:4.0-1",
	);
});
test("wrong or ambiguous Debian content cannot certify package ownership", async (t) => {
	const f = await fixture(t);
	const bundle = await inspectBundle(f.root);
	f.catalog.debs[0].resources["bin/pandoc"].sha256 = "b".repeat(64);
	assert.equal(
		(await auditSources(bundle, f.catalog)).counts.unresolvedRuntimeFiles,
		1,
	);
	f.catalog.debs.push(structuredClone(f.catalog.debs[0]));
	await assert.rejects(auditSources(bundle, f.catalog), /Ambiguous/);
});
async function source(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-dsc-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const files = {
		"demo_1.0.orig.tar.xz": "source archive fixture",
		"demo_1.0-1.debian.tar.xz": "patch/build fixture",
	};
	for (const [name, body] of Object.entries(files))
		await save(join(root, name), body);
	const text =
		"Format: 3.0 (quilt)\nSource: demo\nVersion: 1.0-1\nChecksums-Sha256:\n" +
		Object.entries(files)
			.map(([n, b]) => ` ${hash(b)} ${Buffer.byteLength(b)} ${n}`)
			.join("\n") +
		"\n";
	await save(join(root, "demo.dsc"), text);
	return { root, text };
}
test("source descriptor requires exact hashes, lengths and the Debian patch archive", async (t) => {
	const f = await source(t);
	const report = await verifyDsc(f.root, "demo.dsc");
	assert.equal(report.files.length, 2);
	assert.equal(report.signatureVerification, "not-performed");
	await save(join(f.root, "demo_1.0.orig.tar.xz"), "corrupt");
	await assert.rejects(verifyDsc(f.root, "demo.dsc"), /mismatch/);
	await save(join(f.root, "demo_1.0.orig.tar.xz"), "source archive fixture");
	await save(
		join(f.root, "demo.dsc"),
		f.text
			.split("\n")
			.filter((l) => !l.includes(".debian.tar"))
			.join("\n"),
	);
	await assert.rejects(verifyDsc(f.root, "demo.dsc"), /patches/);
});
test("another source version cannot satisfy a matching package name", async (t) => {
	const f = await fixture(t),
		bundle = await inspectBundle(f.root);
	const report = await auditSources(bundle, f.catalog, [
		{ source: "fixture-src", sourceVersion: "99", files: [] },
	]);
	assert.equal(
		report.sources.find((s) => s.source === "fixture-src").delivery.status,
		"missing",
	);
});
test("source descriptor refuses path escapes and missing declared files", async (t) => {
	const f = await source(t);
	await save(
		join(f.root, "demo.dsc"),
		f.text.replace("demo_1.0.orig.tar.xz", "../escape.tar.xz"),
	);
	await assert.rejects(verifyDsc(f.root, "demo.dsc"), /checksum/);
	await save(join(f.root, "demo.dsc"), f.text);
	await rm(join(f.root, "demo_1.0.orig.tar.xz"));
	await assert.rejects(verifyDsc(f.root, "demo.dsc"), /ENOENT/);
});
test(
	"Debian catalog reads real archive content without installing or extracting it",
	{ skip: process.platform !== "linux" },
	async (t) => {
		const f = await fixture(t),
			debRoot = join(f.root, "deb-root"),
			debs = join(f.root, "debs");
		await mkdir(debs);
		await save(
			join(debRoot, "DEBIAN/control"),
			"Package: pandoc\nVersion: 3.1\nArchitecture: all\nMaintainer: Test <test@example.invalid>\nDescription: Test fixture\n",
		);
		await save(join(debRoot, "usr/bin/pandoc"), "test pandoc");
		execFileSync(
			"dpkg-deb",
			["--build", debRoot, join(debs, "pandoc.deb")],
			{ stdio: "pipe", timeout: 10000 },
		);
		const catalog = JSON.parse(
			execFileSync(
				"python3",
				[
					"scripts/desktop-deb-catalog.py",
					"--provenance",
					join(f.root, "provenance.json"),
					"--debs",
					debs,
					"--extracted-root",
					"/explicit",
				],
				{ encoding: "utf8", timeout: 20000 },
			),
		);
		assert.equal(catalog.debs.length, 1);
		assert.equal(
			catalog.debs[0].resources["bin/pandoc"].sha256,
			hash("test pandoc"),
		);
		assert.match(catalog.debs[0].control, /Package: pandoc/);
		assert.equal(
			await readFile(join(debRoot, "usr/bin/pandoc"), "utf8"),
			"test pandoc",
		);
	},
);

test("installed metadata must match the recorded binary and source versions", async (t) => {
	const f = await fixture(t),
		bundle = await inspectBundle(f.root);
	f.catalog.system = [
		"Package: fixture\nVersion: 1.2+b1\nSource: fixture-src (1.2)\nArchitecture: arm64\nStatic-Built-Using: unicode-data (= 15.1.0-1)\n",
	];
	const report = await auditSources(bundle, f.catalog);
	assert.equal(report.counts.unverifiedSystemMetadata, 0);
	assert.ok(
		report.sources.some(
			(s) => s.source === "unicode-data" && s.version === "15.1.0-1",
		),
	);
	f.catalog.system[0] = f.catalog.system[0].replace("1.2+b1", "1.2+b2");
	const stale = await auditSources(bundle, f.catalog);
	assert.equal(stale.counts.unverifiedSystemMetadata, 1);
	assert.ok(!stale.sources.some((s) => s.source === "unicode-data"));
});
test("missing notices are distinguished from unmapped runtime files", async (t) => {
	const f = await fixture(t),
		bundle = await inspectBundle(f.root);
	delete bundle.manifest.files["licenses/fixture_arm64.copyright"];
	const report = await auditSources(bundle, f.catalog);
	assert.equal(report.counts.missingLicenseNotices, 1);
	assert.equal(report.counts.unresolvedRuntimeFiles, 0);
	assert.equal(report.status, "incomplete");
});
test("an arbitrary transformation cannot bypass origin integrity", async (t) => {
	const f = await fixture(t),
		bundle = await inspectBundle(f.root);
	bundle.provenance.resources["bin/magick"].transformation =
		"trust these replacement bytes";
	await assert.rejects(
		auditSources(bundle, f.catalog),
		/Unsupported resource transformation/,
	);
});

test("audit refuses output inside the original engine bundle", async (t) => {
	const f = await fixture(t);
	assert.throws(
		() =>
			execFileSync(
				process.execPath,
				[
					"scripts/desktop-sources.mjs",
					"--engines",
					f.root,
					"--output",
					join(f.root, "audit"),
				],
				{ stdio: "pipe", timeout: 10000 },
			),
		/immutable engine bundle/,
	);
	await assert.rejects(readFile(join(f.root, "audit/audit.json")), /ENOENT/);
	await inspectBundle(f.root);
});
