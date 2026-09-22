import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	snapMetadata,
	validateSnap,
	validateSnapPayload,
} from "../../scripts/lib/desktop-snap.mjs";
import { artifactMatrix } from "../../scripts/lib/desktop-artifacts.mjs";
const recipe = () =>
	readFile("packaging/desktop/snap/snapcraft.yaml", "utf8").then(
		snapMetadata,
	);
test("Snap recipe targets core24 amd64 with explicit local file permissions", async () => {
	assert.equal(validateSnap(await recipe(), "0.1.0"), true);
});
test("Snap metadata rejects aliases, duplicate fields and oversized documents", () => {
	assert.throws(() => snapMetadata("name: one\nname: two"));
	assert.throws(() => snapMetadata("a: &a [hello]\nb: *a"));
	assert.throws(() => snapMetadata("x".repeat(1024 ** 2 + 1)));
});
test("Snap metadata refuses widened permissions, services, wrong base and version", async () => {
	for (const patch of [
		{ base: "core22" },
		{ confinement: "classic" },
		{ grade: "stable" },
		{ version: "9.0" },
		{ hooks: { install: {} } },
	]) {
		const meta = await recipe();
		assert.throws(() => validateSnap({ ...meta, ...patch }, "0.1.0"));
	}
	for (const plug of [
		"network",
		"system-files",
		"personal-files",
		"process-control",
	]) {
		const meta = await recipe();
		meta.apps["z8-work"].plugs.push(plug);
		assert.throws(() => validateSnap(meta, "0.1.0"), /permissions/);
	}
});
test("Snap payload rejects Debian bundles and GTK dialogs even when architecture matches", async () => {
	const artifact = (await artifactMatrix()).artifacts.find(
		(a) => a.channel === "snap",
	);
	const info = {
		schema: 1,
		version: "0.1.0",
		os: "linux",
		arch: "x86_64",
		engines: "bundled",
		debug: false,
		customProtocol: true,
		processLifetime: "watchdog-pipe-v1",
		updater: false,
		fileDialog: "xdg-portal",
		resourceDirectoryName: "Z8.Work Desktop Dev",
	};
	const bundle = {
		manifest: { arch: "x86_64", os: "linux" },
		provenance: { host: 'ID=ubuntu\nVERSION_ID="24.04"\n' },
	};
	assert.doesNotThrow(() =>
		validateSnapPayload(bundle, info, artifact, "0.1.0"),
	);
	assert.throws(
		() =>
			validateSnapPayload(
				{
					...bundle,
					provenance: { host: 'ID=debian\nVERSION_ID="13"' },
				},
				info,
				artifact,
				"0.1.0",
			),
		/Ubuntu/,
	);
	assert.throws(() =>
		validateSnapPayload(
			bundle,
			{ ...info, fileDialog: "gtk3" },
			artifact,
			"0.1.0",
		),
	);
	assert.throws(
		() =>
			validateSnapPayload(
				bundle,
				{ ...info, resourceDirectoryName: "../outside" },
				artifact,
				"0.1.0",
			),
		/Unsafe/,
	);
});
test("expanded Snap permits only the reviewed GNOME command chain and font hook", async () => {
	const meta = await recipe();
	meta.architectures = ["amd64"];
	meta.apps["z8-work"]["command-chain"] = [
		"snap/command-chain/gpu-2404-wrapper",
		"snap/command-chain/desktop-launch",
	];
	meta.hooks = {
		configure: {
			"command-chain": ["snap/command-chain/hooks-configure-fonts"],
			plugs: ["desktop"],
		},
	};
	assert.equal(validateSnap(meta, "0.1.0", true), true);
	meta.hooks.configure["command-chain"] = ["usr/bin/arbitrary"];
	assert.throws(() => validateSnap(meta, "0.1.0", true), /hooks/);
});
