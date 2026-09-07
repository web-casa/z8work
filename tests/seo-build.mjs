import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
	indexedLocales,
	supportedLocales,
	pagePaths,
	indexablePaths,
	localePath,
	siteUrl,
} from "../src/lib/seo/routes.mjs";

let checked = 0;
for (const locale of supportedLocales) {
	const titles = new Set();
	for (const path of pagePaths) {
		const localized = localePath(path, locale);
		const html = await readFile(`build${localized}index.html`, "utf8");
		const indexable =
			indexedLocales.includes(locale) && indexablePaths.includes(path);
		assert.ok(html.includes(`<html lang="${locale}">`), localized);
		assert.equal([...html.matchAll(/<title>/g)].length, 1, localized);
		assert.equal(
			[...html.matchAll(/<meta name="description"/g)].length,
			1,
			localized,
		);
		assert.equal([...html.matchAll(/<h1\b/g)].length, 1, localized);
		assert.ok(
			html.includes(`rel="canonical" href="${siteUrl}${localized}"`),
			localized,
		);
		assert.equal(
			/name="robots" content="noindex, follow"/.test(html),
			!indexable,
			localized,
		);
		const title = html.match(/<title>(.*?)<\/title>/s)[1];
		assert.ok(!titles.has(title), `Duplicate title: ${localized}`);
		titles.add(title);
		const alternates = [
			...html.matchAll(
				/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g,
			),
		];
		assert.equal(
			alternates.length,
			indexable ? indexedLocales.length + 1 : 0,
			localized,
		);
		for (const [, code, href] of alternates)
			assert.equal(
				href,
				siteUrl + localePath(path, code === "x-default" ? "en" : code),
			);
		const schema = html.match(
			/<script type="application\/ld\+json">(.*?)<\/script>/s,
		);
		assert.equal(!!schema, indexable, localized);
		if (schema) {
			const graph = JSON.parse(schema[1])["@graph"];
			assert.equal(
				graph.find((node) => node["@type"] === "WebPage").url,
				siteUrl + localized,
			);
			assert.ok(!schema[1].includes("aggregateRating"));
		}
		checked++;
	}
}
const sitemap = await readFile("build/sitemap.xml", "utf8");
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
	(match) => match[1],
);
const expected = indexedLocales.flatMap((locale) =>
	indexablePaths.map((path) => siteUrl + localePath(path, locale)),
);
assert.deepEqual(urls.sort(), expected.sort());
assert.equal(new Set(urls).size, urls.length);
const missing = await readFile("build/404.html", "utf8");
assert.match(missing, /name="robots" content="noindex, follow"/);
assert.doesNotMatch(missing, /<script/);
console.log(
	JSON.stringify({
		checkedPages: checked,
		indexedPages: urls.length,
		metadata: "passed",
		languages: "passed",
		sitemap: "passed",
		structuredData: "passed",
		static404: "passed",
	}),
);
