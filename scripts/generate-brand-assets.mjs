import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Code-native pixel lettering, kept inside the maskable icon's safe circle.
const glyphs = [
	["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
	["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
];
const pixels = glyphs
	.flatMap((rows, letter) =>
		rows.flatMap((row, y) =>
			[...row].flatMap((value, x) =>
				value === "1"
					? [
							`<rect x="${102 + letter * 168 + x * 28}" y="${158 + y * 28}" width="28" height="28"/>`,
						]
					: [],
			),
		),
	)
	.join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><title>Z8.Work</title><rect width="512" height="512" fill="#086b68"/><g fill="#fffce8">${pixels}</g></svg>\n`;
const directory = new URL("../static/brand/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("logo.svg", directory), svg);
const display = (
	await readFile(
		new URL(
			"../node_modules/@fontsource-variable/pixelify-sans/files/pixelify-sans-latin-wght-normal.woff2",
			import.meta.url,
		),
	)
).toString("base64");
const body = (
	await readFile(
		new URL(
			"../src/lib/assets/font/HostGrotesk-SemiBold.woff2",
			import.meta.url,
		),
	)
).toString("base64");
const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--no-sandbox"],
});
try {
	const page = await browser.newPage({ deviceScaleFactor: 1 });
	for (const [name, size] of [
		["favicon", 64],
		["apple-touch-icon", 180],
		["icon-192", 192],
		["icon-512", 512],
	]) {
		await page.setViewportSize({ width: size, height: size });
		await page.setContent(
			`<style>html,body{margin:0}svg{display:block;width:100%;height:auto}</style>${svg}`,
		);
		await page.screenshot({
			path: new URL(`${name}.png`, directory).pathname,
		});
	}
	await page.setViewportSize({ width: 1200, height: 630 });
	await page.setContent(`<!doctype html><html><head><style>
	@font-face{font-family:Pixel;src:url(data:font/woff2;base64,${display});font-weight:400 700}
	@font-face{font-family:Host;src:url(data:font/woff2;base64,${body});font-weight:600}
	*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#fffce8;color:#171e20;border:6px solid #171e20;font-family:Host,sans-serif;font-weight:600}
	header{height:190px;padding:36px 62px;background:#086b68;color:#fffce8;border-bottom:6px solid #171e20;display:flex;align-items:center;justify-content:space-between}
	h1{font:700 106px/1 Pixel,monospace;margin:0}header span{font-size:25px;letter-spacing:3px}
	main{padding:54px 62px}h2{font-size:57px;letter-spacing:-1.5px;line-height:1.13;margin:0 0 30px}p{font-size:29px;margin:0 0 46px}
	footer{display:flex;align-items:center;justify-content:space-between}strong{font-size:24px;letter-spacing:2px}b{background:#ffb996;padding:14px 22px;border:3px solid #171e20;font-size:25px;box-shadow:5px 5px 0 #171e20}
	</style></head><body><header><h1>Z8.Work</h1><span>FILE CONVERTER</span></header><main><h2>Files stay on your device.</h2><p>Convert and compress in your browser. Zero file uploads.</p><footer><strong>IMAGES / AUDIO / DOCUMENTS</strong><b>z8.work</b></footer></main></body></html>`);
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({
		path: new URL("social-card.png", directory).pathname,
	});
} finally {
	await browser.close();
}
console.log(
	"Generated Z8.Work icons and 1200×630 social card in static/brand/.",
);
