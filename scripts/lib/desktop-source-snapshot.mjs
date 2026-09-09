// Historical Debian sources; HTTPS provenance and checksums are not signature approval.
import { open, lstat, link, unlink, readFile } from "node:fs/promises";
import { constants, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
	relativeName,
	sourceSelector,
	parseControl,
	verifyDsc,
} from "./desktop-sources.mjs";
const origin = "https://snapshot.debian.org";
const maxArchive = 4 * 1024 ** 3;
const singleName = (name) => {
	relativeName(name);
	if (name.includes("/")) throw new Error("Expected a single filename");
	return name;
};
export function snapshotPlan(data, source, version) {
	sourceSelector(source, version);
	if (
		data.package !== source ||
		data.version !== version ||
		!Array.isArray(data.result) ||
		!data.result.length ||
		data.result.length > 100
	)
		throw new Error(
			"Snapshot source/version mismatch or invalid file count",
		);
	const names = new Set(),
		hashes = new Set();
	const files = data.result.map(({ hash }) => {
		if (!/^[a-f0-9]{40}$/.test(hash) || hashes.has(hash))
			throw new Error("Invalid snapshot file identity");
		hashes.add(hash);
		const rows = data.fileinfo?.[hash]?.filter((r) =>
			["debian", "debian-security"].includes(r.archive_name),
		);
		if (!rows?.length)
			throw new Error("Missing official archive file metadata");
		const first = rows[0];
		if (
			rows.some((r) => r.size !== first.size) ||
			!Number.isSafeInteger(first.size) ||
			first.size <= 0 ||
			first.size > maxArchive
		)
			throw new Error("Ambiguous or oversized source file");
		const aliases = [...new Set(rows.map((r) => singleName(r.name)))].map(
			(name) => {
				if (
					names.has(name) ||
					(name.endsWith(".dsc") && first.size > 2 * 1024 ** 2)
				)
					throw new Error("Ambiguous or oversized source file");
				names.add(name);
				// The same hash may have several historical names (e.g. tex4ht).
				// Keep each mapping; the descriptor selects the exact archive name later.
				const mirrors = rows
					.filter((r) => r.name === name)
					.map((r) => {
						if (!r.path.startsWith("/pool/"))
							throw new Error("Invalid archive pool path");
						relativeName(r.path.slice(1));
						return (
							"https://deb.debian.org/" +
							r.archive_name +
							r.path
								.split("/")
								.map(encodeURIComponent)
								.join("/") +
							"/" +
							encodeURIComponent(name)
						);
					});
				return {
					name,
					urls: [...new Set([...mirrors, `${origin}/file/${hash}`])],
				};
			},
		);
		if (
			aliases.some(
				(a) =>
					a.name.endsWith(".dsc") !==
					aliases[0].name.endsWith(".dsc"),
			)
		)
			throw new Error("Mixed descriptor/archive aliases");
		return { ...aliases[0], bytes: first.size, sha1: hash, aliases };
	});
	if (files.filter((f) => f.name.endsWith(".dsc")).length !== 1)
		throw new Error("Expected one source descriptor");
	return files;
}
async function statFile(path) {
	try {
		const info = await lstat(path);
		if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
			throw new Error("Non-regular download path");
		return info;
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
}
async function matches(path, spec, signal) {
	const info = await statFile(path);
	if (!info || info.size !== spec.bytes) return false;
	const sha1 = createHash("sha1"),
		sha256 = createHash("sha256");
	let bytes = 0;
	for await (const chunk of createReadStream(path)) {
		signal?.throwIfAborted();
		bytes += chunk.length;
		if (bytes > spec.bytes) return false;
		sha1.update(chunk);
		sha256.update(chunk);
	}
	return (
		bytes === spec.bytes &&
		sha1.digest("hex") === spec.sha1 &&
		(!spec.sha256 || sha256.digest("hex") === spec.sha256)
	);
}
// The caller owns a locked workspace. .part is retained on interruption; an existing
// final file is never overwritten. All bytes, including resumed bytes, are hashed.
export async function downloadFile(
	root,
	spec,
	{ signal, request = fetch } = {},
) {
	singleName(spec.name);
	if (
		!Number.isSafeInteger(spec.bytes) ||
		spec.bytes < 1 ||
		spec.bytes > maxArchive ||
		!/^[a-f0-9]{40}$/.test(spec.sha1) ||
		(spec.sha256 && !/^[a-f0-9]{64}$/.test(spec.sha256))
	)
		throw new Error("Invalid download fingerprint");
	const target = join(root, spec.name),
		partial = target + ".part";
	if (await statFile(target)) {
		if (!(await matches(target, spec, signal)))
			throw new Error("Existing source file failed integrity check");
		if (await statFile(partial)) await unlink(partial);
		return "reused";
	}
	let lastError;
	for (const url of spec.urls) {
		// No cross-origin redirects or arbitrary network targets; tests inject responses.
		const parsed = new URL(url);
		if (
			parsed.protocol !== "https:" ||
			!["snapshot.debian.org", "deb.debian.org"].includes(
				parsed.hostname,
			) ||
			parsed.port ||
			parsed.username ||
			parsed.password
		)
			throw new Error("Untrusted download URL");
		signal?.throwIfAborted();
		try {
			const previous = await statFile(partial);
			if (
				previous?.size === spec.bytes &&
				(await matches(partial, spec, signal))
			) {
				await link(partial, target);
				await unlink(partial);
				return "resumed";
			}
			const file = await open(
				partial,
				constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
				0o600,
			);
			let response;
			try {
				let offset = previous?.size ?? 0;
				if (offset >= spec.bytes) {
					await file.truncate(0);
					offset = 0;
				}
				response = await request(url, {
					redirect: "error",
					signal,
					headers: {
						"Accept-Encoding": "identity",
						...(offset ? { Range: `bytes=${offset}-` } : {}),
					},
				});
				if (response.status !== 200 && response.status !== 206)
					throw new Error(`HTTP ${response.status}`);
				if (
					response.headers.get("content-encoding") &&
					response.headers.get("content-encoding") !== "identity"
				)
					throw new Error("Encoded download rejected");
				if (response.status === 206) {
					if (
						response.headers.get("content-range") !==
						`bytes ${offset}-${spec.bytes - 1}/${spec.bytes}`
					)
						throw new Error("Invalid Content-Range");
				} else {
					await file.truncate(0);
					offset = 0;
				}
				const length = response.headers.get("content-length");
				if (length !== null && Number(length) !== spec.bytes - offset)
					throw new Error("Invalid Content-Length");
				for await (const chunk of response.body) {
					signal?.throwIfAborted();
					if (offset + chunk.length > spec.bytes)
						throw new Error("Download exceeded declared size");
					let written = 0;
					while (written < chunk.length) {
						const r = await file.write(
							chunk,
							written,
							chunk.length - written,
							offset + written,
						);
						if (!r.bytesWritten)
							throw new Error("Write made no progress");
						written += r.bytesWritten;
					}
					offset += written;
				}
				if (offset !== spec.bytes)
					throw new Error("Truncated source download");
				await file.sync();
			} finally {
				if (response?.body && !response.body.locked)
					await response.body.cancel().catch(() => {});
				await file.close();
			}
			if (!(await matches(partial, spec, signal))) {
				await unlink(partial); // A complete but corrupt prefix must not be resumed.
				throw new Error("Source download checksum mismatch");
			}
			signal?.throwIfAborted();
			await link(partial, target);
			await unlink(partial);
			return "downloaded";
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError ?? new Error("No source URLs");
}
export async function snapshotMetadata(
	source,
	version,
	signal,
	request = fetch,
) {
	sourceSelector(source, version);
	const url = `${origin}/mr/package/${encodeURIComponent(source)}/${encodeURIComponent(version)}/srcfiles?fileinfo=1`;
	let lastError;
	for (let attempt = 0; attempt < 2; attempt++) {
		let response;
		try {
			response = await request(url, {
				redirect: "error",
				signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
			});
			if (!response.ok)
				throw new Error(`Snapshot metadata HTTP ${response.status}`);
			const chunks = [];
			let bytes = 0;
			for await (const chunk of response.body) {
				bytes += chunk.length;
				if (bytes > 2 * 1024 ** 2)
					throw new Error("Snapshot metadata too large");
				chunks.push(chunk);
			}
			const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			return { url, files: snapshotPlan(data, source, version), data };
		} catch (error) {
			lastError = error;
			if (response?.status === 404) break;
		} finally {
			if (response?.body && !response.body.locked)
				await response.body.cancel().catch(() => {});
		}
	}
	throw lastError;
}
export async function acquireSnapshot(
	root,
	source,
	version,
	metadata,
	signal,
	request = fetch,
) {
	const descriptor = metadata.files.find((f) => f.name.endsWith(".dsc"));
	await downloadFile(root, descriptor, { signal, request });
	const fields = parseControl(
		await readFile(join(root, descriptor.name), "utf8"),
	);
	if (fields.source !== source || fields.version !== version)
		throw new Error("Descriptor source/version mismatch");
	const rows = fields["checksums-sha256"]?.trim().split("\n");
	if (!rows?.length || rows.length !== metadata.files.length - 1)
		throw new Error("Descriptor/snapshot file inventory mismatch");
	const seen = new Set();
	for (const row of rows) {
		const match = row.trim().match(/^([a-f0-9]{64})\s+([0-9]+)\s+(\S+)$/);
		if (!match) throw new Error("Invalid descriptor checksum");
		const name = singleName(match[3]),
			base = metadata.files.find((f) =>
				f.aliases.some((a) => a.name === name),
			),
			spec = base && {
				...base,
				...base.aliases.find((a) => a.name === name),
			};
		if (
			!spec ||
			base === descriptor ||
			seen.has(name) ||
			spec.bytes !== Number(match[2])
		)
			throw new Error("Descriptor/snapshot archive mismatch");
		seen.add(name);
		await downloadFile(
			root,
			{ ...spec, sha256: match[1] },
			{ signal, request },
		);
	}
	const verified = await verifyDsc(root, descriptor.name);
	signal?.throwIfAborted();
	return verified;
}
