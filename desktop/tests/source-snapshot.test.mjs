import test from "node:test";
import assert from "node:assert/strict";
import {
	mkdtemp,
	mkdir,
	writeFile,
	readFile,
	rm,
	symlink,
	link,
	lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import {
	snapshotPlan,
	acquireSnapshot,
	snapshotMetadata,
	downloadFile,
} from "../../scripts/lib/desktop-source-snapshot.mjs";
const execute = promisify(execFile);
const body = Buffer.from("verified source archive bytes");
const digest = (algorithm, bytes) =>
	createHash(algorithm).update(bytes).digest("hex");
const spec = {
	name: "source.tar.xz",
	bytes: body.length,
	sha1: digest("sha1", body),
	sha256: digest("sha256", body),
	urls: ["https://snapshot.debian.org/file/" + digest("sha1", body)],
};
async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-snapshot-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return root;
}
function metadata() {
	const hashes = ["a".repeat(40), "b".repeat(40)];
	return {
		package: "source",
		version: "1:2.3-4",
		result: hashes.map((hash) => ({ hash })),
		fileinfo: Object.fromEntries(
			hashes.map((hash, i) => [
				hash,
				[
					{
						name: i ? spec.name : "source.dsc",
						size: i ? spec.bytes : 300,
						archive_name: "debian",
						path: "/pool/main/s/source",
					},
				],
			]),
		),
	};
}
test("snapshot metadata binds the precise source/epoch and official archive", () => {
	const plan = snapshotPlan(metadata(), "source", "1:2.3-4");
	assert.equal(plan.length, 2);
	assert.equal(
		plan[1].urls[0],
		"https://deb.debian.org/debian/pool/main/s/source/source.tar.xz",
	);
	assert.throws(
		() => snapshotPlan(metadata(), "source", "2.3-4"),
		/mismatch/,
	);
	const altered = metadata();
	altered.fileinfo["a".repeat(40)][0].archive_name = "third-party";
	assert.throws(() => snapshotPlan(altered, "source", "1:2.3-4"), /official/);
});
test("snapshot metadata rejects unsafe paths, ambiguous identities and oversized files", () => {
	for (const name of ["../outside.dsc", "nested/file.dsc", "bad\\file.dsc"]) {
		const data = metadata();
		data.fileinfo["a".repeat(40)][0].name = name;
		assert.throws(() => snapshotPlan(data, "source", "1:2.3-4"));
	}
	const huge = metadata();
	huge.fileinfo["a".repeat(40)][0].size = 3 * 1024 ** 2;
	assert.throws(() => snapshotPlan(huge, "source", "1:2.3-4"), /oversized/);
	const duplicate = metadata();
	duplicate.result.push(duplicate.result[0]);
	assert.throws(
		() => snapshotPlan(duplicate, "source", "1:2.3-4"),
		/identity/,
	);
});
test("download verifies both hashes and reuses a complete file without network", async (t) => {
	const root = await fixture(t);
	assert.equal(
		await downloadFile(root, spec, {
			request: async () => new Response(body),
		}),
		"downloaded",
	);
	assert.deepEqual(await readFile(join(root, spec.name)), body);
	assert.equal(
		await downloadFile(root, spec, {
			request: () => {
				throw new Error("unexpected network");
			},
		}),
		"reused",
	);
});
test("real HTTP range response resumes retained prefix", async (t) => {
	const root = await fixture(t);
	await writeFile(join(root, spec.name + ".part"), body.subarray(0, 7));
	const server = createServer((req, res) => {
		assert.equal(req.headers.range, "bytes=7-");
		res.writeHead(206, {
			"Content-Range": `bytes 7-${body.length - 1}/${body.length}`,
			"Content-Length": body.length - 7,
		});
		res.end(body.subarray(7));
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => {
		server.closeAllConnections();
		server.close();
	});
	await downloadFile(root, spec, {
		request: (_url, options) =>
			fetch(`http://127.0.0.1:${server.address().port}`, options),
	});
	assert.deepEqual(await readFile(join(root, spec.name)), body);
});
test("server ignoring Range restarts rather than appending a whole response", async (t) => {
	const root = await fixture(t);
	await writeFile(join(root, spec.name + ".part"), body.subarray(0, 5));
	await downloadFile(root, spec, { request: async () => new Response(body) });
	assert.deepEqual(await readFile(join(root, spec.name)), body);
});
test("wrong ranges, encoding and length never publish a final file", async (t) => {
	for (const headers of [
		{ "Content-Range": "bytes 0-1/2" },
		{
			"Content-Range": `bytes 0-${body.length - 1}/${body.length}`,
			"Content-Length": "999",
		},
		{ "Content-Encoding": "gzip" },
	]) {
		const root = await fixture(t);
		await assert.rejects(
			downloadFile(root, spec, {
				request: async () =>
					new Response(body, { status: 206, headers }),
			}),
			/Invalid|Encoded/,
		);
		await assert.rejects(lstat(join(root, spec.name)), { code: "ENOENT" });
	}
});
test("truncated response is retained and a subsequent run resumes it", async (t) => {
	const root = await fixture(t);
	await assert.rejects(
		downloadFile(root, spec, {
			request: async () => new Response(body.subarray(0, 5)),
		}),
		/Truncated/,
	);
	await downloadFile(root, spec, {
		request: async (_url, options) => {
			assert.equal(options.headers.Range, "bytes=5-");
			return new Response(body.subarray(5), {
				status: 206,
				headers: {
					"Content-Range": `bytes 5-${body.length - 1}/${body.length}`,
				},
			});
		},
	});
	assert.deepEqual(await readFile(join(root, spec.name)), body);
});
test("corrupt cached prefix fails full checksum and can be downloaded cleanly next time", async (t) => {
	const root = await fixture(t);
	await writeFile(join(root, spec.name + ".part"), "xxxxx");
	await assert.rejects(
		downloadFile(root, spec, {
			request: async () =>
				new Response(body.subarray(5), {
					status: 206,
					headers: {
						"Content-Range": `bytes 5-${body.length - 1}/${body.length}`,
					},
				}),
		}),
		/checksum/,
	);
	await assert.rejects(lstat(join(root, spec.name)), { code: "ENOENT" });
	await downloadFile(root, spec, { request: async () => new Response(body) });
});
test("SHA-1 alone cannot override descriptor SHA-256 and existing files are not replaced", async (t) => {
	const root = await fixture(t);
	await assert.rejects(
		downloadFile(
			root,
			{ ...spec, sha256: "0".repeat(64) },
			{ request: async () => new Response(body) },
		),
		/checksum/,
	);
	await writeFile(join(root, spec.name), "existing data");
	await assert.rejects(downloadFile(root, spec), /Existing/);
	assert.equal(
		await readFile(join(root, spec.name), "utf8"),
		"existing data",
	);
});
test("failure falls back to official historical URL; arbitrary URLs are rejected", async (t) => {
	const root = await fixture(t);
	let attempts = 0;
	await downloadFile(
		root,
		{
			...spec,
			urls: ["https://deb.debian.org/debian/pool/source", ...spec.urls],
		},
		{
			request: async () =>
				++attempts === 1
					? new Response("gone", { status: 404 })
					: new Response(body),
		},
	);
	assert.equal(attempts, 2);
	await assert.rejects(
		downloadFile(await fixture(t), {
			...spec,
			urls: ["https://attacker.example/archive"],
		}),
		/Untrusted/,
	);
});
test("symlinks and deadline cancellation do not modify outside files or publish completion", async (t) => {
	const root = await fixture(t),
		outside = join(root, "outside");
	await writeFile(outside, "untouched");
	await symlink(outside, join(root, spec.name + ".part"));
	await assert.rejects(downloadFile(root, spec), /Non-regular/);
	assert.equal(await readFile(outside, "utf8"), "untouched");
	await assert.rejects(
		downloadFile(await fixture(t), spec, {
			signal: AbortSignal.abort(new Error("deadline")),
		}),
		/deadline/,
	);
});
test("CLI rejects stale resume binding and releases the workspace lock", async (t) => {
	const root = await fixture(t);
	const audit = {
		schema: 1,
		sourceDistribution: "debian-13",
		engineManifestSha256: "a".repeat(64),
		sources: [
			{
				source: "source",
				version: "1.0-1",
				delivery: { status: "missing" },
			},
		],
	};
	await writeFile(join(root, "audit.json"), JSON.stringify(audit));
	await writeFile(join(root, "plan.json"), "{}");
	await assert.rejects(
		execute(process.execPath, [
			"scripts/desktop-source-snapshot.mjs",
			"--audit",
			join(root, "audit.json"),
			"--output",
			root,
			"--resume",
		]),
		/Resume plan/,
	);
	await assert.rejects(lstat(join(root, ".lock")), { code: "ENOENT" });
});

test("historical aliases use the exact filename named by the source descriptor", async (t) => {
	const root = await fixture(t),
		data = metadata();
	const description = Buffer.from(
		`Format: 3.0 (native)\nSource: source\nVersion: 1:2.3-4\nChecksums-Sha256:\n ${spec.sha256} ${spec.bytes} ${spec.name}\n`,
	);
	const dscHash = digest("sha1", description);
	data.fileinfo[dscHash] = [
		{ ...data.fileinfo["a".repeat(40)][0], size: description.length },
	];
	data.fileinfo[spec.sha1] = [
		{ ...data.fileinfo["b".repeat(40)][0], name: "old-name.tar.xz" },
		...data.fileinfo["b".repeat(40)],
	];
	data.result = [{ hash: dscHash }, { hash: spec.sha1 }];
	const files = snapshotPlan(data, "source", "1:2.3-4");
	assert.deepEqual(
		files[1].aliases.map((a) => a.name),
		["old-name.tar.xz", spec.name],
	);
	const result = await acquireSnapshot(
		root,
		"source",
		"1:2.3-4",
		{ files },
		AbortSignal.timeout(5000),
		async (url) =>
			new Response(url.endsWith("source.dsc") ? description : body),
	);
	assert.equal(result.files[0].file, spec.name);
	await assert.rejects(lstat(join(root, "old-name.tar.xz")), {
		code: "ENOENT",
	});
});
test("hard-linked partial files cannot be truncated by a resume", async (t) => {
	const root = await fixture(t),
		outside = join(root, "outside");
	await writeFile(outside, "untouched");
	await link(outside, join(root, spec.name + ".part"));
	await assert.rejects(downloadFile(root, spec), /Non-regular/);
	assert.equal(await readFile(outside, "utf8"), "untouched");
});
test("a stalled HTTP response is aborted by the overall deadline", async (t) => {
	const root = await fixture(t);
	const server = createServer((_req, res) => {
		res.writeHead(200);
		res.write(body.subarray(0, 4));
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => {
		server.closeAllConnections();
		server.close();
	});
	await assert.rejects(
		downloadFile(root, spec, {
			signal: AbortSignal.timeout(100),
			request: (_url, options) =>
				fetch(`http://127.0.0.1:${server.address().port}`, options),
		}),
		/aborted|timeout/i,
	);
	await assert.rejects(lstat(join(root, spec.name)), { code: "ENOENT" });
});

test("metadata retries network failures once and does not retry a missing version", async () => {
	let attempts = 0;
	const result = await snapshotMetadata(
		"source",
		"1:2.3-4",
		AbortSignal.timeout(5000),
		async () => {
			if (++attempts === 1) throw new Error("connection reset");
			return Response.json(metadata());
		},
	);
	assert.equal(attempts, 2);
	assert.equal(result.files.length, 2);
	attempts = 0;
	await assert.rejects(
		snapshotMetadata(
			"source",
			"1:2.3-4",
			AbortSignal.timeout(5000),
			async () => {
				attempts++;
				return new Response("missing", { status: 404 });
			},
		),
		/404/,
	);
	assert.equal(attempts, 1);
});
test("CLI refuses a workspace held by another collector", async (t) => {
	const root = await fixture(t);
	await mkdir(join(root, ".lock"));
	await writeFile(join(root, ".lock", "owner.json"), "other owner");
	await writeFile(
		join(root, "audit.json"),
		JSON.stringify({
			schema: 1,
			sourceDistribution: "debian-13",
			engineManifestSha256: "a".repeat(64),
			sources: [
				{
					source: "source",
					version: "1.0-1",
					delivery: { status: "missing" },
				},
			],
		}),
	);
	await assert.rejects(
		execute(process.execPath, [
			"scripts/desktop-source-snapshot.mjs",
			"--audit",
			join(root, "audit.json"),
			"--output",
			root,
			"--resume",
		]),
		/EEXIST/,
	);
	assert.equal(
		await readFile(join(root, ".lock", "owner.json"), "utf8"),
		"other owner",
	);
});
test("SIGTERM produces a failed checkpoint and releases the collector lock", async (t) => {
	const root = await fixture(t),
		output = join(root, "output"),
		marker = join(root, "network-started");
	await writeFile(
		join(root, "audit.json"),
		JSON.stringify({
			schema: 1,
			sourceDistribution: "debian-13",
			engineManifestSha256: "a".repeat(64),
			sources: [
				{
					source: "source",
					version: "1.0-1",
					delivery: { status: "missing" },
				},
			],
		}),
	);
	await writeFile(
		join(root, "preload.mjs"),
		`import { writeFile } from 'node:fs/promises'; globalThis.fetch = async (_url, { signal }) => { signal.throwIfAborted(); await writeFile(${JSON.stringify(marker)}, 'started'); return new Promise((_resolve, reject) => { const timer = setInterval(() => {}, 1000); signal.addEventListener('abort', () => { clearInterval(timer); reject(signal.reason); }, { once: true }); }); };`,
	);
	const job = execute(process.execPath, [
		"--import",
		join(root, "preload.mjs"),
		"scripts/desktop-source-snapshot.mjs",
		"--audit",
		join(root, "audit.json"),
		"--output",
		output,
	]);
	const finished = job.then(
		(r) => r,
		(e) => e,
	);
	t.after(() => job.child.kill("SIGKILL"));
	let ready = false;
	for (let i = 0; i < 100; i++) {
		try {
			await lstat(marker);
			ready = true;
			break;
		} catch {
			await delay(10);
		}
	}
	assert.ok(ready, "collector reached mocked network");
	job.child.kill("SIGTERM");
	const result = await Promise.race([
		finished,
		delay(3000, undefined, { ref: false }).then(() => {
			throw new Error("interrupted collector did not exit");
		}),
	]);
	assert.equal(result.code, 1);
	const report = JSON.parse(
		await readFile(join(output, "downloads.json"), "utf8"),
	);
	assert.equal(report.status, "incomplete");
	assert.match(report.sources[0].error, /interrupted/);
	await assert.rejects(lstat(join(output, ".lock")), { code: "ENOENT" });
});
