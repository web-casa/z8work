import { readFile, writeFile } from "node:fs/promises";
import { renderPage, pagePath } from "./lib/desktop-store.mjs";
const content = JSON.parse(
	await readFile("packaging/desktop-web/content.json", "utf8"),
);
for (const locale of Object.keys(content.locales)) {
	for (const kind of ["privacy", "support"]) {
		const path = `static${pagePath(locale, kind)}/index.html`;
		const html = renderPage(content, locale, kind);
		if (process.argv.includes("--check")) {
			if ((await readFile(path, "utf8")) !== html)
				throw new Error(`Documentation drift: ${path}`);
		} else await writeFile(path, html);
	}
}
