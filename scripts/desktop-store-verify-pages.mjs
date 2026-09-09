// Read-only verification of this project's public documentation after an authorized deployment.
import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { loadStore, pagePath, renderPage } from "./lib/desktop-store.mjs";
import { sha256 } from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({ options: { output: { type: "string" } } });
if (!values.output) throw new Error("--output is required");
const { content, matrix } = await loadStore();
const pages = await Promise.all(
	matrix.languages.flatMap((locale) =>
		["privacy", "support"].map(async (kind) => {
			const url = new URL(pagePath(locale, kind), content.website).href;
			try {
				const response = await fetch(url, {
					redirect: "error",
					signal: AbortSignal.timeout(15000),
				});
				const chunks = [];
				let length = 0;
				for await (const chunk of response.body) {
					length += chunk.length;
					if (length > 1024 * 1024)
						throw new Error("Public page exceeds 1 MiB");
					chunks.push(chunk);
				}
				const digest = sha256(Buffer.concat(chunks));
				const expected = sha256(
					Buffer.from(renderPage(content, locale, kind)),
				);
				return {
					url,
					status: response.status,
					sha256: digest,
					expectedSha256: expected,
					match: response.status === 200 && digest === expected,
				};
			} catch (e) {
				return { url, status: 0, match: false, error: e.message };
			}
		}),
	),
);
const report = {
	schema: 1,
	status: pages.every((p) => p.match) ? "passed" : "failed",
	checkedAt: new Date().toISOString(),
	pages,
};
await writeFile(values.output, JSON.stringify(report, null, 2) + "\n", {
	flag: "wx",
});
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exitCode = 1;
