import test from "node:test";
import assert from "node:assert/strict";
import {
	readFile,
	writeFile,
	mkdtemp,
	mkdir,
	rm,
	symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	validateStoreMsixConfig,
	storeMsixManifest,
	msixManifest,
} from "../scripts/lib/desktop-msix.mjs";
import {
	prepareWebMsix,
	verifyWebMsixLayout,
} from "../scripts/lib/desktop-web-msix.mjs";
const store = JSON.parse(
	await readFile("packaging/desktop-web/microsoft-store.json", "utf8"),
);
const config = () => ({ ...store, architecture: "x64" });

test("Store identity/version validation preserves the legacy development boundary", () => {
	const c = config();
	validateStoreMsixConfig(c);
	assert.match(storeMsixManifest(c), /53660AlanM.Z8Work/);
	assert.throws(() => msixManifest(c), /development/);
	for (const override of [
		{ identity: null },
		{ publisher: "CN=Z8.Work Development" },
		{ architecture: "neutral" },
		{ version: "0.2.0.0" },
		{ version: "1.0.0.1" },
		{ version: "01.0.0.0" },
		{ firstSubmission: null },
		{ firstSubmission: false, highestPackageVersion: "1.0.0.0" },
		{ firstSubmission: false, highestPackageVersion: "2.0.0.0" },
		{ firstSubmission: true, highestPackageVersion: "1.0.0.0" },
	])
		assert.throws(() => validateStoreMsixConfig({ ...c, ...override }));
	validateStoreMsixConfig({
		...c,
		firstSubmission: false,
		highestPackageVersion: "1.0.0.0",
		version: "1.0.1.0",
	});
	assert.match(
		storeMsixManifest({ ...c, description: 'a < b & "c"' }),
		/a &lt; b &amp; &quot;c&quot;/,
	);
});

// PE metadata fixture only; never executed or presented as an installable app.
function pe(arch) {
	const b = Buffer.alloc(1024),
		p = 128,
		o = p + 24,
		s = o + 240;
	b.writeUInt16LE(0x5a4d);
	b.writeUInt32LE(p, 0x3c);
	b.writeUInt32LE(0x4550, p);
	b.writeUInt16LE(arch === "arm64" ? 0xaa64 : 0x8664, p + 4);
	b.writeUInt16LE(1, p + 6);
	b.writeUInt16LE(240, p + 20);
	b.writeUInt16LE(2, p + 22);
	b.writeUInt16LE(0x20b, o);
	b.writeUInt16LE(2, o + 68);
	b.writeUInt32LE(16, o + 108);
	b.writeUInt32LE(512, s + 8);
	b.writeUInt32LE(0x1000, s + 12);
	b.writeUInt32LE(512, s + 16);
	b.writeUInt32LE(512, s + 20);
	b.writeUInt32LE(0x1000, o + 128);
	b.writeUInt32LE(16, o + 132);
	return b;
}
for (const arch of ["x64", "arm64"])
	test(`web MSIX ${arch} copies exact payload, rejects legacy resources and tampering`, async (t) => {
		const root = await mkdtemp(join(tmpdir(), "z8-web-msix-"));
		t.after(() => rm(root, { recursive: true, force: true }));
		const payload = join(root, "payload");
		await mkdir(payload);
		const c = { ...config(), architecture: arch };
		if (arch === "arm64")
			c.minimumWindowsVersion = c.maxVersionTested = "10.0.22000.0";
		await writeFile(join(payload, "z8-desktop.exe"), pe(arch));
		const args = {
			payload,
			output: join(root, "prepared"),
			config: c,
			sourceCommit: "a".repeat(40),
		};
		const receipt = await prepareWebMsix(args);
		assert.equal(receipt.storeSubmissionAllowed, false);
		assert.equal(receipt.redistributionApproved, false);
		await verifyWebMsixLayout(join(args.output, "layout"), receipt);
		await assert.rejects(prepareWebMsix(args), /EEXIST/);
		await writeFile(
			join(args.output, "layout", "AppxManifest.xml"),
			"changed",
		);
		await assert.rejects(
			verifyWebMsixLayout(join(args.output, "layout"), receipt),
			/Changed/,
		);
		await mkdir(join(payload, "engines"));
		await writeFile(join(payload, "engines", "engines.json"), "{}");
		await assert.rejects(
			prepareWebMsix({ ...args, output: join(root, "legacy") }),
			/clean web-engine payload/,
		);
		await rm(join(payload, "engines"), { recursive: true });
		await writeFile(
			join(payload, "z8-desktop.exe"),
			pe(arch === "x64" ? "arm64" : "x64"),
		);
		await assert.rejects(
			prepareWebMsix({ ...args, output: join(root, "wrong-arch") }),
			/PE machine/,
		);
		if (process.platform !== "win32") {
			await rm(join(payload, "z8-desktop.exe"));
			await symlink(
				join(args.output, "layout", "z8-desktop.exe"),
				join(payload, "z8-desktop.exe"),
			);
			await assert.rejects(
				prepareWebMsix({ ...args, output: join(root, "symlink") }),
				/Non-regular/,
			);
		}
	});
