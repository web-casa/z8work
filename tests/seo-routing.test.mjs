import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	indexedLocales,
	supportedLocales,
	indexablePaths,
	pagePaths,
	localeFromPath,
	localePath,
	unlocalizedPath,
	toolForPath,
	tools,
} from "../src/lib/seo/routes.mjs";

test("SEO language coverage agrees with the translation project", async () => {
	const settings = JSON.parse(
		await readFile(
			new URL("../project.inlang/settings.json", import.meta.url),
			"utf8",
		),
	);
	assert.deepEqual([...supportedLocales].sort(), settings.locales.sort());
	for (const locale of indexedLocales)
		assert.ok(supportedLocales.includes(locale));
	assert.equal(new Set(pagePaths).size, pagePaths.length);
});

test("localized navigation preserves paths, queries and fragments without doubling prefixes", () => {
	for (const locale of supportedLocales)
		for (const path of pagePaths) {
			const localized = localePath(path, locale);
			assert.equal(localeFromPath(localized), locale);
			assert.equal(unlocalizedPath(localized), path);
			assert.equal(localePath(localized, locale), localized);
		}
	assert.equal(
		localePath("/es/environment/?source=footer#method", "zh-Hans"),
		"/zh-Hans/environment/?source=footer#method",
	);
	assert.equal(localePath("/zh-Hans/", "en"), "/");
	assert.equal(localeFromPath("/not-a-language/about/"), "en");
});

test("tool presets match only known tool routes, and operational pages are excluded from the sitemap", () => {
	for (const tool of tools) {
		assert.equal(toolForPath(`/zh-Hans/tools/${tool.slug}/`), tool);
		assert.ok(indexablePaths.includes(`/tools/${tool.slug}/`));
	}
	assert.equal(toolForPath("/tools/not-a-tool/"), undefined);
	assert.equal(toolForPath("/convert/"), undefined);
	assert.ok(!indexablePaths.includes("/settings/"));
	assert.ok(!indexablePaths.includes("/convert/"));
});
