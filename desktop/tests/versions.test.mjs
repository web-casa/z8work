import test from "node:test";
import assert from "node:assert/strict";
import {
	checkVersions,
	validateVersions,
} from "../../scripts/lib/desktop-versions.mjs";
test("desktop app, channels and synthetic upgrade versions agree", async () => {
	const v = await checkVersions();
	assert.equal(v.storeVersion, null);
	assert.equal(v.syntheticUpgrade.published, false);
	assert.notEqual(v.application, v.developmentMsix);
});
test("version mappings reject downgrade, overflow, ambiguous numbers and guessed Store versions", () => {
	const plan = {
		schema: 1,
		application: "0.1.0",
		developmentMsix: "1.0.1.0",
		macosBundle: "1.0.1",
		syntheticUpgrade: {
			application: "0.0.9",
			developmentMsix: "1.0.0.0",
			macosBundle: "1.0.0",
			published: false,
		},
		storeVersion: null,
	};
	for (const patch of [
		{ application: "0.0.9" },
		{ macosBundle: "0.1.0" },
		{ macosBundle: "1.100.1" },
		{ application: "0.01.0" },
		{ application: "1.65536.0" },
		{ developmentMsix: "0.1.0.0" },
		{ developmentMsix: "1.0.1.1" },
		{ storeVersion: "1.0.1.0" },
		{ syntheticUpgrade: { ...plan.syntheticUpgrade, published: true } },
	])
		assert.throws(() => validateVersions({ ...plan, ...patch }));
});
