// Render the existing code-native SVG brand into the base MSIX image sizes.
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const root = new URL(
	"../packaging/desktop/windows/msix/Assets/",
	import.meta.url,
);
await mkdir(root, { recursive: true });
const svg = await readFile(
	new URL("../static/brand/logo.svg", import.meta.url),
	"utf8",
);
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH,
	args: ["--no-sandbox"],
});
try {
	const page = await browser.newPage({ deviceScaleFactor: 1 });
	await page.route("**/*", (route) => route.abort());
	for (const [name, size] of [
		["Square44x44Logo", 44],
		["StoreLogo", 50],
		["Square150x150Logo", 150],
	]) {
		await page.setViewportSize({ width: size, height: size });
		await page.setContent(
			`<style>html,body{margin:0}svg{display:block;width:100%;height:100%;shape-rendering:crispEdges}</style>${svg}`,
		);
		await page.screenshot({
			path: fileURLToPath(new URL(`${name}.png`, root)),
		});
	}
} finally {
	await browser.close();
}
