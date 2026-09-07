export const indexedLocales = ["en", "es", "zh-Hans", "zh-Hant"];
export const supportedLocales = [
	"en",
	"es",
	"fr",
	"de",
	"it",
	"ba",
	"hr",
	"tr",
	"ja",
	"ko",
	"el",
	"id",
	"zh-Hans",
	"zh-Hant",
	"pt-BR",
];
export const siteUrl = "https://z8.work";
export const tools = [
	{ slug: "heic-to-jpg", inputs: [".heic", ".heif"], target: ".jpg" },
	{ slug: "png-to-webp", inputs: [".png"], target: ".webp" },
	{ slug: "png-to-avif", inputs: [".png"], target: ".avif" },
	{ slug: "pdf-to-png", inputs: [".pdf"], target: ".png" },
	{ slug: "pdf-to-jpg", inputs: [".pdf"], target: ".jpg" },
	{
		slug: "image-compressor",
		inputs: [".jpg", ".jpeg", ".png", ".webp", ".avif", ".tiff", ".tif"],
		target: ".webp",
	},
];
export const indexablePaths = [
	"/",
	"/about/",
	"/privacy/",
	"/environment/",
	"/acknowledgements/",
	...tools.map((tool) => `/tools/${tool.slug}/`),
];
export const pagePaths = [...indexablePaths, "/convert/", "/settings/"];

/** @param {string} pathname */
export function localeFromPath(pathname) {
	const segment = pathname.split("/")[1];
	return supportedLocales.includes(segment) ? segment : "en";
}

/** @param {string} pathname */
export function unlocalizedPath(pathname) {
	const segments = pathname.split("/");
	if (supportedLocales.includes(segments[1])) segments.splice(1, 1);
	return segments.join("/") || "/";
}

/** @param {string} path @param {string} locale */
export function localePath(path, locale) {
	const normalized = unlocalizedPath(path);
	return locale === "en" ? normalized : `/${locale}${normalized}`;
}

/** @param {string} pathname */
export function toolForPath(pathname) {
	const path = unlocalizedPath(pathname).replace(/\/$/, "");
	return tools.find((tool) => path === `/tools/${tool.slug}`);
}
