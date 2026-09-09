// Native bundle/source evidence only. No package installation or legal approval.
import { readFile, lstat, readdir, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
const hex = /^[a-f0-9]{64}$/;
export function relativeName(name) {
	if (
		typeof name !== "string" ||
		!name ||
		/[\\:]/.test(name) ||
		[...name].some((c) => c.charCodeAt(0) < 32) ||
		name.split("/").some((p) => !p || p === "." || p === "..")
	)
		throw new Error("Unsafe relative path");
	return name;
}
export async function fileInfo(root, name, max = 2 * 1024 ** 3) {
	relativeName(name);
	let path = await realpath(root);
	for (const part of name.split("/")) {
		path = join(path, part);
		if ((await lstat(path)).isSymbolicLink())
			throw new Error(`Symlink rejected: ${name}`);
	}
	const before = await lstat(path);
	if (!before.isFile() || before.size > max)
		throw new Error(`Invalid file: ${name}`);
	const hash = createHash("sha256");
	let bytes = 0;
	for await (const chunk of createReadStream(path)) {
		bytes += chunk.length;
		if (bytes > max) throw new Error(`File grew beyond limit: ${name}`);
		hash.update(chunk);
	}
	const after = await lstat(path);
	if (
		before.ino !== after.ino ||
		before.dev !== after.dev ||
		before.mtimeMs !== after.mtimeMs ||
		before.size !== bytes ||
		after.size !== bytes
	)
		throw new Error(`File changed: ${name}`);
	return { sha256: hash.digest("hex"), bytes };
}
export function parseControl(text) {
	text = text.replace(/\r\n/g, "\n");
	// A .dsc may be OpenPGP clearsigned. Parsing is NOT signature verification.
	if (text.startsWith("-----BEGIN PGP SIGNED MESSAGE-----")) {
		const start = text.indexOf("\n\n");
		const end = text.indexOf("\n-----BEGIN PGP SIGNATURE-----");
		if (start < 0 || end < start)
			throw new Error("Malformed signed control");
		text = text.slice(start + 2, end).replace(/^- /gm, "");
	}
	const fields = Object.create(null);
	let field;
	for (const line of text.replace(/\r\n/g, "\n").trimEnd().split("\n")) {
		if (/^[ \t]/.test(line)) {
			if (!field) throw new Error("Control continuation without field");
			fields[field] += "\n" + line.slice(1);
		} else {
			const match = line.match(/^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/);
			if (!match || Object.hasOwn(fields, match[1].toLowerCase()))
				throw new Error("Invalid or duplicate control field");
			field = match[1].toLowerCase();
			fields[field] = match[2];
		}
	}
	return fields;
}
function packageName(name) {
	if (typeof name !== "string" || !/^[a-z0-9][a-z0-9+.-]+$/.test(name))
		throw new Error("Invalid Debian package name");
	return name;
}
function version(value) {
	if (
		typeof value !== "string" ||
		!/^(?:[0-9]+:)?[0-9][A-Za-z0-9.+:~-]*$/.test(value)
	)
		throw new Error("Invalid Debian version");
	return value;
}
export function sourceIdentity(fields) {
	const name = packageName(fields.package);
	const binaryVersion = version(fields.version);
	const source = fields.source?.match(
		/^([a-z0-9][a-z0-9+.-]+)(?: \(([^)]+)\))?$/,
	);
	if (fields.source && !source) throw new Error("Invalid Source field");
	return {
		package: name,
		version: binaryVersion,
		source: source ? packageName(source[1]) : name,
		sourceVersion: source?.[2] ? version(source[2]) : binaryVersion,
	};
}
export function sourceSelector(source, sourceVersion) {
	return packageName(source) + "=" + version(sourceVersion);
}
export function builtUsing(fields) {
	return ["built-using", "static-built-using"].flatMap((key) =>
		!fields[key]
			? []
			: fields[key]
					.replace(/\n/g, " ")
					.split(",")
					.map((item) => {
						const match = item
							.trim()
							.match(
								/^([a-z0-9][a-z0-9+.-]+)\s*\(=\s*([^\s)]+)\)$/,
							);
						if (!match) throw new Error(`Invalid ${key}`);
						return {
							source: packageName(match[1]),
							sourceVersion: version(match[2]),
							reason: key,
						};
					}),
	);
}
export async function verifyDsc(root, name) {
	const descriptor = await fileInfo(root, name, 2 * 1024 ** 2);
	const fields = parseControl(await readFile(join(root, name), "utf8"));
	const source = packageName(fields.source),
		sourceVersion = version(fields.version);
	if (!["1.0", "3.0 (quilt)", "3.0 (native)"].includes(fields.format))
		throw new Error("Unsupported source format");
	const rows = fields["checksums-sha256"]?.trim().split("\n");
	if (!rows?.length) throw new Error("Missing source SHA-256 inventory");
	const prefix = name.includes("/")
		? name.slice(0, name.lastIndexOf("/") + 1)
		: "";
	const files = [],
		seen = new Set();
	for (const row of rows) {
		const match = row.trim().match(/^([a-f0-9]{64})\s+([0-9]+)\s+(\S+)$/);
		if (!match || match[3].includes("/") || seen.has(match[3]))
			throw new Error("Invalid source checksum row");
		const file = relativeName(prefix + match[3]);
		// Source distributions (e.g. TeX Live) can legitimately exceed binary-package limits.
		const info = await fileInfo(root, file, 4 * 1024 ** 3);
		if (info.sha256 !== match[1] || info.bytes !== Number(match[2]))
			throw new Error(`Source archive mismatch: ${file}`);
		seen.add(match[3]);
		files.push({ file, ...info });
	}
	if (!files.some((f) => /\.tar\.(gz|xz|bz2|lzma|zst)$/.test(f.file)))
		throw new Error("Missing source tar archive");
	if (
		fields.format === "3.0 (quilt)" &&
		!files.some((f) => /\.debian\.tar\.(gz|xz|bz2|lzma|zst)$/.test(f.file))
	)
		throw new Error("Missing Debian patches/build instructions archive");
	return {
		source,
		sourceVersion,
		format: fields.format,
		descriptor: { file: name, ...descriptor },
		files,
		signatureVerification: "not-performed",
		buildReproduction: "not-performed",
	};
}
export async function listFiles(root, prefix = "") {
	const result = [];
	for (const entry of await readdir(join(root, prefix), {
		withFileTypes: true,
	})) {
		const name = relativeName(prefix + entry.name);
		if (entry.isDirectory())
			result.push(...(await listFiles(root, name + "/")));
		else if (entry.isFile()) result.push(name);
		else throw new Error(`Non-regular inventory entry: ${name}`);
		if (result.length > 10000)
			throw new Error("Too many inventory entries");
	}
	return result.sort();
}
export async function inspectBundle(root, expectedOs = "linux") {
	if (!["linux", "windows"].includes(expectedOs))
		throw new Error("Unsupported bundle platform");
	if ((await lstat(root)).isSymbolicLink())
		throw new Error("Bundle root cannot be a symlink");
	const manifestInfo = await fileInfo(root, "engines.json", 2 * 1024 ** 2);
	const manifest = JSON.parse(
		await readFile(join(root, "engines.json"), "utf8"),
	);
	if (
		manifest.schema !== 2 ||
		manifest.kind !== "bundled" ||
		manifest.os !== expectedOs
	)
		throw new Error(`Expected schema 2 ${expectedOs} bundle`);
	const listed = Object.keys(manifest.files);
	if (!listed.length || listed.length > 10000)
		throw new Error("Invalid bundle inventory");
	const actual = await listFiles(root);
	if (
		JSON.stringify(actual) !==
		JSON.stringify([...listed, "engines.json"].sort())
	)
		throw new Error("Missing or unlisted bundle resource");
	let total = 0;
	for (const [name, expected] of Object.entries(manifest.files)) {
		if (
			!hex.test(expected.sha256) ||
			!Number.isSafeInteger(expected.bytes) ||
			expected.bytes < 0
		)
			throw new Error("Invalid resource fingerprint");
		total += expected.bytes;
		if (total > 8 * 1024 ** 3) throw new Error("Bundle too large");
		const info = await fileInfo(root, name);
		if (info.sha256 !== expected.sha256 || info.bytes !== expected.bytes)
			throw new Error(`Bundle integrity mismatch: ${name}`);
	}
	for (const id of ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]) {
		const entry = manifest.engines[id];
		if (!entry || entry.sha256 !== manifest.files[entry.path]?.sha256)
			throw new Error(`Invalid engine: ${id}`);
	}
	await fileInfo(root, "provenance.json", 8 * 1024 ** 2);
	const provenance = JSON.parse(
		await readFile(join(root, "provenance.json"), "utf8"),
	);
	if (provenance.schema !== 1) throw new Error("Unsupported provenance");
	return { manifest, manifestInfo, provenance };
}
export async function auditSources(
	bundle,
	catalog = { schema: 1, debs: [] },
	sourceArchives = [],
) {
	const { manifest, manifestInfo, provenance } = bundle;
	if (catalog.schema !== 1 || !Array.isArray(catalog.debs))
		throw new Error("Invalid Debian catalog");
	const groups = new Map(),
		packages = new Map(),
		resources = [],
		unresolved = [],
		warnings = [];
	const addSource = (source, sourceVersion, reason) => {
		packageName(source);
		version(sourceVersion);
		const key = source + "=" + sourceVersion;
		if (!groups.has(key))
			groups.set(key, {
				source,
				version: sourceVersion,
				reasons: [],
				packages: [],
				resources: [],
			});
		const group = groups.get(key);
		if (!group.reasons.includes(reason)) group.reasons.push(reason);
		return group;
	};
	for (const [owner, row] of Object.entries(provenance.packages)) {
		const [binary, binaryVersion, source, sourceVersion, ...extra] =
			row.split("\t");
		if (extra.length || binary !== owner)
			throw new Error("Invalid recorded package metadata");
		packageName(binary.split(":")[0]);
		version(binaryVersion);
		const group = addSource(
			source,
			sourceVersion,
			"recorded-system-package",
		);
		const info = {
			package: binary,
			version: binaryVersion,
			source,
			sourceVersion,
			origin: "system-provenance",
		};
		packages.set(owner, info);
		group.packages.push(info);
	}
	const addNotice = (group, name) => {
		if (!manifest.files[name]) {
			unresolved.push({
				resource: name,
				reason: "Missing package copyright notice",
			});
			return;
		}
		group.notices ??= [];
		if (!group.notices.some((n) => n.file === name))
			group.notices.push({ file: name, ...manifest.files[name] });
	};
	for (const [owner, info] of packages)
		addNotice(
			groups.get(info.source + "=" + info.sourceVersion),
			`licenses/${owner.replace(":", "_")}.copyright`,
		);
	const installed = new Map();
	for (const text of catalog.system ?? []) {
		const fields = parseControl(text);
		const info = sourceIdentity(fields);
		const key = info.package + ":" + fields.architecture;
		if (installed.has(key))
			throw new Error("Duplicate installed package metadata");
		installed.set(key, fields);
	}
	let unverifiedSystemMetadata = 0;
	for (const [owner, info] of packages) {
		const fields =
			installed.get(owner) ??
			installed.get(owner + ":all") ??
			installed.get(
				owner +
					":" +
					{ aarch64: "arm64", x86_64: "amd64" }[manifest.arch],
			);
		if (
			!fields ||
			fields.version !== info.version ||
			sourceIdentity(fields).source !== info.source ||
			sourceIdentity(fields).sourceVersion !== info.sourceVersion
		) {
			unverifiedSystemMetadata++;
			warnings.push({
				package: owner,
				reason: "Matching system control metadata unavailable; extra static sources not certified",
			});
			continue;
		}
		for (const dependency of builtUsing(fields))
			addSource(
				dependency.source,
				dependency.sourceVersion,
				dependency.reason,
			);
	}
	const matches = new Map();
	for (const deb of catalog.debs) {
		relativeName(deb.file);
		if (!hex.test(deb.sha256))
			throw new Error("Invalid Debian archive fingerprint");
		const fields = parseControl(deb.control),
			info = sourceIdentity(fields);
		const group = addSource(
			info.source,
			info.sourceVersion,
			"local-deb-archive",
		);
		const owned = {
			...info,
			origin: "deb-content-match",
			archive: { file: deb.file, sha256: deb.sha256 },
		};
		group.packages.push(owned);
		addNotice(group, `licenses/extracted-${info.package}.copyright`);
		for (const dependency of builtUsing(fields))
			addSource(
				dependency.source,
				dependency.sourceVersion,
				dependency.reason,
			);
		for (const [name, file] of Object.entries(deb.resources)) {
			if (matches.has(name))
				throw new Error(`Ambiguous package ownership: ${name}`);
			matches.set(name, { file, info: owned, group });
		}
	}
	for (const [name, file] of Object.entries(manifest.files)) {
		if (
			name === "provenance.json" ||
			name.startsWith("licenses/") ||
			name.startsWith("validation/")
		)
			continue;
		const origin = provenance.resources[name];
		if (!origin) {
			unresolved.push({ resource: name, reason: "No origin record" });
			continue;
		}
		if (
			!origin.transformation &&
			(origin.sha256 !== file.sha256 || origin.bytes !== file.bytes)
		)
			throw new Error(`Origin fingerprint mismatch: ${name}`);
		let owner = packages.get(origin.package),
			group;
		if (owner) group = groups.get(owner.source + "=" + owner.sourceVersion);
		else if (origin.package === "extracted-deb-see-provenance") {
			const match = matches.get(name);
			if (
				match &&
				match.file.sha256 === origin.sha256 &&
				match.file.bytes === origin.bytes
			) {
				owner = match.info;
				group = match.group;
			}
		}
		if (!owner) {
			unresolved.push({
				resource: name,
				reason: "Exact binary package content not matched",
			});
			continue;
		}
		if (
			origin.transformation &&
			(origin.transformation !==
				"Clear absolute build-time libdir; load adjacent module" ||
				!/^modules\/[a-z0-9_-]+\.la$/.test(name))
		)
			throw new Error(`Unsupported resource transformation: ${name}`);
		if (origin.transformation)
			warnings.push({
				resource: name,
				reason: "Recorded transformation requires review",
				transformation: origin.transformation,
				originalSha256: origin.sha256,
				packagedSha256: file.sha256,
			});
		group.resources.push(name);
		resources.push({
			file: name,
			...file,
			package: owner.package,
			version: owner.version,
			source: owner.source,
			sourceVersion: owner.sourceVersion,
		});
	}
	const archives = new Map();
	for (const archive of sourceArchives) {
		const key = archive.source + "=" + archive.sourceVersion;
		if (archives.has(key)) throw new Error("Duplicate source descriptor");
		archives.set(key, archive);
	}
	const sources = [...groups.values()].sort((a, b) =>
		(a.source + "=" + a.version).localeCompare(b.source + "=" + b.version),
	);
	for (const source of sources)
		source.delivery = archives.get(
			source.source + "=" + source.version,
		) ?? { status: "missing" };
	const missing = sources.filter(
		(s) => s.delivery.status === "missing",
	).length;
	return {
		schema: 1,
		scope: "Linux engine bundle source materials; excludes application/frontend/Rust static dependency source closure",
		engineManifestSha256: manifestInfo.sha256,
		os: manifest.os,
		arch: manifest.arch,
		sourceDistribution:
			/^ID=debian$/m.test(provenance.host ?? "") &&
			/^VERSION_ID="13"$/m.test(provenance.host ?? "")
				? "debian-13"
				: "unverified",
		redistributionApproved: false,
		status:
			unresolved.length || missing || unverifiedSystemMetadata
				? "incomplete"
				: "ready-for-source-review",
		counts: {
			inventoryFiles: Object.keys(manifest.files).length,
			unverifiedSystemMetadata,
			mappedRuntimeFiles: resources.length,
			unresolvedRuntimeFiles: unresolved.filter(
				(r) => !r.resource.startsWith("licenses/"),
			).length,
			missingLicenseNotices: unresolved.filter((r) =>
				r.resource.startsWith("licenses/"),
			).length,
			sourceVersions: sources.length,
			missingSourceVersions: missing,
		},
		resources,
		sources,
		unresolved,
		warnings,
		remainingReviews: [
			"Authenticity of system package bytes and archive/source signatures",
			"Static dependencies not fully represented in package metadata (including Pandoc Haskell libraries)",
			"Application, Rust crates, frontend and build-tool source closure",
			"Actual compiler/configure options, patches, license compatibility and reproducible build verification",
			"Target installer, permissions, upgrade/uninstall and store acceptance",
		],
	};
}
