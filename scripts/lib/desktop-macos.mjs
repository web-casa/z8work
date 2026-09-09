// Deliberately accepts thin ARM64 only. No host Homebrew or DYLD fallback.
import { readFile } from "node:fs/promises";
import { posix, join } from "node:path";
import { inspectBundle, listFiles, relativeName } from "./desktop-sources.mjs";

export function inspectMachO(bytes) {
	if (
		bytes.length < 32 ||
		bytes.readUInt32LE(0) !== 0xfeedfacf ||
		bytes.readUInt32LE(4) !== 0x0100000c ||
		![2, 6, 8].includes(bytes.readUInt32LE(12))
	)
		throw new Error("Expected thin ARM64 Mach-O executable/library");
	const count = bytes.readUInt32LE(16),
		size = bytes.readUInt32LE(20);
	if (count > 4096 || size > bytes.length - 32)
		throw new Error("Invalid Mach-O command table");
	let offset = 32;
	const dependencies = [],
		rpaths = [];
	for (let i = 0; i < count; i++) {
		if (offset + 8 > 32 + size) throw new Error("Truncated Mach-O command");
		const command = bytes.readUInt32LE(offset),
			length = bytes.readUInt32LE(offset + 4);
		if (length < 8 || length % 8 || offset + length > 32 + size)
			throw new Error("Invalid Mach-O command size");
		if (command === 0x27)
			throw new Error("Embedded DYLD environment is not allowed");
		const dylib = [0xc, 0x80000018, 0x8000001f, 0x80000023, 0x20].includes(
			command,
		);
		if (dylib || command === 0x8000001c) {
			const minimum = dylib ? 24 : 12;
			if (length < minimum)
				throw new Error("Truncated Mach-O string command");
			const start = bytes.readUInt32LE(offset + 8);
			const end = bytes.indexOf(0, offset + start);
			if (
				start < minimum ||
				start >= length ||
				end < 0 ||
				end >= offset + length
			)
				throw new Error("Invalid Mach-O dependency string");
			const value = new TextDecoder("utf-8", { fatal: true }).decode(
				bytes.subarray(offset + start, end),
			);
			if (
				!value ||
				[...value].some(
					(c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
				)
			)
				throw new Error("Invalid Mach-O dependency name");
			(dylib ? dependencies : rpaths).push(value);
		}
		offset += length;
	}
	if (offset !== 32 + size) throw new Error("Mach-O command count mismatch");
	return { fileType: bytes.readUInt32LE(12), dependencies, rpaths };
}

export function resolveDependency(name, owner, executable) {
	if (
		/^(?:\/usr\/lib\/|\/System\/Library\/)/.test(name) &&
		posix.normalize(name) === name
	)
		return { system: name };
	let root;
	if (name.startsWith("@loader_path/")) root = posix.dirname(owner);
	else if (name.startsWith("@executable_path/") && executable)
		root = posix.dirname(executable);
	else throw new Error(`Unrelocated dependency: ${name}`);
	const local = posix.normalize(
		posix.join(root, name.slice(name.indexOf("/") + 1)),
	);
	relativeName(local);
	return { local };
}

export async function inspectMacBundle(root) {
	const bundle = await inspectBundle(root, "macos");
	if (bundle.manifest.arch !== "aarch64" || bundle.manifest.loader != null)
		throw new Error("Expected macOS ARM64 bundle without ELF loader");
	const objects = new Map();
	for (const name of await listFiles(root)) {
		const bytes = await readFile(join(root, name));
		const magic = bytes.subarray(0, 4).toString("hex");
		if (
			[
				"cffaedfe",
				"cefaedfe",
				"feedface",
				"feedfacf",
				"cafebabe",
				"bebafeca",
				"cafebabf",
				"bfbafeca",
			].includes(magic)
		)
			objects.set(name, inspectMachO(bytes));
		else if (
			/\.(?:dylib|so)$/.test(name) ||
			name.startsWith("bin/") ||
			name.startsWith("validation/")
		)
			throw new Error(`Non-Mach-O code resource: ${name}`);
	}
	for (const entry of Object.values(bundle.manifest.engines))
		if (objects.get(entry.path)?.fileType !== 2)
			throw new Error("Engine must be an ARM64 executable");
	if (objects.get("validation/bundle-check")?.fileType !== 2)
		throw new Error("Missing ARM64 verifier");
	const dependencies = [];
	for (const [name, object] of objects) {
		// @rpath needs a caller-dependent search stack. Require explicit relocation
		// before assembly instead of accepting a path that only works on the builder.
		if (object.rpaths.length)
			throw new Error(`Remove/resolve build-time rpaths: ${name}`);
		for (const dep of object.dependencies) {
			const resolved = resolveDependency(
				dep,
				name,
				object.fileType === 2 ? name : null,
			);
			if (
				resolved.local &&
				![6, 8].includes(objects.get(resolved.local)?.fileType)
			)
				throw new Error(
					`Missing bundled dependency: ${name} -> ${dep}`,
				);
			dependencies.push({ owner: name, dependency: dep, ...resolved });
		}
	}
	return { ...bundle, dependencies, machObjects: objects.size };
}
