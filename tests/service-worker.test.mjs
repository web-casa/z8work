import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
	new URL("../static/sw.js", import.meta.url),
	"utf8",
);
const origin = "https://z8.work";
const current = "vert-wasm-cache-v4";
const magick = `${origin}/_app/immutable/assets/magick.abc123.wasm`;

function harness() {
	const listeners = new Map();
	const storage = new Map();
	const network = [];
	let offline = false;
	let status = 200;
	let claimed = false;
	const caches = {
		async open(name) {
			if (!storage.has(name)) storage.set(name, new Map());
			const entries = storage.get(name);
			return {
				async match(request) {
					return entries.get(request.url)?.clone();
				},
				async put(request, response) {
					entries.set(request.url, response.clone());
				},
				async keys() {
					return [...entries.keys()].map((url) => new Request(url));
				},
			};
		},
		async keys() {
			return [...storage.keys()];
		},
		async delete(name) {
			return storage.delete(name);
		},
		async match() {
			throw new Error("Must not search unrelated caches");
		},
	};
	vm.runInNewContext(source, {
		URL,
		Request,
		Response,
		console,
		caches,
		fetch: async (request) => {
			network.push(request);
			if (offline) throw new Error("offline");
			return new Response("fresh", { status });
		},
		self: {
			location: new URL(`${origin}/sw.js`),
			addEventListener: (type, listener) => listeners.set(type, listener),
			skipWaiting: async () => {},
			clients: {
				claim: async () => {
					claimed = true;
				},
			},
		},
	});
	return {
		storage,
		network,
		caches,
		set offline(value) {
			offline = value;
		},
		set status(value) {
			status = value;
		},
		get claimed() {
			return claimed;
		},
		async seed(name, url, body) {
			await (
				await caches.open(name)
			).put(new Request(url), new Response(body));
		},
		async dispatch(type, extra = {}) {
			const pending = [];
			let response;
			listeners.get(type)({
				waitUntil: (promise) => pending.push(promise),
				respondWith: (promise) => {
					response = promise;
				},
				...extra,
			});
			const result = await response;
			await Promise.all(pending);
			return result;
		},
		async request(url, init) {
			return this.dispatch("fetch", { request: new Request(url, init) });
		},
	};
}

test("development WASM, Vite URL modules and source workers bypass the cache", async () => {
	const sw = harness();
	for (const path of [
		"/node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm",
		"/node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm?import&url",
		"/node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm?t=1234",
		"/src/lib/workers/magick.ts?worker_file&type=module",
		"/src/lib/workers/magick.js",
	]) {
		await sw.seed("vert-wasm-cache-v2", origin + path, "stale");
		assert.equal(await sw.request(origin + path), undefined);
	}
	assert.equal(sw.network.length, 0);
});

test("activation removes only old app caches and claims clients", async () => {
	const sw = harness();
	for (const name of [
		"vert-wasm-cache-v1",
		"vert-wasm-cache-v2",
		"vert-wasm-cache-v3",
		current,
		"other-app-cache",
	])
		await sw.caches.open(name);
	await sw.dispatch("activate");
	assert.deepEqual(await sw.caches.keys(), [current, "other-app-cache"]);
	assert.equal(sw.claimed, true);
});

test("immutable assets use only the current cache, including offline", async () => {
	const sw = harness();
	await sw.seed("vert-wasm-cache-v2", magick, "stale");
	await sw.seed("other-app-cache", magick, "unrelated");
	assert.equal(await (await sw.request(magick)).text(), "fresh");
	sw.offline = true;
	assert.equal(await (await sw.request(magick)).text(), "fresh");
	assert.equal(sw.network.length, 1);
});

test("unversioned Pandoc revalidates online and falls back offline", async () => {
	const sw = harness();
	const url = origin + "/pandoc.wasm";
	await sw.seed(current, url, "old-pandoc");
	assert.equal(await (await sw.request(url)).text(), "fresh");
	assert.equal(sw.network[0].cache, "no-cache");
	sw.offline = true;
	assert.equal(await (await sw.request(url)).text(), "fresh");
});

test("offline misses fail without serving old cache versions", async () => {
	const sw = harness();
	await sw.seed("vert-wasm-cache-v2", magick, "old");
	sw.offline = true;
	await assert.rejects(sw.request(magick), /offline/);
});

test("same-origin FFmpeg core and WASM cache offline; old CDN URLs bypass the cache", async () => {
	const sw = harness();
	for (const path of ["ffmpeg-core.abc123.wasm", "ffmpeg-core-abc123.js"]) {
		const url = `${origin}/_app/immutable/assets/${path}`;
		sw.offline = false;
		assert.equal(await (await sw.request(url)).text(), "fresh");
		sw.offline = true;
		assert.equal(await (await sw.request(url)).text(), "fresh");
		assert.equal(await sw.request(url + "?import&url"), undefined);
	}
	for (const url of [
		"https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm",
		"https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js",
		"https://example.com/pandoc.wasm",
		"https://example.com/assets/magick.wasm",
	])
		assert.equal(await sw.request(url), undefined);
});

test("POST, Range requests and failed responses are not cached", async () => {
	const sw = harness();
	assert.equal(await sw.request(magick, { method: "POST" }), undefined);
	assert.equal(
		await sw.request(magick, { headers: { Range: "bytes=0-20" } }),
		undefined,
	);
	sw.status = 404;
	assert.equal((await sw.request(magick)).status, 404);
	assert.equal(sw.storage.get(current).size, 0);
});

test("cache information and clearing preserve their existing message contract", async () => {
	const sw = harness();
	await sw.seed(current, magick, "12345");
	let info;
	await sw.dispatch("message", {
		data: { type: "GET_CACHE_INFO" },
		ports: [
			{
				postMessage: (value) => {
					info = value;
				},
			},
		],
	});
	assert.equal(info.totalSize, 5);
	assert.equal(info.fileCount, 1);
	let cleared;
	await sw.dispatch("message", {
		data: { type: "CLEAR_CACHE" },
		ports: [
			{
				postMessage: (value) => {
					cleared = value;
				},
			},
		],
	});
	assert.equal(cleared.success, true);
	assert.equal(sw.storage.get(current).size, 0);
});
