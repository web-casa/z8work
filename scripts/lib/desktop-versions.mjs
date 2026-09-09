import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { snapMetadata } from "./desktop-snap.mjs";

export function versionParts(value, count) {
	if (
		typeof value !== "string" ||
		!new RegExp(`^(0|[1-9]\\d*)(\\.(0|[1-9]\\d*)){${count - 1}}$`).test(
			value,
		)
	)
		throw new Error("Invalid numeric package version");
	const parts = value.split(".").map(Number);
	if (parts.some((n) => !Number.isSafeInteger(n) || n > 65535))
		throw new Error("Package version exceeds bounds");
	return parts;
}
export function validateVersions(plan) {
	if (
		plan?.schema !== 1 ||
		plan.syntheticUpgrade?.published !== false ||
		plan.storeVersion !== null
	)
		throw new Error(
			"Expected explicit development mapping; no inferred Store version",
		);
	for (const [key, count] of [
		["application", 3],
		["developmentMsix", 4],
		["macosBundle", 3],
	]) {
		const current = versionParts(plan[key], count),
			previous = versionParts(plan.syntheticUpgrade[key], count);
		const differing = current.findIndex((n, i) => n !== previous[i]);
		if (differing < 0 || current[differing] < previous[differing])
			throw new Error(
				"Synthetic upgrade must use a strictly lower version",
			);
		if (count === 4 && [current, previous].some((p) => !p[0] || p[3]))
			throw new Error(
				"MSIX mapping requires nonzero major and zero final component",
			);
		if (
			key === "macosBundle" &&
			[current, previous].some(
				(p) => !p[0] || p[0] > 9999 || p[1] > 99 || p[2] > 99,
			)
		)
			throw new Error("Invalid CFBundleVersion mapping");
	}
	return plan;
}
export async function checkVersions(
	root = fileURLToPath(new URL("../../", import.meta.url)),
) {
	const json = async (p) => JSON.parse(await readFile(join(root, p), "utf8"));
	const plan = validateVersions(
		await json("packaging/desktop/versions.json"),
	);
	const config = await json("src-tauri/tauri.conf.json"),
		matrix = await json("packaging/desktop/artifacts.json"),
		msix = await json("packaging/desktop/windows/msix/development.json"),
		mac = await json("packaging/desktop/macos/development.json");
	const snap = snapMetadata(
		await readFile(
			join(root, "packaging/desktop/snap/snapcraft.yaml"),
			"utf8",
		),
	);
	for (const path of [
		"src-tauri/Cargo.toml",
		"src-tauri/native/Cargo.toml",
	]) {
		const packageSection = (await readFile(join(root, path), "utf8")).split(
			/\n\[/,
		)[0];
		if (
			packageSection.match(/^version\s*=\s*"([^"]+)"/m)?.[1] !==
			plan.application
		)
			throw new Error(`Cargo version drift: ${path}`);
	}
	if (
		[config.version, matrix.version, snap.version].some(
			(v) => v !== plan.application,
		) ||
		msix.version !== plan.developmentMsix ||
		mac.identifier !== config.identifier ||
		mac.name !== config.productName
	)
		throw new Error("Desktop version/identity drift");
	return {
		schema: 1,
		...plan,
		applicationId: config.identifier,
		msixIdentity: msix.identity,
		msixPublisher: msix.publisher,
		snapName: snap.name,
	};
}
