// PE/COFF inspection only: no execution, DLL loading or Authenticode claims.
// Format: https://learn.microsoft.com/en-us/windows/win32/debug/pe-format
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { sha256 } from "./desktop-artifacts.mjs";

export function inspectPe(bytes, expectedArch = "x86_64") {
	const requireRange = (offset, size) => {
		if (
			!Number.isSafeInteger(offset) ||
			offset < 0 ||
			size < 0 ||
			offset + size > bytes.length
		)
			throw new Error("Truncated or invalid PE range");
	};
	const u16 = (offset) => {
		requireRange(offset, 2);
		return bytes.readUInt16LE(offset);
	};
	const u32 = (offset) => {
		requireRange(offset, 4);
		return bytes.readUInt32LE(offset);
	};
	if (u16(0) !== 0x5a4d) throw new Error("Missing DOS signature");
	const pe = u32(0x3c);
	if (pe < 64 || u32(pe) !== 0x4550) throw new Error("Missing PE signature");
	if (
		!["x86_64", "aarch64"].includes(expectedArch) ||
		u16(pe + 4) !== { x86_64: 0x8664, aarch64: 0xaa64 }[expectedArch]
	)
		throw new Error("Expected matching Windows PE machine");
	const count = u16(pe + 6),
		optionalSize = u16(pe + 20),
		flags = u16(pe + 22);
	const optional = pe + 24;
	if (!(flags & 2) || optionalSize < 112 || u16(optional) !== 0x20b)
		throw new Error("Expected executable PE32+ image");
	if (count < 1 || count > 96) throw new Error("Invalid PE section count");
	requireRange(optional, optionalSize + count * 40);
	const directoryCount = u32(optional + 108);
	if (directoryCount > 16 || 112 + directoryCount * 8 > optionalSize)
		throw new Error("Invalid PE directory table");
	const sections = [];
	for (let index = 0; index < count; index++) {
		const offset = optional + optionalSize + index * 40;
		const section = {
			rva: u32(offset + 12),
			virtualSize: u32(offset + 8),
			size: u32(offset + 16),
			offset: u32(offset + 20),
		};
		requireRange(section.offset, section.size);
		const end = section.rva + Math.max(section.size, section.virtualSize);
		if (
			end > 0x100000000 ||
			sections.some(
				(s) =>
					section.rva < s.rva + Math.max(s.size, s.virtualSize) &&
					s.rva < end,
			)
		)
			throw new Error("Overlapping or overflowing PE sections");
		sections.push(section);
	}
	const fileOffset = (rva, size = 1) => {
		const section = sections.find(
			(s) => rva >= s.rva && rva + size <= s.rva + s.size,
		);
		if (!section) throw new Error("PE RVA outside file-backed sections");
		return section.offset + rva - section.rva;
	};
	const directory = (index) => {
		if (index >= directoryCount) return { rva: 0, size: 0 };
		const offset = optional + 112 + index * 8;
		const entry = { rva: u32(offset), size: u32(offset + 4) };
		if (!entry.rva !== !entry.size)
			throw new Error("Incomplete PE directory");
		return entry;
	};
	const dllName = (rva) => {
		let name = "";
		for (let i = 0; i < 260; i++) {
			const value = bytes[fileOffset(rva + i)];
			if (!value) {
				if (!/^[a-z0-9_+.-]+\.(?:dll|drv)$/i.test(name))
					throw new Error("Invalid PE DLL name");
				return name.toLowerCase();
			}
			name += String.fromCharCode(value);
		}
		throw new Error("Unterminated PE DLL name");
	};
	const imports = (index, stride) => {
		const entry = directory(index);
		if (!entry.rva) return [];
		if (entry.size > 1024 * 1024 || entry.size < stride)
			throw new Error("Invalid PE imports size");
		const offset = fileOffset(entry.rva, entry.size),
			names = new Set();
		for (let at = 0; at + stride <= entry.size; at += stride) {
			const descriptor = bytes.subarray(
				offset + at,
				offset + at + stride,
			);
			if (descriptor.every((value) => value === 0))
				return [...names].sort();
			// Modern PE32+ delay descriptors store RVAs. Reject legacy VA mode.
			if (index === 13 && u32(offset + at) !== 1)
				throw new Error("Unsupported delay import addressing");
			names.add(dllName(u32(offset + at + (index === 13 ? 4 : 12))));
		}
		throw new Error("Unterminated PE import descriptors");
	};
	const certificate = directory(4); // This directory uses a file offset, not an RVA.
	if (certificate.size) requireRange(certificate.rva, certificate.size);
	const resources = directory(2);
	if (resources.size) fileOffset(resources.rva, resources.size);
	return {
		arch: expectedArch,
		kind: flags & 0x2000 ? "dll" : "exe",
		subsystem: u16(optional + 68),
		imports: imports(1, 20),
		delayImports: imports(13, 32),
		resourcesPresent: resources.size > 0,
		certificateTablePresent: certificate.size > 0,
	};
}

