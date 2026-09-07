import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { preparePages } from "../scripts/prepare-pages.mjs";
import { createPagesWorker } from "../deployment/pages-worker.mjs";

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "z8-pages-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const input = join(root, "build");
	const output = join(root, "pages");
	await mkdir(join(input, "_app/immutable/assets"), { recursive: true });
	await writeFile(
		join(input, "index.html"),
		"<!doctype html><title>Z8.Work</title>",
	);
	return { input, output };
}

test("Pages packages large engines losslessly and routes only their original URLs", async (t) => {
	const { input, output } = await fixture(t);
	const original = Buffer.alloc(2048, 42);
	await writeFile(join(input, "pandoc.wasm"), original);
	await writeFile(
		join(input, "_app/immutable/assets/ffmpeg-core.hash.wasm"),
		original,
	);
	await writeFile(join(input, "small.wasm"), "small");
	const assets = await preparePages(input, output, 1024);
	assert.deepEqual(Object.keys(assets).sort(), [
		"/_app/immutable/assets/ffmpeg-core.hash.wasm",
		"/pandoc.wasm",
	]);
	assert.deepEqual(await readFile(join(input, "pandoc.wasm")), original);
	assert.deepEqual(
		gunzipSync(await readFile(join(output, "pandoc.wasm.gz"))),
		original,
	);
	await assert.rejects(readFile(join(output, "pandoc.wasm")), {
		code: "ENOENT",
	});
	assert.equal(await readFile(join(output, "small.wasm"), "utf8"), "small");
	const routes = JSON.parse(
		await readFile(join(output, "_routes.json"), "utf8"),
	);
	assert.deepEqual(routes.include.sort(), Object.keys(assets).sort());
	assert.deepEqual(routes.exclude, []);
	assert.match(
		await readFile(join(output, "_worker.js"), "utf8"),
		/export default createPagesWorker/,
	);
	assert.match(assets["/pandoc.wasm"].cacheControl, /must-revalidate/);
	assert.match(
		assets["/_app/immutable/assets/ffmpeg-core.hash.wasm"].cacheControl,
		/immutable/,
	);
	assert.deepEqual(
		await preparePages(input, output, 1024),
		assets,
		"rebuild is deterministic",
	);
});

test("Pages rejects oversized non-engines and incompressible engines", async (t) => {
	const { input, output } = await fixture(t);
	await writeFile(join(input, "large.bin"), Buffer.alloc(2048));
	await assert.rejects(
		preparePages(input, output, 1024),
		/Pages asset exceeds/,
	);
	await rm(join(input, "large.bin"));
	await writeFile(join(input, "large.wasm"), randomBytes(2048));
	await assert.rejects(
		preparePages(input, output, 1024),
		/Compressed engine still exceeds/,
	);
});

test("Pages refuses an output that would overwrite the original build", async (t) => {
	const { input } = await fixture(t);
	await assert.rejects(preparePages(input, input), /must be separate/);
	await assert.rejects(
		preparePages(input, join(input, "nested")),
		/must be separate/,
	);
	await assert.rejects(
		preparePages(input, join(input, "..")),
		/must be separate/,
	);
	assert.match(await readFile(join(input, "index.html"), "utf8"), /Z8.Work/);
});

const bytes = gzipSync(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
const asset = {
	path: "/pandoc.wasm.gz",
	size: bytes.length,
	etag: 'W/"engine-version"',
	cacheControl: "public, max-age=0, must-revalidate, no-transform",
};
const worker = createPagesWorker({ "/pandoc.wasm": asset });

test("Pages Worker streams stored gzip with WASM headers, without forwarding user data", async () => {
	const response = await worker.fetch(
		new Request("https://z8.work/pandoc.wasm?ignored=1", {
			headers: { Cookie: "private=value", Range: "bytes=0-7" },
		}),
		{
			ASSETS: {
				async fetch(request) {
					assert.equal(request.url, "https://z8.work/pandoc.wasm.gz");
					assert.deepEqual(
						[...request.headers],
						[["accept-encoding", "identity"]],
					);
					assert.equal(request.method, "GET");
					return new Response(bytes, {
						headers: { "Content-Type": "application/gzip" },
					});
				},
			},
		},
	);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("Content-Type"), "application/wasm");
	assert.equal(response.headers.get("Content-Encoding"), "gzip");
	assert.equal(response.headers.get("Content-Length"), String(bytes.length));
	assert.equal(response.headers.get("ETag"), asset.etag);
	assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test("Pages Worker handles HEAD and conditional requests without fetching a body", async () => {
	const env = {
		ASSETS: {
			fetch() {
				assert.fail("must not fetch asset body");
			},
		},
	};
	const head = await worker.fetch(
		new Request("https://z8.work/pandoc.wasm", { method: "HEAD" }),
		env,
	);
	assert.equal(head.status, 200);
	assert.equal(await head.text(), "");
	for (const tag of ['"engine-version"', '"old", W/"engine-version"', "*"]) {
		const response = await worker.fetch(
			new Request("https://z8.work/pandoc.wasm", {
				headers: { "If-None-Match": tag },
			}),
			env,
		);
		assert.equal(response.status, 304);
		assert.equal(response.headers.get("Content-Length"), null);
		assert.equal(await response.text(), "");
	}
});

test("Pages Worker rejects uploads and does not disguise missing assets as successful WASM", async () => {
	const upload = await worker.fetch(
		new Request("https://z8.work/pandoc.wasm", {
			method: "POST",
			body: "private file",
		}),
		{},
	);
	assert.equal(upload.status, 405);
	for (const response of [
		new Response("missing", { status: 404 }),
		new Response("SPA", { headers: { "Content-Type": "text/html" } }),
	]) {
		const result = await worker.fetch(
			new Request("https://z8.work/pandoc.wasm"),
			{ ASSETS: { fetch: async () => response } },
		);
		assert.equal(result.status, 502);
		assert.equal(result.headers.get("Cache-Control"), "no-store");
	}
});

test("Pages Worker leaves other static paths to Pages", async () => {
	const request = new Request("https://z8.work/about/");
	const response = await worker.fetch(request, {
		ASSETS: {
			async fetch(received) {
				assert.equal(received, request);
				return new Response("about");
			},
		},
	});
	assert.equal(await response.text(), "about");
});
