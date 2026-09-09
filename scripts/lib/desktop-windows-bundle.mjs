import {
	readFile,
	writeFile,
	mkdir,
	copyFile,
	mkdtemp,
	rm,
} from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileInfo, relativeName, inspectBundle } from "./desktop-sources.mjs";
import { inspectWindowsTree } from "./desktop-windows.mjs";
import { sha256 } from "./desktop-artifacts.mjs";

export function windowsResource(name) {
	relativeName(name);
	if (
		name
			.split("/")
			.some(
				(part) =>
					/[<>"|?*]|[ .]$/.test(part) ||
					/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(
						part,
					),
			)
	)
		throw new Error("Invalid Windows resource name");
	return name;
}
export function validateWindowsLock(lock) {
	if (
		lock?.schema !== 1 ||
		lock.os !== "windows" ||
		lock.arch !== "x86_64" ||
		lock.redistributionApproved !== false
	)
		throw new Error("Expected Windows x64 development source lock");
	if (!Array.isArray(lock.sources) || lock.sources.length !== 5)
		throw new Error("Expected five source packages");
	const ids = new Set(),
		targets = new Set();
	const fingerprint = (entry) => {
		if (
			!/^[a-f0-9]{64}$/.test(entry?.sha256) ||
			!Number.isSafeInteger(entry.bytes) ||
			entry.bytes <= 0 ||
			entry.bytes > 1024 ** 3
		)
			throw new Error("Invalid pinned fingerprint");
	};
	for (const source of lock.sources) {
		if (
			!["magick", "ffmpeg", "pandoc", "mutool", "vcredist"].includes(
				source.id,
			) ||
			ids.has(source.id) ||
			typeof source.version !== "string" ||
			!source.version.trim()
		)
			throw new Error("Invalid source identity");
		ids.add(source.id);
		fingerprint(source.archive);
		if (windowsResource(source.archive.file).includes("/"))
			throw new Error("Expected archive basename");
		if (!source.archive.url?.startsWith("https://"))
			throw new Error("Expected HTTPS source URL");
		if (!["7z", "cabextract"].includes(source.extractor))
			throw new Error("Unsupported archive extractor");
		if (source.nestedCab) windowsResource(source.nestedCab);
		if (
			!Array.isArray(source.files) ||
			!source.files.length ||
			source.files.length > 1000
		)
			throw new Error("Invalid resource list");
		for (const file of source.files) {
			windowsResource(file.from);
			windowsResource(file.to);
			fingerprint(file);
			if (
				!/^(?:bin|licenses|magick-config)\//.test(file.to) ||
				targets.has(file.to.toLowerCase())
			)
				throw new Error("Invalid or duplicate resource destination");
			targets.add(file.to.toLowerCase());
		}
	}
	for (const id of ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"])
		if (!targets.has(`bin/${id}.exe`))
			throw new Error(`Missing engine: ${id}`);
	if (!targets.has("magick-config/colors.xml"))
		throw new Error("Missing ImageMagick configuration");
}

export async function assembleWindowsBundle({
	lock,
	archives,
	output,
	verifier,
	extracted,
	notices,
}) {
	validateWindowsLock(lock);
	await mkdir(output); // Never overwrite previous bundles.
	const temporary = await mkdtemp(join(tmpdir(), "z8-windows-extract-"));
	const manifest = {
		schema: 2,
		kind: "bundled",
		os: "windows",
		arch: "x86_64",
		engines: {},
		files: {},
		loader: null,
		magick_modules: null,
		magick_config: "magick-config",
		heif_plugins: null,
	};
	const run = (bin, args) =>
		execFileSync(bin, args, {
			timeout: 120000,
			maxBuffer: 2 * 1024 ** 2,
			stdio: "pipe",
		});
	try {
		for (const source of lock.sources) {
			const original = await fileInfo(
				archives,
				source.archive.file,
				source.archive.bytes,
			);
			if (
				original.sha256 !== source.archive.sha256 ||
				original.bytes !== source.archive.bytes
			)
				throw new Error(`Archive hash mismatch: ${source.id}`);
			// Extract a private, verified archive copy, never a mutable caller path.
			const archive = join(temporary, source.archive.file);
			await copyFile(join(archives, source.archive.file), archive);
			const archiveInfo = await fileInfo(
				temporary,
				source.archive.file,
				1024 ** 3,
			);
			if (
				archiveInfo.sha256 !== source.archive.sha256 ||
				archiveInfo.bytes !== source.archive.bytes
			)
				throw new Error(`Archive hash mismatch: ${source.id}`);
			const tree = extracted
				? join(extracted, source.id)
				: join(temporary, source.id);
			if (!extracted) {
				await mkdir(tree);
				if (source.extractor === "7z")
					run("7z", ["x", "-y", `-o${tree}`, archive]);
				else {
					run("cabextract", ["-q", "-d", tree, archive]);
					if (source.nestedCab)
						run("cabextract", [
							"-q",
							"-d",
							join(tree, "runtime"),
							join(tree, source.nestedCab),
						]);
				}
			}
			for (const file of source.files) {
				const target = join(output, file.to);
				// Validate source path components before copying and copied bytes after.
				const input = await fileInfo(tree, file.from);
				if (input.sha256 !== file.sha256 || input.bytes !== file.bytes)
					throw new Error(
						`Extracted resource mismatch: ${file.from}`,
					);
				await mkdir(dirname(target), { recursive: true });
				await copyFile(join(tree, file.from), target);
				const copied = await fileInfo(output, file.to);
				if (
					copied.sha256 !== file.sha256 ||
					copied.bytes !== file.bytes
				)
					throw new Error(`Copied resource mismatch: ${file.to}`);
				manifest.files[file.to] = copied;
			}
		}
		await mkdir(join(output, "validation"));
		await copyFile(verifier, join(output, "validation/bundle-check.exe"));
		manifest.files["validation/bundle-check.exe"] = await fileInfo(
			output,
			"validation/bundle-check.exe",
		);
		if (notices) {
			await fileInfo(notices, "dossier.json", 8 * 1024 ** 2);
			const dossier = JSON.parse(
				await readFile(join(notices, "dossier.json"), "utf8"),
			);
			if (
				dossier.schema !== 1 ||
				dossier.target !== "x86_64-pc-windows-msvc" ||
				dossier.redistributionApproved !== false ||
				!Array.isArray(dossier.components)
			)
				throw new Error("Wrong application notice dossier");
			for (const component of dossier.components)
				for (const notice of component.notices) {
					const source = await fileInfo(
						notices,
						notice.file,
						2 * 1024 ** 2,
					);
					if (
						source.sha256 !== notice.sha256 ||
						source.bytes !== notice.bytes ||
						!notice.file.startsWith("licenses/")
					)
						throw new Error("Notice dossier fingerprint mismatch");
					const name =
						"licenses/application/" +
						notice.file.slice("licenses/".length);
					windowsResource(name);
					if (manifest.files[name])
						throw new Error("Duplicate application notice");
					await mkdir(dirname(join(output, name)), {
						recursive: true,
					});
					await copyFile(
						join(notices, notice.file),
						join(output, name),
					);
					manifest.files[name] = await fileInfo(output, name);
					if (manifest.files[name].sha256 !== source.sha256)
						throw new Error("Copied notice changed");
				}
		}
		for (const id of ["magick", "ffmpeg", "ffprobe", "pandoc", "mutool"]) {
			const source = lock.sources.find(
				(s) => s.id === (id === "ffprobe" ? "ffmpeg" : id),
			);
			const path = `bin/${id}.exe`;
			manifest.engines[id] = {
				path,
				sha256: manifest.files[path].sha256,
				version: source.version,
			};
		}
		const pe = await inspectWindowsTree(output);
		if (pe.missing.length)
			throw new Error(
				`Unresolved private DLLs: ${pe.missing.map((d) => d.name).join(", ")}`,
			);
		const provenance = {
			schema: 1,
			kind: "windows-pinned-archives",
			sourceLockSha256: sha256(Buffer.from(JSON.stringify(lock))),
			sources: lock.sources,
			redistributionApproved: false,
			execution: "not-run",
			licenseReview: "pending",
			sourceClosure: "pending",
			pe,
		};
		await writeFile(
			join(output, "provenance.json"),
			JSON.stringify(provenance, null, 2) + "\n",
		);
		manifest.files["provenance.json"] = await fileInfo(
			output,
			"provenance.json",
		);
		await writeFile(
			join(output, "engines.json"),
			JSON.stringify(manifest, null, 2) + "\n",
		);
		return await inspectBundle(resolve(output), "windows");
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

export async function readWindowsLock() {
	return JSON.parse(
		await readFile(
			new URL(
				"../../packaging/desktop/windows/engines.lock.json",
				import.meta.url,
			),
			"utf8",
		),
	);
}
