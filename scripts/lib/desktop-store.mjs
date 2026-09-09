import { readFile, lstat, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import {
	artifactMatrix,
	sha256,
	validateBuild,
	validateEvidence,
} from "./desktop-artifacts.mjs";

export const storeRoot = new URL(
	"../../packaging/desktop/store/",
	import.meta.url,
);
export const pagePath = (locale, kind) => `/desktop-info/${locale}/${kind}/`;
export const escapeHtml = (text) =>
	String(text).replace(
		/[&<>"']/g,
		(c) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[c],
	);
export async function loadStore() {
	const [content, submission, matrix] = await Promise.all([
		readFile(new URL("content.json", storeRoot), "utf8").then(JSON.parse),
		readFile(new URL("submission.json", storeRoot), "utf8").then(
			JSON.parse,
		),
		artifactMatrix(),
	]);
	validateContent(content, matrix);
	if (submission.schema !== 1 || submission.status !== "draft")
		throw new Error(
			"Submission source must remain a draft; external store state is recorded separately",
		);
	return { content, submission, matrix };
}
export function validateContent(content, matrix) {
	if (
		content.schema !== 1 ||
		content.product !== "Z8.Work" ||
		content.contact !== "contact@web.casa" ||
		content.website !== "https://z8.work/" ||
		content.source !== "https://github.com/web-casa/z8work"
	)
		throw new Error("Unexpected product identity or contact");
	if (
		JSON.stringify(Object.keys(content.locales).sort()) !==
		JSON.stringify([...matrix.languages].sort())
	)
		throw new Error("Store languages must match the artifact matrix");
	for (const [locale, copy] of Object.entries(content.locales)) {
		for (const [key, max] of Object.entries({
			summary: 79,
			shortDescription: 1000,
			description: 10000,
		})) {
			if (
				typeof copy[key] !== "string" ||
				!copy[key].trim() ||
				copy[key].length > max ||
				/<[^>]+>|https?:\/\//i.test(copy[key])
			)
				throw new Error(`Invalid ${locale} ${key}`);
		}
		if (
			!Array.isArray(copy.features) ||
			!copy.features.length ||
			copy.features.some(
				(f) => typeof f !== "string" || !f.trim() || f.length > 200,
			)
		)
			throw new Error(`Invalid ${locale} features`);
		for (const kind of ["privacy", "support"]) {
			if (
				!Array.isArray(copy[kind]) ||
				copy[kind].length < 3 ||
				copy[kind].some(
					(section) =>
						!section.title?.trim() || !section.body?.trim(),
				)
			)
				throw new Error(`Incomplete ${locale} ${kind}`);
		}
	}
}
export function renderPage(content, locale, kind) {
	if (
		!["privacy", "support"].includes(kind) ||
		!Object.hasOwn(content.locales, locale)
	)
		throw new Error("Unknown documentation page");
	const c = content.locales[locale],
		h = escapeHtml;
	const url = new URL(pagePath(locale, kind), content.website).href;
	return `<!doctype html>
<html lang="${h(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow"><meta name="description" content="${h(c.draftNotice)}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${h(c[kind + "Title"])} — Z8.Work</title><link rel="canonical" href="${url}">
<style>body{margin:0;background:#fffdeb;color:#192126;font:18px/1.7 system-ui,sans-serif}header,main,footer{max-width:900px;margin:auto;padding:24px}header{border-bottom:3px solid;display:flex;gap:24px;flex-wrap:wrap;justify-content:space-between}a{color:#006c70;text-underline-offset:4px}a:focus-visible{outline:3px solid;outline-offset:4px}h1{font-size:clamp(28px,5vw,42px);line-height:1.2}h2{font-size:24px}section{border-top:1px solid #bbb9ad;padding:12px 0}nav{display:flex;gap:16px;flex-wrap:wrap}.notice{background:#ffc09a;border:2px solid;padding:16px}footer{border-top:3px solid;font-size:16px}p{overflow-wrap:anywhere}@media(max-width:500px){header,main,footer{padding:18px}}</style></head>
<body><header><strong>Z8.Work</strong><nav aria-label="Language / 语言">${Object.keys(
		content.locales,
	)
		.map(
			(l) =>
				`<a href="${pagePath(l, kind)}" lang="${l}"${l === locale ? ' aria-current="page"' : ""}>${l === "en" ? "English" : "简体中文"}</a>`,
		)
		.join(" ")}</nav></header>
<main><h1>${h(c[kind + "Title"])}</h1><p class="notice">${h(c.draftNotice)}</p><p>${h(c.updatedLabel)}: ${h(content.updated)}</p>
${c[kind].map((section) => `<section><h2>${h(section.title)}</h2><p>${h(section.body)}</p></section>`).join("\n")}
<p><a href="mailto:${h(content.contact)}">${h(content.contact)}</a> · <a href="${h(content.source)}" rel="noopener noreferrer">${h(c.sourceLabel)}</a></p></main>
<footer><nav><a href="${pagePath(locale, "privacy")}">${h(c.privacyTitle)}</a><a href="${pagePath(locale, "support")}">${h(c.supportTitle)}</a><a href="${h(content.website)}">${h(c.homeLabel)}</a></nav></footer></body></html>
`;
}
// Evidence paths stay inside the explicitly selected workspace. Do not follow symlinks.
async function referencePath(root, reference, maxBytes) {
	if (
		!reference ||
		typeof reference.file !== "string" ||
		!/^[a-f0-9]{64}$/.test(reference.sha256)
	)
		throw new Error("A file and SHA-256 reference are required");
	const name = reference.file;
	if (
		isAbsolute(name) ||
		name.includes("\\") ||
		name.includes(":") ||
		name.split("/").some((p) => !p || p === "." || p === "..")
	)
		throw new Error("Unsafe evidence path");
	root = await realpath(root);
	let path = root;
	for (const part of name.split("/")) {
		path = resolve(path, part);
		if ((await lstat(path)).isSymbolicLink())
			throw new Error("Evidence symlink rejected");
	}
	if (relative(root, path).startsWith(`..${sep}`))
		throw new Error("Evidence path escapes workspace");
	const info = await lstat(path);
	if (!info.isFile() || info.size > maxBytes)
		throw new Error("Invalid evidence file");
	return path;
}
export async function readReference(
	root,
	reference,
	maxBytes = 8 * 1024 * 1024,
) {
	const path = await referencePath(root, reference, maxBytes);
	const bytes = await readFile(path);
	if (sha256(bytes) !== reference.sha256)
		throw new Error(`Evidence hash mismatch: ${reference.file}`);
	return bytes;
}
async function packageReference(root, reference) {
	const path = await referencePath(root, reference, 2 * 1024 * 1024 * 1024);
	const hash = createHash("sha256");
	let signature = Buffer.alloc(0);
	for await (const chunk of createReadStream(path)) {
		if (!signature.length) signature = chunk.subarray(0, 4);
		hash.update(chunk);
	}
	if (hash.digest("hex") !== reference.sha256)
		throw new Error("Package hash mismatch");
	return signature;
}
function crc32(bytes) {
	let n = 0xffffffff;
	for (const byte of bytes) {
		n ^= byte;
		for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
	}
	return (n ^ 0xffffffff) >>> 0;
}
export function pngDimensions(bytes) {
	if (
		bytes.length > 50_000_000 ||
		bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
	)
		throw new Error("Screenshot must be a PNG under 50 MB");
	let pos = 8,
		width,
		height,
		channels,
		ended = false;
	const data = [];
	while (pos < bytes.length) {
		if (pos + 12 > bytes.length) throw new Error("Truncated PNG");
		const len = bytes.readUInt32BE(pos),
			type = bytes.toString("ascii", pos + 4, pos + 8),
			end = pos + 12 + len;
		if (
			end > bytes.length ||
			crc32(bytes.subarray(pos + 4, end - 4)) !==
				bytes.readUInt32BE(end - 4)
		)
			throw new Error("Invalid PNG chunk");
		if (pos === 8 && type !== "IHDR") throw new Error("PNG header missing");
		if (type === "IHDR") {
			if (width || len !== 13)
				throw new Error("Duplicate or invalid PNG header");
			width = bytes.readUInt32BE(pos + 8);
			height = bytes.readUInt32BE(pos + 12);
			channels = { 2: 3, 6: 4 }[bytes[pos + 17]];
			if (
				!width ||
				!height ||
				width * height > 16000000 ||
				bytes[pos + 16] !== 8 ||
				!channels ||
				bytes[pos + 18] !== 0 ||
				bytes[pos + 19] !== 0 ||
				bytes[pos + 20] !== 0
			)
				throw new Error(
					"Use a non-interlaced 8-bit RGB/RGBA screenshot up to 16 megapixels",
				);
		} else if (type === "IDAT") data.push(bytes.subarray(pos + 8, end - 4));
		else if (type === "IEND") {
			if (len !== 0 || end !== bytes.length)
				throw new Error("Invalid PNG ending");
			ended = true;
		}
		pos = end;
	}
	if (!ended || !data.length) throw new Error("Incomplete PNG");
	const expected = (width * channels + 1) * height;
	const pixels = inflateSync(Buffer.concat(data), {
		maxOutputLength: expected,
	});
	if (pixels.length !== expected)
		throw new Error("PNG pixel length mismatch");
	for (let y = 0; y < height; y++)
		if (pixels[y * (width * channels + 1)] > 4)
			throw new Error("Invalid PNG filter");
	return { width, height };
}
export async function assessChannel(
	root,
	content,
	submission,
	matrix,
	channel,
) {
	const config = submission.channels[channel];
	const artifact = matrix.artifacts.find(
		(a) => a.id === config?.artifact && a.channel === channel,
	);
	if (!artifact) throw new Error("Unknown store artifact/channel pairing");
	const blockers = [];
	const add = (message) => blockers.push(message);
	if (config.displayName !== content.product)
		add("Listing name differs from the product");
	if (!["free", "paid"].includes(config.pricing))
		add("Pricing has not been confirmed");
	if (channel === "microsoft-store") {
		if (!config.identity || !config.publisher)
			add("Partner Center identity and publisher are missing");
		if (
			!/^\d+\.\d+\.\d+\.0$/.test(config.packageVersion ?? "") ||
			config.packageVersion
				?.split(".")
				.some(
					(n, i) => Number(n) > 65535 || (i === 0 && Number(n) === 0),
				)
		)
			add("Confirmed four-part Store package version is missing/invalid");
		if (typeof config.ageRating !== "string" || !config.ageRating.trim())
			add("Age rating questionnaire has not been completed");
	} else if (
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.registeredName ?? "") ||
		!/[a-z]/.test(config.registeredName ?? "")
	)
		add("Confirmed Snap registered name is missing/invalid");
	let candidateDigest;
	if (!config.candidate)
		add("No native store candidate and acceptance evidence are attached");
	else
		try {
			const { package: pkg, evidence: ref } = config.candidate;
			const bytes = await packageReference(root, pkg);
			candidateDigest = pkg.sha256;
			if (
				channel === "snap"
					? bytes.subarray(0, 4).toString() !== "hsqs"
					: bytes.subarray(0, 4).toString("hex") !== "504b0304"
			)
				throw new Error("Wrong package container format");
			const evidence = JSON.parse(
				(await readReference(root, ref)).toString(),
			);
			if (evidence.redistributionApproved !== true)
				throw new Error("Redistribution review is not approved");
			validateBuild(evidence.buildInfo, artifact, matrix.version);
			validateEvidence(evidence, candidateDigest, artifact);
			// M4 requires hashed, concrete per-check reports; an arbitrary 'passed' string is insufficient.
			for (const check of Object.values(evidence.checks))
				if (check.status === "passed") {
					const report = JSON.parse(
						(await readReference(root, check.report)).toString(),
					);
					if (
						report.status !== "passed" ||
						report.artifactSha256 !== candidateDigest
					)
						throw new Error(
							"Check report is not bound to this package",
						);
				}
			if (
				channel === "microsoft-store" &&
				(evidence.packageIdentity?.name !== config.identity ||
					evidence.packageIdentity?.publisher !== config.publisher ||
					evidence.packageIdentity?.version !== config.packageVersion)
			)
				throw new Error(
					"MSIX identity/version evidence does not match listing",
				);
			if (
				channel === "snap" &&
				evidence.packageIdentity?.name !== config.registeredName
			)
				throw new Error(
					"Snap registered name does not match package evidence",
				);
		} catch (e) {
			add(`Candidate: ${e.message}`);
		}
	for (const locale of matrix.languages) {
		const shots = (config.screenshots ?? []).filter(
			(s) => s.locale === locale,
		);
		if (!shots.length)
			add(
				`Missing ${locale} screenshot from the native ${artifact.os}/${artifact.arch} candidate`,
			);
		if (shots.length > 10) add(`Too many ${locale} screenshots`);
		for (const shot of shots)
			try {
				if (
					shot.os !== artifact.os ||
					shot.arch !== artifact.arch ||
					!candidateDigest ||
					shot.candidateSha256 !== candidateDigest
				)
					throw new Error(
						"Screenshot platform/architecture/candidate mismatch",
					);
				if (
					typeof shot.caption !== "string" ||
					!shot.caption.trim() ||
					shot.caption.length > 200
				)
					throw new Error("Caption missing or too long");
				const dims = pngDimensions(
					await readReference(root, shot, 50_000_000),
				);
				if (
					channel === "microsoft-store" &&
					(Math.max(dims.width, dims.height) < 1366 ||
						Math.min(dims.width, dims.height) < 768)
				)
					throw new Error(
						"Desktop screenshot below Microsoft minimum dimensions",
					);
				const report = JSON.parse(
					(await readReference(root, shot.captureReport)).toString(),
				);
				if (
					report.status !== "passed" ||
					report.artifactSha256 !== candidateDigest ||
					report.screenshotSha256 !== shot.sha256 ||
					report.locale !== locale ||
					report.os !== artifact.os ||
					report.arch !== artifact.arch
				)
					throw new Error("Screenshot capture evidence mismatch");
			} catch (e) {
				add(`Screenshot ${locale}: ${e.message}`);
			}
	}
	if (submission.publicPages.status !== "verified")
		add(
			"Desktop privacy/support pages have not been deployed and verified",
		);
	else
		try {
			const report = JSON.parse(
				(
					await readReference(root, submission.publicPages.evidence)
				).toString(),
			);
			for (const locale of matrix.languages)
				for (const kind of ["privacy", "support"]) {
					const url = new URL(pagePath(locale, kind), content.website)
						.href;
					if (
						!report.pages?.some(
							(p) =>
								p.url === url &&
								p.status === 200 &&
								p.sha256 ===
									sha256(
										Buffer.from(
											renderPage(content, locale, kind),
										),
									),
						)
					)
						throw new Error(
							"Public page evidence is stale or incomplete",
						);
				}
		} catch (e) {
			add(`Public pages: ${e.message}`);
		}
	return {
		artifact: artifact.id,
		channel,
		status: blockers.length ? "blocked" : "ready-for-human-review",
		blockers,
		publication: "not-requested",
	};
}
