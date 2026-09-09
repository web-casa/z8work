import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileInfo, listFiles, inspectBundle } from "./desktop-sources.mjs";
import { inspectWindowsTree } from "./desktop-windows.mjs";
import { windowsResource } from "./desktop-windows-bundle.mjs";
export const msixAssets = {
	"Square44x44Logo.png": 44,
	"StoreLogo.png": 50,
	"Square150x150Logo.png": 150,
};
const xml = (value) =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
export async function msixConfig() {
	return JSON.parse(
		await readFile(
			new URL(
				"../../packaging/desktop/windows/msix/development.json",
				import.meta.url,
			),
			"utf8",
		),
	);
}
export function validateMsixConfig(config) {
	if (
		config?.schema !== 1 ||
		config.channel !== "local-development" ||
		config.storeSubmissionAllowed !== false ||
		config.identity !== "Z8Work.Desktop.Dev" ||
		config.publisher !== "CN=Z8.Work Development" ||
		config.webview2 !== "external-evergreen-required"
	)
		throw new Error(
			"Only the isolated development MSIX identity is supported",
		);
	const version = (value) =>
		typeof value === "string" &&
		/^\d+\.\d+\.\d+\.\d+$/.test(value) &&
		value
			.split(".")
			.every((n) => String(Number(n)) === n && Number(n) <= 65535);
	if (
		!version(config.version) ||
		!version(config.minimumWindowsVersion) ||
		!version(config.maxVersionTested)
	)
		throw new Error("Expected bounded four-part Windows versions");
	if (
		config.minimumWindowsVersion !== "10.0.19041.0" ||
		config.maxVersionTested !== "10.0.19041.0"
	)
		throw new Error("Unreviewed Windows compatibility declaration");
	if (JSON.stringify(config.languages) !== JSON.stringify(["en-US", "zh-CN"]))
		throw new Error("Unexpected MSIX languages");
	for (const name of ["displayName", "publisherDisplayName", "description"])
		if (
			typeof config[name] !== "string" ||
			!config[name].trim() ||
			config[name].length > 256 ||
			[...config[name]].some((char) => char.charCodeAt(0) < 32)
		)
			throw new Error("Invalid MSIX display text");
}
export function msixManifest(c) {
	validateMsixConfig(c);
	return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
  <Identity Name="${xml(c.identity)}" Publisher="${xml(c.publisher)}" Version="${xml(c.version)}" ProcessorArchitecture="x64" />
  <Properties><DisplayName>${xml(c.displayName)}</DisplayName><PublisherDisplayName>${xml(c.publisherDisplayName)}</PublisherDisplayName><Description>${xml(c.description)}</Description><Logo>Assets\\StoreLogo.png</Logo></Properties>
  <Resources>${c.languages.map((language) => `<Resource Language="${xml(language)}" />`).join("")}</Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="${c.minimumWindowsVersion}" MaxVersionTested="${c.maxVersionTested}" /></Dependencies>
  <Applications><Application Id="Z8Work" Executable="z8-desktop.exe" EntryPoint="Windows.FullTrustApplication"><uap:VisualElements DisplayName="${xml(c.displayName)}" Description="${xml(c.description)}" BackgroundColor="#086b68" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" /></Application></Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
`;
}
export function validatePng(bytes, size) {
	if (
		bytes.length < 33 ||
		bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
		bytes.toString("ascii", 12, 16) !== "IHDR" ||
		bytes.readUInt32BE(16) !== size ||
		bytes.readUInt32BE(20) !== size
	)
		throw new Error("Wrong MSIX PNG dimensions");
}
export function validateMsixReceipt(prepared) {
	if (
		prepared?.schema !== 1 ||
		prepared.scope !== "development-msix-layout" ||
		prepared.redistributionApproved !== false ||
		!prepared.files
	)
		throw new Error("Invalid MSIX preparation receipt");
	validateMsixConfig(prepared.config);
	const names = Object.keys(prepared.files);
	const seen = new Set();
	if (!names.length || names.length > 2000)
		throw new Error("Invalid MSIX file inventory");
	for (const name of names) {
		windowsResource(name);
		if (seen.has(name.toLowerCase()))
			throw new Error("MSIX path case collision");
		seen.add(name.toLowerCase());
	}
	let total = 0;
	for (const expected of Object.values(prepared.files)) {
		if (
			!expected ||
			!/^[a-f0-9]{64}$/.test(expected.sha256) ||
			!Number.isSafeInteger(expected.bytes) ||
			expected.bytes < 0 ||
			(total += expected.bytes) > 4 * 1024 ** 3
		)
			throw new Error("Invalid MSIX fingerprint");
	}
	for (const required of [
		"AppxManifest.xml",
		"z8-desktop.exe",
		"engines/engines.json",
	])
		if (!names.includes(required))
			throw new Error(`Missing MSIX payload: ${required}`);
	return names.sort();
}

export const installedMsixFootprints = Object.freeze([
	"AppxBlockMap.xml",
	"[Content_Types].xml",
	"AppxSignature.p7x",
	"AppxMetadata/CodeIntegrity.cat",
]);
export async function verifyMsixLayout(root, prepared) {
	return verifyPayload(root, prepared, []);
}
export async function verifyMsixInstalled(root, prepared) {
	return verifyPayload(root, prepared, installedMsixFootprints);
}
async function verifyPayload(root, prepared, footprints) {
	const names = validateMsixReceipt(prepared);
	const actualNames = (await listFiles(root)).filter(
		(name) => !footprints.includes(name),
	);
	if (JSON.stringify(actualNames) !== JSON.stringify(names))
		throw new Error("Missing or unlisted MSIX payload");
	for (const [name, expected] of Object.entries(prepared.files)) {
		const actual = await fileInfo(root, name, expected.bytes);
		if (
			actual.sha256 !== expected.sha256 ||
			actual.bytes !== expected.bytes
		)
			throw new Error(`Changed MSIX payload: ${name}`);
	}
	if (
		(await readFile(join(root, "AppxManifest.xml"), "utf8")) !==
		msixManifest(prepared.config)
	)
		throw new Error("Unexpected MSIX manifest content");
	for (const [name, size] of Object.entries(msixAssets))
		validatePng(await readFile(join(root, "Assets", name)), size);
	await inspectBundle(join(root, "engines"), "windows");
	const pe = await inspectWindowsTree(root);
	if (
		pe.missing.length ||
		!pe.images.some(
			(p) =>
				p.path === "z8-desktop.exe" &&
				p.subsystem === 2 &&
				p.resourcesPresent,
		)
	)
		throw new Error("Invalid MSIX PE payload");
	return pe;
}
