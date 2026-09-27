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

/**
 * Tool landing pages. `inputs` are the extensions preselected on this page and
 * `target` is the preselected output; both must be formats the browser
 * converters really support, otherwise the page would be a doorway shell.
 * `group` drives related-link sections, not user-visible categories.
 */
export const tools = [
	{
		slug: "heic-to-jpg",
		inputs: [".heic", ".heif"],
		target: ".jpg",
		group: "image",
	},
	{ slug: "png-to-webp", inputs: [".png"], target: ".webp", group: "image" },
	{ slug: "png-to-avif", inputs: [".png"], target: ".avif", group: "image" },
	{ slug: "pdf-to-png", inputs: [".pdf"], target: ".png", group: "pdf" },
	{ slug: "pdf-to-jpg", inputs: [".pdf"], target: ".jpg", group: "pdf" },
	{
		slug: "image-compressor",
		inputs: [".jpg", ".jpeg", ".png", ".webp", ".avif", ".tiff", ".tif"],
		target: ".webp",
		group: "image",
	},
	{ slug: "webp-to-png", inputs: [".webp"], target: ".png", group: "image" },
	{
		slug: "jpg-to-png",
		inputs: [".jpg", ".jpeg"],
		target: ".png",
		group: "image",
	},
	{ slug: "png-to-jpg", inputs: [".png"], target: ".jpg", group: "image" },
	{ slug: "webp-to-jpg", inputs: [".webp"], target: ".jpg", group: "image" },
	{
		slug: "heic-to-png",
		inputs: [".heic", ".heif"],
		target: ".png",
		group: "image",
	},
	{ slug: "svg-to-png", inputs: [".svg"], target: ".png", group: "image" },
	{ slug: "wav-to-mp3", inputs: [".wav"], target: ".mp3", group: "audio" },
	{ slug: "mp3-to-wav", inputs: [".mp3"], target: ".wav", group: "audio" },
	{ slug: "m4a-to-mp3", inputs: [".m4a"], target: ".mp3", group: "audio" },
	{ slug: "mp3-to-m4a", inputs: [".mp3"], target: ".m4a", group: "audio" },
	{ slug: "flac-to-mp3", inputs: [".flac"], target: ".mp3", group: "audio" },
	{ slug: "opus-to-mp3", inputs: [".opus"], target: ".mp3", group: "audio" },
	{
		slug: "aiff-to-mp3",
		inputs: [".aiff", ".aif", ".aifc"],
		target: ".mp3",
		group: "audio",
	},
	{ slug: "wma-to-mp3", inputs: [".wma"], target: ".mp3", group: "audio" },
	{
		slug: "mp4-to-mp3",
		inputs: [".mp4", ".m4v"],
		target: ".mp3",
		group: "video",
	},
	{ slug: "webm-to-mp3", inputs: [".webm"], target: ".mp3", group: "video" },
	{ slug: "mov-to-mp3", inputs: [".mov"], target: ".mp3", group: "video" },
	{ slug: "docx-to-md", inputs: [".docx"], target: ".md", group: "doc" },
	{ slug: "md-to-docx", inputs: [".md"], target: ".docx", group: "doc" },
	{
		slug: "epub-to-docx",
		inputs: [".epub"],
		target: ".docx",
		group: "doc",
	},
	{ slug: "m4a-to-wav", inputs: [".m4a"], target: ".wav", group: "audio" },
	{ slug: "wav-to-flac", inputs: [".wav"], target: ".flac", group: "audio" },
	{ slug: "mp3-to-flac", inputs: [".mp3"], target: ".flac", group: "audio" },
	{ slug: "aac-to-mp3", inputs: [".aac"], target: ".mp3", group: "audio" },
	{ slug: "mp3-to-aac", inputs: [".mp3"], target: ".aac", group: "audio" },
	{ slug: "ogg-to-mp3", inputs: [".ogg"], target: ".mp3", group: "audio" },
	{ slug: "m4b-to-mp3", inputs: [".m4b"], target: ".mp3", group: "audio" },
	{ slug: "amr-to-mp3", inputs: [".amr"], target: ".mp3", group: "audio" },
	{ slug: "ac3-to-mp3", inputs: [".ac3"], target: ".mp3", group: "audio" },
	{ slug: "opus-to-wav", inputs: [".opus"], target: ".wav", group: "audio" },
	{ slug: "mkv-to-mp3", inputs: [".mkv"], target: ".mp3", group: "video" },
	{ slug: "avi-to-mp3", inputs: [".avi"], target: ".mp3", group: "video" },
	{ slug: "wmv-to-mp3", inputs: [".wmv"], target: ".mp3", group: "video" },
	{ slug: "flv-to-mp3", inputs: [".flv"], target: ".mp3", group: "video" },
	{
		slug: "mp4-to-wav",
		inputs: [".mp4", ".m4v"],
		target: ".wav",
		group: "video",
	},
	{ slug: "avif-to-png", inputs: [".avif"], target: ".png", group: "image" },
	{ slug: "avif-to-jpg", inputs: [".avif"], target: ".jpg", group: "image" },
	{
		slug: "tiff-to-jpg",
		inputs: [".tiff", ".tif"],
		target: ".jpg",
		group: "image",
	},
	{
		slug: "tiff-to-png",
		inputs: [".tiff", ".tif"],
		target: ".png",
		group: "image",
	},
	{ slug: "psd-to-png", inputs: [".psd"], target: ".png", group: "image" },
	{ slug: "psd-to-jpg", inputs: [".psd"], target: ".jpg", group: "image" },
	{ slug: "ico-to-png", inputs: [".ico"], target: ".png", group: "image" },
	{ slug: "bmp-to-jpg", inputs: [".bmp"], target: ".jpg", group: "image" },
	{ slug: "html-to-md", inputs: [".html"], target: ".md", group: "doc" },
	{ slug: "md-to-html", inputs: [".md"], target: ".html", group: "doc" },
	{ slug: "docx-to-html", inputs: [".docx"], target: ".html", group: "doc" },
	{ slug: "rtf-to-docx", inputs: [".rtf"], target: ".docx", group: "doc" },
	{ slug: "odt-to-docx", inputs: [".odt"], target: ".docx", group: "doc" },
	{ slug: "epub-to-md", inputs: [".epub"], target: ".md", group: "doc" },
	{ slug: "mp3-to-ogg", inputs: [".mp3"], target: ".ogg", group: "audio" },
	{
		slug: "jpg-to-webp",
		inputs: [".jpg", ".jpeg"],
		target: ".webp",
		group: "image",
	},
	{ slug: "png-to-ico", inputs: [".png"], target: ".ico", group: "image" },
	{
		slug: "jpg-to-ico",
		inputs: [".jpg", ".jpeg"],
		target: ".ico",
		group: "image",
	},
	{ slug: "gif-to-png", inputs: [".gif"], target: ".png", group: "image" },
	{ slug: "gif-to-jpg", inputs: [".gif"], target: ".jpg", group: "image" },
	// Same-format compressors: the preset intentionally keeps the input format;
	// the page's value is a smaller file at a quality the user chooses.
	{ slug: "compress-png", inputs: [".png"], target: ".png", group: "image" },
	{
		slug: "compress-jpeg",
		inputs: [".jpg", ".jpeg"],
		target: ".jpg",
		group: "image",
	},
	{
		slug: "mp3-compressor",
		inputs: [".mp3"],
		target: ".mp3",
		group: "audio",
	},
];

