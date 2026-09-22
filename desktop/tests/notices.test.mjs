import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileInfo } from "../../scripts/lib/desktop-sources.mjs";
test("supplementary notices preserve exact upstream bytes and immutable source revisions", async () => {
	const root = "packaging/desktop/notices",
		lock = JSON.parse(await readFile(root + "/supplement.json", "utf8"));
	assert.equal(lock.redistributionApproved, false);
	const seen = new Set();
	for (const component of lock.components) {
		const key = component.name + "@" + component.version;
		assert.ok(!seen.has(key));
		seen.add(key);
		assert.match(component.commit, /^[a-f0-9]{40}$/);
		assert.ok(component.notices.length);
		for (const file of component.notices) {
			assert.deepEqual(await fileInfo(root, file.file), {
				sha256: file.sha256,
				bytes: file.bytes,
			});
			const url = new URL(file.url);
			assert.equal(url.protocol, "https:");
			if (url.hostname === "raw.githubusercontent.com")
				assert.ok(url.pathname.includes("/" + component.commit + "/"));
			else {
				assert.equal(component.declaredLicense, "MPL-2.0");
				assert.equal(
					file.url,
					"https://www.mozilla.org/media/MPL/2.0/index.txt",
				);
			}
		}
	}
});
