import { parse } from "yaml";
import { validateBuild } from "./desktop-artifacts.mjs";
export function snapMetadata(text) {
	if (Buffer.byteLength(text) > 1024 ** 2)
		throw new Error("Snap metadata too large");
	return parse(text, { uniqueKeys: true, maxAliasCount: 0 });
}
export function validateSnap(meta, version, expanded = false) {
	if (
		meta?.name !== "z8-work" ||
		meta.version !== version ||
		meta.base !== "core24" ||
		meta.confinement !== "strict" ||
		meta.grade !== "devel"
	)
		throw new Error("Snap target/version/confinement mismatch");
	if (
		expanded &&
		(meta.architectures?.length !== 1 || meta.architectures[0] !== "amd64")
	)
		throw new Error("Snap must contain only amd64 binaries");
	const apps = meta.apps;
	if (
		!apps ||
		Object.keys(apps).join() !== "z8-work" ||
		apps["z8-work"].command !== "usr/bin/z8-desktop"
	)
		throw new Error("Unexpected Snap application command");
	const app = apps["z8-work"];
	const expected = expanded
		? [
				"home",
				"removable-media",
				"desktop",
				"desktop-legacy",
				"gsettings",
				"opengl",
				"wayland",
				"x11",
			]
		: ["home", "removable-media"];
	if (
		!Array.isArray(app.plugs) ||
		app.plugs.some((p) => !expected.includes(p)) ||
		!["home", "removable-media"].every((p) => app.plugs.includes(p))
	)
		throw new Error("Unexpected Snap permissions");
	if (
		!expanded &&
		(app.extensions?.join() !== "gnome" ||
			Object.keys(meta.platforms ?? {}).join() !== "amd64" ||
			meta.parts?.["z8-work"]?.source !== "payload")
	)
		throw new Error("Invalid Snap build recipe");
	if (
		meta.hooks &&
		(!expanded ||
			Object.keys(meta.hooks).join() !== "configure" ||
			Object.keys(meta.hooks.configure).sort().join() !==
				"command-chain,plugs" ||
			meta.hooks.configure["command-chain"]?.join() !==
				"snap/command-chain/hooks-configure-fonts" ||
			meta.hooks.configure.plugs?.join() !== "desktop")
	)
		throw new Error("Unexpected Snap hooks");
	if (
		expanded &&
		app["command-chain"]?.join() !==
			"snap/command-chain/gpu-2404-wrapper,snap/command-chain/desktop-launch"
	)
		throw new Error("Unexpected Snap command chain");
	if (
		app.environment ||
		(meta.environment &&
			(Object.keys(meta.environment).sort().join() !==
				"GTK_USE_PORTAL,SNAP_DESKTOP_RUNTIME" ||
				meta.environment.GTK_USE_PORTAL !== "1" ||
				meta.environment.SNAP_DESKTOP_RUNTIME !==
					"$SNAP/gnome-platform"))
	)
		throw new Error("Unreviewed Snap runtime environment");
	if (app.daemon || app.install || app.refresh || meta.slots)
		throw new Error("Unexpected Snap service/hooks");
	return true;
}
export function validateSnapPayload(bundle, info, artifact, version) {
	validateBuild(info, artifact, version);
	if (
		bundle.manifest.arch !== "x86_64" ||
		bundle.manifest.os !== "linux" ||
		!/^ID=ubuntu$/m.test(bundle.provenance.host) ||
		!/^VERSION_ID="24\.04"$/m.test(bundle.provenance.host)
	)
		throw new Error("Snap requires engines built on Ubuntu 24.04 amd64");
	if (
		!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(info.resourceDirectoryName) ||
		info.resourceDirectoryName.includes("..")
	)
		throw new Error("Unsafe resource directory");
}

// ${SNAP} is expanded by snapd, while desktop-file-validate expects an absolute
// icon path. Validate a temporary normalized copy without changing package bytes.
export async function checkSnapDesktop(path) {
	const { readFile, writeFile, mkdtemp, rm } = await import(
		"node:fs/promises"
	);
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const { execFileSync } = await import("node:child_process");
	const text = await readFile(path, "utf8");
	if (
		!/^Exec=z8-work$/m.test(text) ||
		!/^Icon=\$\{SNAP\}\/usr\/share\/icons\/hicolor\/192x192\/apps\/z8-work.png$/m.test(
			text,
		)
	)
		throw new Error("Unexpected desktop launcher command/icon");
	const temp = await mkdtemp(join(tmpdir(), "z8-desktop-entry-"));
	try {
		const normalized = join(temp, "z8-work.desktop");
		await writeFile(
			normalized,
			text.replaceAll("${SNAP}", "/snap/z8-work/current"),
		);
		execFileSync("desktop-file-validate", [normalized], {
			encoding: "utf8",
			timeout: 10000,
			maxBuffer: 1024 ** 2,
		});
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
}
