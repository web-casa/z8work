import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256 } from "../scripts/lib/desktop-artifacts.mjs";
const script = resolve("scripts/desktop-web-release.mjs");
test("release preflight binds source evidence, bundled WASM and offline notices", async () => {
	const root = await mkdtemp(join(tmpdir(), "z8-web-release-"));
	const put = async (path, value) => {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(
			join(root, path),
			typeof value === "string" ? value : JSON.stringify(value),
		);
	};
	const run = () => {
		const result = spawnSync(process.execPath, [script, "check"], {
			cwd: root,
			encoding: "utf8",
		});
		assert.notEqual(result.status, null, result.stderr);
		return { code: result.status, ...JSON.parse(result.stdout) };
	};
	try {
		await put("src-tauri/tauri.conf.json", {
			identifier: "work.z8.desktop.m0",
			version: "0.2.0",
		});
		await put("src-tauri/Cargo.toml", 'version = "0.2.0"');
		await put("packaging/desktop-web/tauri.release.json", {
			productName: "Z8.Work",
			identifier: "work.z8.desktop.m0",
		});
		const engines = [];
		for (let i = 0; i < 5; i++) {
			const bytes = `fixture-wasm-${i}`;
			await put(`engine-${i}.wasm`, bytes);
			await put(`desktop/dist/${i}.wasm`, bytes);
			await put(`source-${i}.tar`, "source fixture");
			await put(`build-input-${i}`, "fixed build input");
			await put(`evidence-${i}.json`, {
				verificationMethod: "rebuilt",
				wasmSha256: sha256(bytes),
				wasmByteIdentical: true,
				reviewedBy: "fixture reviewer",
				buildInputs: [
					{
						file: `build-input-${i}`,
						sha256: sha256("fixed build input"),
					},
				],
				archive: `source-${i}.tar`,
				archiveSha256: sha256("source fixture"),
			});
			engines.push({
				name: `engine-${i}`,
				file: `engine-${i}.wasm`,
				sha256: sha256(bytes),
				sourceStatus: "verified-rebuilt",
				sourceEvidence: `evidence-${i}.json`,
				sourceDelivery: {
					status: "published",
					url: `https://z8.work/sources/engine-${i}.tar`,
				},
				distributionReview: { status: "approved" },
			});
		}
		const catalog = { schema: 2, engines };
		await put("packaging/desktop-web/engines.json", catalog);
		await put("lock", "locked");
		await put("notices/license", "license text");
		await put("notices/dossier.json", {
			target: "aarch64-apple-darwin",
			missingNotices: [],
			inputs: { lock: sha256("locked") },
			components: [
				{
					notices: [
						{ file: "license", sha256: sha256("license text") },
					],
				},
			],
		});
		const offline = JSON.stringify({
			target: "aarch64-apple-darwin",
			components: [{ notices: ["license text"] }],
		});
		await put("desktop/dist/desktop-notices.json", offline);
		await put(".desktop-local/web-notices-current.json", {
			directory: "notices",
			offlineSha256: sha256(offline),
		});
		assert.equal(run().code, 0);
		engines[0].sourceStatus = "blocked";
		await put("packaging/desktop-web/engines.json", catalog);
		assert.match(
			run().issues.join("\n"),
			/corresponding-source evidence missing/,
		);
		engines[0].sourceStatus = "verified-rebuilt";
		await put("packaging/desktop-web/engines.json", catalog);
		await put("build-input-0", "changed input");
		assert.match(run().issues.join("\n"), /changed build input/);
		await put("build-input-0", "fixed build input");
		await put("source-0.tar", "wrong archive");
		assert.match(run().issues.join("\n"), /source archive digest mismatch/);
		await put("source-0.tar", "source fixture");
		await put("desktop/dist/unexpected.wasm", "unregistered");
		assert.match(run().issues.join("\n"), /Unknown bundled WASM/);
		await rm(join(root, "desktop/dist/unexpected.wasm"));
		await put(
			"desktop/dist/desktop-notices.json",
			offline.replace("license text", "changed text"),
		);
		assert.match(
			run().issues.join("\n"),
			/Offline notice content digest mismatch/,
		);
		await put("desktop/dist/desktop-notices.json", offline);
		await put("lock", "changed");
		assert.match(run().issues.join("\n"), /Stale notices: lock/);
		await put("lock", "locked");
		assert.equal(run().code, 0);
		engines[0].sourceDelivery = { status: "pending", url: null };
		await put("packaging/desktop-web/engines.json", catalog);
		assert.match(run().issues.join("\n"), /not publicly delivered/);
		engines[0].sourceDelivery = {
			status: "published",
			url: "https://z8.work/sources/engine-0.tar",
		};
		engines[0].distributionReview = { status: "pending" };
		await put("packaging/desktop-web/engines.json", catalog);
		assert.match(run().issues.join("\n"), /license review is not approved/);
		engines[0].distributionReview = { status: "approved" };
		engines[0].sourceStatus = "verified-upstream";
		await put("evidence-0.json", {
			verificationMethod: "upstream-release",
			wasmSha256: engines[0].sha256,
			reviewedBy: "fixture reviewer",
			buildInputs: [
				{
					file: "build-input-0",
					sha256: sha256("fixed build input"),
				},
			],
			archive: "source-0.tar",
			archiveSha256: sha256("source fixture"),
			dependenciesReviewed: true,
			upstreamAsset: {
				release: "fixture-v1",
				url: "https://example.test/fixture.zip",
				archiveSha256: sha256("release fixture"),
				wasmSha256: engines[0].sha256,
			},
		});
		await put("packaging/desktop-web/engines.json", catalog);
		assert.equal(run().code, 0);
		const upstream = JSON.parse(
			await readFile(join(root, "evidence-0.json"), "utf8"),
		);
		delete upstream.upstreamAsset.release;
		await put("evidence-0.json", upstream);
		assert.match(run().issues.join("\n"), /incomplete source evidence/);
		engines[0].sourceStatus = "verified-rebuilt-replacement";
		await put("evidence-0.json", {
			verificationMethod: "replacement-rebuild",
			replacementArtifact: true,
			wasmSha256: engines[0].sha256,
			wasmByteIdentical: false,
			independentBuilds: 2,
			buildNetwork: "none",
			reviewedBy: "fixture reviewer",
			buildInputs: [
				{
					file: "build-input-0",
					sha256: sha256("fixed build input"),
				},
			],
			archive: "source-0.tar",
			archiveSha256: sha256("source fixture"),
			runtimeValidation: { status: "passed" },
			nondeterminismReview: {
				status: "documented",
				builds: [
					{
						name: "build-1",
						rawSha256: sha256("raw output 1"),
						optimizedSha256: engines[0].sha256,
					},
					{
						name: "build-2",
						rawSha256: sha256("raw output 2"),
						optimizedSha256: sha256("independent output"),
					},
				],
			},
		});
		await put("packaging/desktop-web/engines.json", catalog);
		assert.equal(run().code, 0);
		const replacement = JSON.parse(
			await readFile(join(root, "evidence-0.json"), "utf8"),
		);
		replacement.nondeterminismReview.builds[1].optimizedSha256 =
			replacement.nondeterminismReview.builds[0].optimizedSha256;
		await put("evidence-0.json", replacement);
		assert.match(run().issues.join("\n"), /incomplete source evidence/);
		replacement.nondeterminismReview.builds[1].optimizedSha256 =
			sha256("independent output");
		delete replacement.runtimeValidation;
		await put("evidence-0.json", replacement);
		assert.match(run().issues.join("\n"), /incomplete source evidence/);
		// A human-readable reviewed flag cannot bypass evidence checks.
		delete engines[0].sourceEvidence;
		await put("packaging/desktop-web/engines.json", catalog);
		assert.equal(run().code, 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
