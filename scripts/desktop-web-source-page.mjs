// Generate the z8.work corresponding-source download page from source-release.json.
// Deterministic output, no scripts and no remote fetches; --check reports drift.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { escapeHtml } from "./lib/desktop-store.mjs";

export const sourcePagePath = "static/desktop-source/index.html";

export function artifactUrl(manifest, artifact) {
	if (artifact.publishedUrl) return artifact.publishedUrl;
	const plan = manifest.urlPlan ?? {};
	if (typeof plan.pattern === "string" && plan.releaseTag)
		return plan.pattern
			.replaceAll("<tag>", plan.releaseTag)
			.replaceAll("<file>", artifact.releaseFileName);
	return null;
}

export function formatBytes(bytes) {
	if (!Number.isInteger(bytes) || bytes <= 0)
		throw new Error("Invalid archive size");
	const grouped = String(bytes).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const gib = bytes / 1024 ** 3;
	const mib = bytes / 1024 ** 2;
	const human =
		gib >= 1
			? `${(Math.round(gib * 100) / 100).toFixed(2)} GiB`
			: `${(Math.round(mib * 10) / 10).toFixed(1)} MiB`;
	return `${grouped} bytes (${human})`;
}

export function renderSourcePage(catalog, manifest) {
	const plan = manifest.urlPlan ?? {};
	if (!["draft-local-only", "published"].includes(manifest.status))
		throw new Error("Unexpected manifest status for the source page");
	const engines = new Map(catalog.engines.map((e) => [e.name, e]));
	const rows = manifest.artifacts.map((artifact) => {
		const engine = engines.get(artifact.engine);
		if (!engine) throw new Error(`Unknown engine: ${artifact.engine}`);
		const url = artifactUrl(manifest, artifact);
		const action = url
			? `<p><a href="${escapeHtml(url)}" rel="noopener noreferrer">Download</a> · <a href="${escapeHtml(url)}" lang="zh-Hans" rel="noopener noreferrer">下载</a></p>`
			: `<p>Download URL pending publication / <span lang="zh-Hans">下载地址待发布</span></p>`;
		return `<section><h2><code>${escapeHtml(artifact.releaseFileName)}</code></h2><p>${escapeHtml(engine.name)} ${escapeHtml(engine.version)} · <span lang="zh-Hans">许可</span> / License: ${escapeHtml(engine.license)}</p><p>${escapeHtml(formatBytes(artifact.bytes))}<br>SHA-256: <code>${escapeHtml(artifact.sha256)}</code><br><span lang="zh-Hans">对应应用内 WASM</span> / WASM: <code>${escapeHtml(engine.sha256)}</code><br><span lang="zh-Hans">源码提交</span> / commit: <code>${escapeHtml(engine.sourceCommit)}</code></p>${action}</section>`;
	});
	const sumsUrl = artifactUrl(manifest, {
		releaseFileName: "SHA256SUMS",
		publishedUrl: null,
	});
	const style =
		".notice{background:#ffc09a;border:2px solid;padding:16px}body{margin:0;background:#fffdeb;color:#192126;font:18px/1.7 system-ui,sans-serif}header,main,footer{max-width:900px;margin:auto;padding:24px}header{border-bottom:3px solid;display:flex;gap:24px;flex-wrap:wrap;justify-content:space-between}a{color:#006c70;text-underline-offset:4px}a:focus-visible{outline:3px solid;outline-offset:4px}h1{font-size:clamp(28px,5vw,42px);line-height:1.2}section{border-top:1px solid #bbb9ad;padding:12px 0}nav{display:flex;gap:16px;flex-wrap:wrap}footer{border-top:3px solid;font-size:16px}p{overflow-wrap:anywhere}@media(max-width:500px){header,main,footer{padding:18px}}";
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow"><meta name="description" content="Corresponding source downloads for the WebAssembly engines bundled in the Z8.Work desktop app.">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Corresponding source downloads — Z8.Work</title>
<style>${style}</style></head>
<body><header><strong>Z8.Work</strong><nav aria-label="Links"><a href="https://github.com/web-casa/z8work" rel="noopener noreferrer">GitHub</a> <a href="mailto:contact@web.casa">contact@web.casa</a></nav></header>
<main><h1>Corresponding source downloads</h1><p lang="zh-Hans">对应源码下载</p>
<p>The Z8.Work desktop app bundles five WebAssembly conversion engines. Under their licenses, the complete corresponding source for the exact binaries shipped in the app is provided here and in the linked release. <span lang="zh-Hans">Z8.Work 桌面版内置五个 WebAssembly 转换引擎。按照其许可证要求，这里提供与随包二进制精确对应的完整源码及构建说明。</span></p>
${manifest.status === "published" ? "" : `<p class="notice">Draft / <span lang="zh-Hans">草案</span>: download links may not resolve until the corresponding-source release is published. <span lang="zh-Hans">下载链接在源码发布生效前可能无法访问。</span></p>`}
<p><span lang="zh-Hans">核验方式</span> / How to verify: download the archives and <code>SHA256SUMS</code>, then run <code>sha256sum -c SHA256SUMS</code>. Archive: <a href="${escapeHtml(sumsUrl ?? plan.releaseTag ?? "")}" rel="noopener noreferrer">${escapeHtml(plan.releaseTag ?? "pending")}</a></p>
${rows.join("\n")}
<p><span lang="zh-Hans">应用自身以 AGPL-3.0 提供，应用源码见</span> The app itself is AGPL-3.0; its source is at <a href="https://github.com/web-casa/z8work" rel="noopener noreferrer">web-casa/z8work</a>.</p></main>
<footer><nav><a href="/">Z8.Work</a> <a href="/desktop-info/en/privacy/">Desktop privacy</a> <a href="/desktop-info/zh-Hans/privacy/" lang="zh-Hans">桌面版隐私说明</a></nav></footer></body></html>
`;
}

async function runCli() {
	const mode = process.argv[2];
	if (mode && mode !== "--check")
		throw new Error("Usage: desktop-web-source-page [--check]");
	const [catalog, manifest] = await Promise.all([
		readFile("packaging/desktop-web/engines.json", "utf8").then(JSON.parse),
		readFile("packaging/desktop-web/source-release.json", "utf8").then(
			JSON.parse,
		),
	]);
	const html = renderSourcePage(catalog, manifest);
	if (mode === "--check") {
		if ((await readFile(sourcePagePath, "utf8")) !== html)
			throw new Error(`Source page drift: ${sourcePagePath}`);
		console.log(`Source page up to date: ${sourcePagePath}`);
	} else {
		await mkdir(dirname(sourcePagePath), { recursive: true });
		await writeFile(sourcePagePath, html);
		console.log(`Source page written: ${sourcePagePath}`);
	}
}

// CLI entry point only; importing this module must not write anything.
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	await runCli();
}