/**
 * Hub pages: one page per popular format linking every conversion into and out
 * of that format, or a group hub (linksFromGroup) collecting one tool group.
 * Hubs carry no inputs/target preset; the embedded workspace stays
 * unpreselected.
 */
export const hubs = [
	{ slug: "png-converter", format: ".png", group: "image" },
	{ slug: "jpg-converter", format: ".jpg", group: "image" },
	{ slug: "webp-converter", format: ".webp", group: "image" },
	{ slug: "heic-converter", format: ".heic", group: "image" },
	{ slug: "ico-converter", format: ".ico", group: "image" },
	{ slug: "mp3-converter", format: ".mp3", group: "audio" },
	{ slug: "wav-converter", format: ".wav", group: "audio" },
	{ slug: "flac-converter", format: ".flac", group: "audio" },
	{ slug: "docx-converter", format: ".docx", group: "doc" },
	{
		slug: "audio-extractor",
		linksFromGroup: "video",
		group: "video",
	},
];

export const indexablePaths = [
	"/",
	"/tools/",
	"/about/",
	"/privacy/",
	"/environment/",
	"/acknowledgements/",
	...tools.map((tool) => `/tools/${tool.slug}/`),
	...hubs.map((hub) => `/tools/${hub.slug}/`),
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
	return (
		tools.find((tool) => path === `/tools/${tool.slug}`) ??
		hubs.find((hub) => path === `/tools/${hub.slug}`)
	);
}

