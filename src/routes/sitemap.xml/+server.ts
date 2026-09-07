import {
	indexedLocales,
	indexablePaths,
	localePath,
	siteUrl,
} from "$lib/seo/routes.mjs";

export const prerender = true;
export function GET() {
	const urls = indexedLocales.flatMap((locale) =>
		indexablePaths.map(
			(path) =>
				`<url><loc>${siteUrl}${localePath(path, locale)}</loc></url>`,
		),
	);
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("\n")}</urlset>`,
		{ headers: { "Content-Type": "application/xml; charset=utf-8" } },
	);
}
