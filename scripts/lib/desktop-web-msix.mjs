import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileInfo, listFiles } from "./desktop-sources.mjs";
import { inspectWindowsTree } from "./desktop-windows.mjs";
import { assertOutside } from "./desktop-windows-acceptance.mjs";
import { msixAssets, validatePng, storeMsixManifest } from "./desktop-msix.mjs";

// Tauri embeds web assets in the EXE. Accept only that EXE and its loader;
// never silently include the old native engines, installers or build intermediates.
export async function prepareWebMsix({
	payload,
	output,
	config,
	sourceCommit,
}) {
	payload = resolve(payload);
	output = resolve(output);
	if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? ""))
		throw Error("Full source commit required");
	const manifest = storeMsixManifest(config);
	await assertOutside(payload, output);
	const names = await listFiles(payload);
	if (
		!names.includes("z8-desktop.exe") ||
		names.some((n) => !["z8-desktop.exe", "WebView2Loader.dll"].includes(n))
	)
		throw Error(
			"Use a clean web-engine payload containing z8-desktop.exe and optional WebView2Loader.dll only",
		);
	const pe = await inspectWindowsTree(payload, () =>
		config.architecture === "arm64" ? "aarch64" : "x86_64",
	);
	if (
		pe.missing.length ||
		!pe.images.some(
			(p) =>
				p.path === "z8-desktop.exe" &&
				p.subsystem === 2 &&
				p.resourcesPresent,
		)
	)
		throw Error("Missing DLL or invalid web-engine executable");
	const sourceFiles = Object.fromEntries(
		await Promise.all(
			names.map(async (n) => [n, await fileInfo(payload, n)]),
		),
	);
	await mkdir(output);
	const layout = join(output, "layout");
	await mkdir(layout);
	const files = {};
	for (const name of names) {
		await copyFile(join(payload, name), join(layout, name));
		files[name] = await fileInfo(layout, name);
		if (JSON.stringify(files[name]) !== JSON.stringify(sourceFiles[name]))
			throw Error("Payload changed while copying");
	}
	await mkdir(join(layout, "Assets"));
	for (const [name, size] of Object.entries(msixAssets)) {
		const source = fileURLToPath(
			new URL(
				`../../packaging/desktop/windows/msix/Assets/${name}`,
				import.meta.url,
			),
		);
		validatePng(await readFile(source), size);
		await copyFile(source, join(layout, "Assets", name));
		files[`Assets/${name}`] = await fileInfo(layout, `Assets/${name}`);
	}
	await writeFile(join(layout, "AppxManifest.xml"), manifest, { flag: "wx" });
	files["AppxManifest.xml"] = await fileInfo(layout, "AppxManifest.xml");
	for (const name of names)
		if (
			JSON.stringify(await fileInfo(payload, name)) !==
			JSON.stringify(sourceFiles[name])
		)
			throw Error("Source payload changed");
	const prepared = {
		schema: 1,
		scope: "web-store-msix-layout",
		config,
		sourceCommit,
		// A layout alone never authorizes submission or proves its claimed source.
		redistributionApproved: false,
		storeSubmissionAllowed: false,
		acceptance: "incomplete",
		files,
		pending: [
			"source-build binding",
			"engine corresponding sources and licenses",
			"MakeAppx and archive verification",
			"native installation and WebView2",
			"WACK",
			"listing and final review",
		],
	};
	await verifyWebMsixLayout(layout, prepared);
	await writeFile(
		join(output, "prepared.json"),
		JSON.stringify(prepared, null, 2) + "\n",
		{ flag: "wx" },
	);
	return prepared;
}

export async function verifyWebMsixLayout(layout, receipt) {
	if (
		receipt?.schema !== 1 ||
		receipt.scope !== "web-store-msix-layout" ||
		receipt.redistributionApproved !== false ||
		receipt.storeSubmissionAllowed !== false ||
		!/^[a-f0-9]{40}$/.test(receipt.sourceCommit ?? "")
	)
		throw Error("Invalid web MSIX receipt");
	const manifest = storeMsixManifest(receipt.config);
	const names = Object.keys(receipt.files ?? {}).sort();
	const required = [
		"AppxManifest.xml",
		"z8-desktop.exe",
		...Object.keys(msixAssets).map((n) => `Assets/${n}`),
	];
	if (
		required.some((n) => !names.includes(n)) ||
		names.some((n) => ![...required, "WebView2Loader.dll"].includes(n)) ||
		JSON.stringify(await listFiles(layout)) !== JSON.stringify(names)
	)
		throw Error("Unexpected web MSIX inventory");
	for (const name of names) {
		const expected = receipt.files[name];
		const actual = await fileInfo(layout, name);
		if (
			actual.sha256 !== expected?.sha256 ||
			actual.bytes !== expected?.bytes
		)
			throw Error(`Changed MSIX payload: ${name}`);
	}
	if ((await readFile(join(layout, "AppxManifest.xml"), "utf8")) !== manifest)
		throw Error("Changed MSIX identity");
	for (const [name, size] of Object.entries(msixAssets))
		validatePng(await readFile(join(layout, "Assets", name)), size);
	const pe = await inspectWindowsTree(layout, () =>
		receipt.config.architecture === "arm64" ? "aarch64" : "x86_64",
	);
	if (
		pe.missing.length ||
		!pe.images.some(
			(p) =>
				p.path === "z8-desktop.exe" &&
				p.subsystem === 2 &&
				p.resourcesPresent,
		)
	)
		throw Error("Invalid MSIX PE payload");
	return pe;
}