/** Display name for a dotted extension, e.g. ".jpg" → "JPG". */
/** @param {string} format */
export function formatName(format) {
	return format.replace(/^\./, "").toUpperCase();
}

/** Display order of conversion groups across picker and directory pages. */
export const groupOrder = ["image", "video", "audio", "doc", "pdf"];

// Extension aliases collapse to one canonical picker format: they always map
// to the same tool pages (.jpg/.jpeg, .heic/.heif, ...).
/** @type {Record<string, string>} */
const formatAliases = {
	".heif": ".heic",
	".jpeg": ".jpg",
	".tif": ".tiff",
	".aif": ".aiff",
	".aifc": ".aiff",
	".m4v": ".mp4",
};

/**
 * @typedef {{ format: string, group: string, targets: { format: string, slug: string }[] }} PickerEntry
 */

/**
 * Picker data: one entry per canonical source format with the tool pages it
 * can reach, grouped for optgroup rendering. Only real tool pairs appear, so
 * every from/to combination navigates to an existing page.
 *
 * @returns {PickerEntry[]}
 */
export function pickerEntries() {
	/** @type {Map<string, PickerEntry>} */
	const byFormat = new Map();
	for (const tool of tools) {
		for (const input of tool.inputs) {
			const format = formatAliases[input] ?? input;
			let entry = byFormat.get(format);
			if (!entry) {
				entry = { format, group: tool.group, targets: [] };
				byFormat.set(format, entry);
			}
			// One target per output format: the earlier (more specific) pair page
			// wins over catch-all tools such as the compressor. Same-format
			// targets (compressors) stay out of the picker; they are not
			// format conversions.
			if (
				tool.target !== format &&
				!entry.targets.some((target) => target.format === tool.target)
			) {
				entry.targets.push({
					format: tool.target,
					slug: tool.slug,
				});
			}
		}
	}
	for (const entry of byFormat.values()) {
		entry.targets.sort((a, b) => a.format.localeCompare(b.format));
	}
	return [...byFormat.values()].sort(
		(a, b) =>
			groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) ||
			a.format.localeCompare(b.format),
	);
}

/**
 * Links for a hub page. Format hubs list every conversion out of and into
 * their format; group hubs list the whole tool group as outgoing links.
 * @param {{ format?: string, linksFromGroup?: string }} hub
 */
export function hubLinks(hub) {
	const format = hub.format;
	if (format) {
		return {
			from: tools.filter((tool) => tool.inputs.includes(format)),
			to: tools.filter((tool) => tool.target === format),
		};
	}
	return {
		from: tools.filter((tool) => tool.group === hub.linksFromGroup),
		to: [],
	};
}

/**
 * Related links for a pair page: same source first, then the reverse
 * direction, then the rest of the group. Hubs matching either end of the pair
 * come back separately so pages can surface them as format guides.
 * @param {string} slug
 */
export function relatedForTool(slug) {
	const tool = tools.find((tool) => tool.slug === slug);
	if (!tool) return { pairs: [], hubs: [] };
	const inputs = new Set(tool.inputs);
	const seen = new Set([slug]);
	const sameSource = [];
	const reverse = [];
	const sameGroup = [];
	for (const other of tools) {
		if (seen.has(other.slug)) continue;
		if (other.inputs.some((input) => inputs.has(input))) {
			sameSource.push(other);
			seen.add(other.slug);
		}
	}
	for (const other of tools) {
		if (seen.has(other.slug)) continue;
		if (
			tool.inputs.includes(other.target) &&
			other.inputs.includes(tool.target)
		) {
			reverse.push(other);
			seen.add(other.slug);
		}
	}
	for (const other of tools) {
		if (seen.has(other.slug)) continue;
		if (other.group === tool.group) {
			sameGroup.push(other);
			seen.add(other.slug);
		}
	}
	const matchingHubs = hubs.filter(
		(hub) =>
			(hub.format !== undefined &&
				(inputs.has(hub.format) || hub.format === tool.target)) ||
			hub.linksFromGroup === tool.group,
	);
	return {
		pairs: [...sameSource, ...reverse, ...sameGroup].slice(0, 9),
		hubs: matchingHubs,
	};
}
