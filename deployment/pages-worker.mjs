// Only generated, oversized engine URLs invoke this Worker. User files are
// processed in the browser; this handler only serves packaged engine assets.
export function createPagesWorker(assets) {
	return {
		async fetch(request, env) {
			const url = new URL(request.url);
			const asset = Object.hasOwn(assets, url.pathname)
				? assets[url.pathname]
				: undefined;
			if (!asset) return env.ASSETS.fetch(request);
			if (request.method !== "GET" && request.method !== "HEAD") {
				return new Response("Method not allowed", {
					status: 405,
					headers: { Allow: "GET, HEAD" },
				});
			}

			const headers = new Headers({
				"Content-Type": "application/wasm",
				"Content-Encoding": "gzip",
				"Content-Length": String(asset.size),
				"Cache-Control": asset.cacheControl,
				ETag: asset.etag,
				Vary: "Accept-Encoding",
				"X-Content-Type-Options": "nosniff",
			});
			const matches = request.headers.get("If-None-Match")?.split(",");
			if (
				matches?.some(
					(tag) =>
						tag.trim() === "*" ||
						tag.trim().replace(/^W\//, "") ===
							asset.etag.replace(/^W\//, ""),
				)
			) {
				headers.delete("Content-Length");
				return new Response(null, { status: 304, headers });
			}
			if (request.method === "HEAD")
				return new Response(null, { headers, encodeBody: "manual" });

			url.pathname = asset.path;
			url.search = "";
			// Fetch stored gzip bytes without forwarding cookies, body, Range, or
			// conditional headers. A Range request may legally receive a full 200.
			const response = await env.ASSETS.fetch(
				new Request(url, {
					headers: { "Accept-Encoding": "identity" },
				}),
			);
			if (
				response.status !== 200 ||
				response.headers.get("Content-Type")?.includes("text/html")
			) {
				await response.body?.cancel();
				return new Response("Engine asset unavailable", {
					status: 502,
					headers: { "Cache-Control": "no-store" },
				});
			}
			// Workers otherwise compress these already-compressed bytes a second
			// time. The runtime negotiates delivery to the browser; JS reads WASM.
			return new Response(response.body, {
				headers,
				encodeBody: "manual",
			});
		},
	};
}
