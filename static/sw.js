const CACHE_NAME = "vert-wasm-cache-v4"; // remove old CDN engine cache entries

const WASM_FILES = ["/pandoc.wasm"];

// Only this site's immutable engines are cached. Vite source modules stay fresh.
function shouldCacheUrl(url) {
	const target = new URL(url);
	if (target.origin !== self.location.origin || target.search) return false;
	return (
		target.pathname === "/pandoc.wasm" ||
		/^\/_app\/immutable\/(?:assets\/(?:[^/]+\.wasm|ffmpeg-core[.-][^/]+\.js)|workers\/.+\.(?:js|wasm))$/.test(
			target.pathname,
		)
	);
}

self.addEventListener("install", (event) => {
	console.log("[SW] installing service worker");

	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			const staticFiles = WASM_FILES.filter((file) =>
				file.startsWith("/"),
			);
			if (staticFiles.length > 0) {
				console.log("[SW] pre-caching static files:", staticFiles);
				return cache.addAll(staticFiles).catch((err) => {
					console.warn("[SW] failed to pre-cache some files:", err);
				});
			}
		}),
	);

	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames.map((cacheName) => {
						if (
							cacheName !== CACHE_NAME &&
							cacheName.startsWith("vert-wasm-cache")
						) {
							console.log("[SW] deleting old cache:", cacheName);
							return caches.delete(cacheName);
						}
					}),
				);
			})
			.then(() => {
				return self.clients.claim();
			}),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (
		request.method !== "GET" ||
		request.headers.has("range") ||
		!shouldCacheUrl(request.url)
	)
		return;

	const readCached = () =>
		caches.open(CACHE_NAME).then((cache) => cache.match(request));
	const fetchAndCache = async (revalidate = false) => {
		const response = await fetch(
			revalidate ? new Request(request, { cache: "no-cache" }) : request,
		);
		if (response.status === 200) {
			const copy = response.clone();
			event.waitUntil(
				caches
					.open(CACHE_NAME)
					.then((cache) => cache.put(request, copy))
					.catch((error) =>
						console.warn(
							"[SW] failed to cache:",
							request.url,
							error,
						),
					),
			);
		}
		return response;
	};

	event.respondWith(
		(async () => {
			// Pandoc has no fingerprint in its URL: revalidate online, use the
			// current cache only when offline. Hashed/versioned assets are immutable.
			if (new URL(request.url).pathname === "/pandoc.wasm") {
				try {
					return await fetchAndCache(true);
				} catch (error) {
					const cached = await readCached().catch(() => undefined);
					if (cached) return cached;
					throw error;
				}
			}
			const cached = await readCached().catch(() => undefined);
			return cached || fetchAndCache();
		})(),
	);
});

self.addEventListener("message", (event) => {
	if (!event.data || !event.ports[0]) return;
	const type = event.data.type;

	if (type === "GET_CACHE_INFO") {
		event.waitUntil(
			caches.open(CACHE_NAME).then(async (cache) => {
				const keys = await cache.keys();
				let totalSize = 0;
				const files = [];

				for (const request of keys) {
					try {
						const response = await cache.match(request);
						if (response) {
							const blob = await response.blob();
							const size = blob.size;
							totalSize += size;

							files.push({
								url: request.url,
								size: size,
								type:
									response.headers.get("content-type") ||
									"unknown",
							});
						}
					} catch (err) {
						console.warn(
							"[SW] failed to get info for cached file:",
							request.url,
							err,
						);
					}
				}

				event.ports[0].postMessage({
					totalSize,
					fileCount: files.length,
					files,
				});
			}),
		);
	}

	if (type === "CLEAR_CACHE") {
		event.waitUntil(
			caches
				.delete(CACHE_NAME)
				.then(() => {
					console.log("[SW] cache cleared");
					return caches.open(CACHE_NAME);
				})
				.then(() => {
					event.ports[0].postMessage({ success: true });
				})
				.catch((err) => {
					console.error("[SW] failed to clear cache:", err);
					event.ports[0].postMessage({
						success: false,
						error: err.message,
					});
				}),
		);
	}
});