// Explicit OS DLL contracts, not a search of the build host's PATH/System32.
// VC++ redistributable DLLs and WebView2Loader are deliberately NOT included.
const systemDlls = new Set([
	"advapi32.dll",
	"avicap32.dll",
	"avrt.dll",
	"bcrypt.dll",
	"bcryptprimitives.dll",
	"cabinet.dll",
	"cfgmgr32.dll",
	"combase.dll",
	"comctl32.dll",
	"comdlg32.dll",
	"crypt32.dll",
	"d2d1.dll",
	"d3d11.dll",
	"dcomp.dll",
	"dbghelp.dll",
	"dnsapi.dll",
	"dwmapi.dll",
	"dwrite.dll",
	"dxgi.dll",
	"gdi32.dll",
	"gdiplus.dll",
	"imm32.dll",
	"iphlpapi.dll",
	"kernel32.dll",
	"msimg32.dll",
	"msvcrt.dll",
	"ncrypt.dll",
	"netapi32.dll",
	"ntdll.dll",
	"ole32.dll",
	"oleacc.dll",
	"oleaut32.dll",
	"opengl32.dll",
	"powrprof.dll",
	"propsys.dll",
	"psapi.dll",
	"rpcrt4.dll",
	"secur32.dll",
	"setupapi.dll",
	"shell32.dll",
	"shlwapi.dll",
	"shcore.dll",
	"ucrtbase.dll",
	"urlmon.dll",
	"user32.dll",
	"userenv.dll",
	"usp10.dll",
	"uxtheme.dll",
	"version.dll",
	"windowscodecs.dll",
	"winhttp.dll",
	"wininet.dll",
	"winmm.dll",
	"winspool.drv",
	"ws2_32.dll",
	"wtsapi32.dll",
]);
export function dependencyKind(name) {
	if (
		systemDlls.has(name) ||
		/^(?:api|ext)-ms-win-[a-z0-9-]+-l\d+-\d+-\d+\.dll$/.test(name)
	)
		return "windows-contract";
	return "private";
}

export async function inspectWindowsTree(
	root,
	architectureFor = () => "x86_64",
) {
	const images = new Map(),
		names = new Set();
	let totalFiles = 0;
	async function walk(relative = "") {
		const directory = join(root, relative);
		if (
			!(await lstat(directory)).isDirectory() ||
			(await lstat(directory)).isSymbolicLink()
		)
			throw new Error("Windows input root must be a real directory");
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const name = relative ? `${relative}/${entry.name}` : entry.name;
			if (++totalFiles > 10000)
				throw new Error("Windows input exceeds file limit");
			if (names.has(name.toLowerCase()))
				throw new Error(`Case-insensitive path collision: ${name}`);
			names.add(name.toLowerCase());
			if (entry.isDirectory()) await walk(name);
			else if (!entry.isFile())
				throw new Error(`Non-regular Windows input: ${name}`);
			else if (/\.(?:exe|dll)$/i.test(name)) {
				const path = join(root, name);
				if ((await lstat(path)).size > 512 * 1024 * 1024)
					throw new Error(`PE exceeds 512 MiB: ${name}`);
				const bytes = await readFile(path);
				const pe = inspectPe(bytes, architectureFor(name));
				if (
					pe.kind !==
					(name.toLowerCase().endsWith(".dll") ? "dll" : "exe")
				)
					throw new Error(
						`PE kind does not match extension: ${name}`,
					);
				images.set(name.toLowerCase(), {
					path: name,
					bytes: bytes.length,
					sha256: sha256(bytes),
					...pe,
				});
			}
		}
	}
	await walk();
	if (!images.size) throw new Error("No PE images found");
	const dependencies = [];
	for (const [key, image] of images) {
		for (const name of new Set([...image.imports, ...image.delayImports])) {
			const parent = dirname(key).replaceAll("\\", "/");
			const sibling = parent === "." ? name : `${parent}/${name}`;
			const kind = dependencyKind(name);
			const bundled = images.has(sibling);
			if (bundled && images.get(sibling).arch !== image.arch)
				throw new Error(
					`Private DLL architecture mismatch: ${sibling}`,
				);
			if (kind === "windows-contract" && bundled)
				throw new Error(
					`Bundled DLL shadows Windows contract: ${sibling}`,
				);
			dependencies.push({
				importer: image.path,
				name,
				kind,
				status:
					kind === "windows-contract" || bundled
						? "resolved-static"
						: "missing",
			});
		}
	}
	return {
		images: [...images.values()].sort((a, b) =>
			a.path.localeCompare(b.path),
		),
		dependencies,
		missing: dependencies.filter((d) => d.status === "missing"),
	};
}
