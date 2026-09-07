import { browser } from "$app/environment";
import { byNative, converters } from "$lib/converters";
import { error, log } from "$lib/util/logger";
import { VertFile } from "$lib/types";
import { parseBlob, selectCover } from "music-metadata";
import { writable } from "svelte/store";
import { addDialog } from "./DialogProvider";
import PQueue from "p-queue";
import { baseLocale, getLocale, setLocale } from "$lib/paraglide/runtime";
import { m } from "$lib/paraglide/messages";
import DOMPurify from "isomorphic-dompurify";
import { ToastManager } from "$lib/util/toast.svelte";
import { GB, DEFAULT_FILENAME_FORMAT } from "$lib/util/consts";
import { inputFormat } from "$lib/util/input-format";
import { batchTargets } from "$lib/util/queue-state";
import { generateMediaThumbnail } from "$lib/util/thumbnail";
import {
	downloadSnapshot,
	zipEntries,
	downloadName,
	saveDownload,
} from "$lib/util/download";

class Files {
	public files = $state<VertFile[]>([]);
	private batch: Promise<void> | null = null;
	public downloading = $state(false);

	public requiredConverters = $derived(
		Array.from(new Set(files.files.map((f) => f.converters).flat())),
	);

	public ready = $derived(
		this.files.length === 0
			? false
			: this.requiredConverters.every((f) => f?.status === "ready") &&
					this.files.every((f) => !f.processing && !f.queued),
	);
	public results = $derived(
		this.files.length === 0 ? false : this.files.every((f) => f.result),
	);

	private thumbnailQueue = new PQueue({
		concurrency: browser
			? Math.min(navigator.hardwareConcurrency || 4, 4)
			: 4,
	});
	private thumbnails = new Map<VertFile, AbortController>();

	private releaseThumbnail(file: VertFile) {
		this.thumbnails.get(file)?.abort();
		this.thumbnails.delete(file);
		if (file.blobUrl?.startsWith("blob:"))
			URL.revokeObjectURL(file.blobUrl);
		file.blobUrl = undefined;
	}

	public async remove(file: VertFile): Promise<void> {
		if (!this.files.includes(file)) return;
		// Invalidate thumbnail work before awaiting conversion cancellation.
		this.releaseThumbnail(file);
		this.files = this.files.filter((candidate) => candidate !== file);
		if (file.processing || file.queued) {
			try {
				await file.cancel();
			} catch (err) {
				error(["files", "cancel"], err);
			}
		}
	}

	public async clear(): Promise<void> {
		await Promise.all(this.files.map((file) => this.remove(file)));
	}

	private _addThumbnail(file: VertFile): void {
		// PDF rendering remains on demand; archives and documents have no preview.
		if ([".pdf", ".zip"].includes(file.from)) return;
		const formats = converters.find(
			(c) => c.name === "ffmpeg",
		)?.supportedFormats;
		const isAudio = !!formats?.some(
			(f) => f.name === file.from && f.isNative,
		);
		const isVideo = !!formats?.some(
			(f) => f.name === file.from && !f.isNative,
		);
		const isImage = file.converters.some((c) => c.name === "imagemagick");
		if (!isAudio && !isVideo && !isImage) return;
		this.releaseThumbnail(file);
		const controller = new AbortController();
		const { signal } = controller;
		this.thumbnails.set(file, controller);
		const current = () =>
			!signal.aborted &&
			this.thumbnails.get(file) === controller &&
			this.files.includes(file);
		void this.thumbnailQueue
			.add(
				async () => {
					if (!current()) return;
					let url: string | undefined;
					if (isAudio) {
						const { common } = await parseBlob(file.file, {
							skipPostHeaders: true,
						});
						if (!current()) return;
						const cover = selectCover(common.picture);
						if (cover) {
							// Copy only the view's bytes, not unrelated ID3 data in its backing buffer.
							url = URL.createObjectURL(
								new Blob([new Uint8Array(cover.data)], {
									type: cover.format,
								}),
							);
						}
					} else {
						url = await generateMediaThumbnail(
							file.file,
							isVideo,
							signal,
						);
					}
					if (current()) file.blobUrl = url;
					else if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
				},
				{ signal },
			)
			.catch((err) => {
				if (!signal.aborted) error(["files", "thumbnail"], err);
			})
			.finally(() => {
				if (this.thumbnails.get(file) === controller)
					this.thumbnails.delete(file);
			});
	}

	private async _handleZipFile(file: File): Promise<void> {
		try {
			log(["files"], `extracting zip file: ${file.name}`);
			ToastManager.add({
				type: "info",
				message: m["convert.archive_file.extracting"]({
					filename: file.name,
				}),
			});

			const { extractZip } = await import("$lib/util/zip");
			const entries = await extractZip(file);

			const totalEntries = entries.length;
			log(["files"], `extracted ${totalEntries} files from zip`);

			// check if all files in zip use the same converter and are compatible
			const convertersUsed = new Set<string>();
			let incompatibleFiles = false;

			for (const { filename } of entries) {
				const format = inputFormat({ name: filename });
				if (!format || format === ".zip") {
					incompatibleFiles = true;
					continue;
				}

				const converter = converters
					.sort(byNative(format))
					.find((c) => c.formatStrings().includes(format));

				if (converter) convertersUsed.add(converter.name);
				else incompatibleFiles = true;
			}

			const converterCount = convertersUsed.size;
			const canConvertAsOne =
				converterCount === 1 &&
				!incompatibleFiles &&
				!convertersUsed.has("pdf");

			log(
				["files"],
				`extracted ${entries.length} files from zip (converters: ${converterCount}, compatible: ${canConvertAsOne})`,
			);

			if (canConvertAsOne) {
				// all files use same converter - add zip as a single VertFile file
				const vf = new VertFile(file, ".zip");
				vf.converters = converters.filter(
					(c) => c.name === Array.from(convertersUsed)[0],
				);

				const converterName = vf.converters[0].name;
				const type =
					converterName === "imagemagick"
						? "image"
						: converterName === "ffmpeg"
							? "audio"
							: ["pandoc", "pdf"].includes(converterName)
								? "doc"
								: "video";

				this.files.push(vf);
				this._addThumbnail(vf);

				ToastManager.add({
					type: "success",
					message: m["convert.archive_file.detected"]({
						type: m[`convert.archive_file.${type}`](),
						filename: file.name,
					}),
				});
			} else {
				// mixed converters/incompatible files - extract all individually
				for (const { filename, data } of entries) {
					this._add(
						new File([new Uint8Array(data)], filename, {
							type: "application/octet-stream",
						}),
					);
				}

				ToastManager.add({
					type: "success",
					message: m["convert.archive_file.extracted"]({
						filename: file.name,
						extract_count: entries.length,
						ignore_count: 0,
					}),
				});
			}
		} catch (e) {
			error(["files"], `error processing zip file: ${e}`);
			throw e;
		}
	}

	private _warningShown = false;
	private async _add(file: VertFile | File) {
		if (file instanceof VertFile) {
			this.files.push(file);
			this._addThumbnail(file);
		} else {
			// if zip, extract and add contents
			const format = inputFormat(file);
			const isZip = format === ".zip";

			if (isZip) {
				try {
					await this._handleZipFile(file);
					return;
				} catch (err) {
					error(["files"], `error extracting zip file: ${err}`);
					ToastManager.add({
						type: "error",
						message: m["convert.archive_file.extract_error"]({
							filename: file.name,
							error: String(err),
						}),
					});
					return;
				}
			}

			// regular files
			const converter = converters
				.sort(byNative(format))
				.find((converter) =>
					converter.formatStrings().includes(format),
				);
			if (!converter) {
				log(["files"], `no converter found for ${file.name}`);
				this.files.push(new VertFile(file, format));
				return;
			}
			const to = converter
				.formatStrings((f) => f.toSupported)
				.find((f) => f !== format);
			if (!to) {
				log(["files"], `no output format found for ${file.name}`);
				return;
			}
			const vf = new VertFile(file, to);
			this.files.push(vf);
			this._addThumbnail(vf);

			const convName = converter.name;
			if (file.size > MAX_ARRAY_BUFFER_SIZE && convName === "vertd") {
				ToastManager.add({
					type: "warning",
					message: m["convert.large_file_warning"]({
						limit: (MAX_ARRAY_BUFFER_SIZE / GB).toFixed(2),
					}),
					durations: {
						stay: 10000,
					},
				});
			}

			const isVideo = convName === "vertd";
			const acceptedExternalWarning =
				localStorage.getItem("acceptedExternalWarning") === "true";
			if (isVideo && !acceptedExternalWarning && !this._warningShown) {
				this._warningShown = true;
				const title = m["convert.external_warning.title"]();
				const message = m["convert.external_warning.text"]();
				const buttons = [
					{
						text: m["convert.external_warning.no"](),
						action: () => {
							for (const file of this.files.filter((f) =>
								f.converters.some((c) => c.name === "vertd"),
							)) {
								void this.remove(file);
							}
							this._warningShown = false;
						},
					},
					{
						text: m["convert.external_warning.yes"](),
						action: () => {
							localStorage.setItem(
								"acceptedExternalWarning",
								"true",
							);
							this._warningShown = false;
						},
					},
				];
				addDialog(title, message, buttons, "warning");
			}
		}
	}

	public add(file: VertFile | null | undefined): void;
	public add(file: File | null | undefined): void;
	public add(file: File[] | null | undefined): void;
	public add(file: VertFile[] | null | undefined): void;
	public add(file: FileList | null | undefined): void;
	public add(
		file:
			| VertFile
			| File
			| VertFile[]
			| File[]
			| FileList
			| null
			| undefined,
	) {
		if (!file) return;
		if (Array.isArray(file) || file instanceof FileList) {
			for (const f of file) {
				this._add(f);
			}
		} else {
			this._add(file);
		}
	}

	public async convertAll(targets: readonly VertFile[] = this.files) {
		if (this.batch) return this.batch;
		const batchFiles = batchTargets(this.files, targets);
		for (const file of batchFiles) file.queued = true;
		const coreCount = navigator.hardwareConcurrency || 4;
		const queue = new PQueue({ concurrency: coreCount });
		this.batch = Promise.all(
			batchFiles.map((file) =>
				queue.add(async () => {
					if (!file.queued || !this.files.includes(file)) {
						file.queued = false;
						return;
					}
					await file.convert();
				}),
			),
		)
			.then(() => {})
			.finally(() => {
				for (const file of batchFiles) file.queued = false;
				this.batch = null;
			});
		return this.batch;
	}

	public async downloadAll() {
		if (this.downloading) return;
		const snapshot = downloadSnapshot(
			this.files.filter((file) => !file.processing && !file.queued),
		);
		if (!snapshot.length) return;
		this.downloading = true;
		try {
			const settings = JSON.parse(
				localStorage.getItem("settings") ?? "{}",
			);
			const filename = downloadName(
				settings.filenameFormat || DEFAULT_FILENAME_FORMAT,
				"Multi",
				".zip",
			);
			const { downloadZip } = await import("client-zip");
			const blob = await downloadZip(zipEntries(snapshot)).blob();
			saveDownload(blob, filename);
		} finally {
			this.downloading = false;
		}
	}
}

export function setTheme(themeTo: "light" | "dark") {
	document.documentElement.classList.remove("light", "dark");
	document.documentElement.classList.add(themeTo);
	localStorage.setItem("theme", themeTo);
	log(["theme"], `set to ${themeTo}`);
	theme.set(themeTo);

	// Lock dark reader if it's set to dark mode
	if (themeTo === "dark") {
		const lock = document.createElement("meta");
		lock.name = "darkreader-lock";
		document.head.appendChild(lock);
	} else {
		const lock = document.querySelector('meta[name="darkreader-lock"]');
		if (lock) lock.remove();
	}
}

export function setEffects(effectsEnabled: boolean) {
	localStorage.setItem("effects", effectsEnabled.toString());
	log(["effects"], `set to ${effectsEnabled}`);
	effects.set(effectsEnabled);
}

export const files = new Files();
export const showGradient = writable(true);
export const gradientColor = writable("");
export const goingLeft = writable(false);
export const dropping = writable(false);
export const vertdLoaded = writable(false);
export const dropdownStates = writable<Record<string, string>>({});

export const isMobile = writable(false);
export const effects = writable(true);
export const theme = writable<"light" | "dark">("light");
// Match the prerendered page until mounting, then remount translated HTML
// when the browser's preferred or saved locale is applied.
export const locale = writable<ReturnType<typeof getLocale>>(baseLocale);
export const availableLocales = {
	en: "English",
	es: "Español",
	fr: "Français",
	de: "Deutsch",
	it: "Italiano",
	ba: "Bosanski",
	hr: "Hrvatski",
	id: "Bahasa Indonesia",
	tr: "Türkçe",
	ja: "日本語",
	ko: "한국어",
	el: "Ελληνικά",
	"zh-Hans": "简体中文",
	"zh-Hant": "繁體中文",
	"pt-BR": "Português (Brasil)",
};

export function updateLocale(newLocale: string = getLocale()) {
	if (!Object.keys(availableLocales).includes(newLocale)) newLocale = "en";

	log(["locale"], `set to ${newLocale}`);
	localStorage.setItem("locale", newLocale);
	document.documentElement.lang = newLocale;
	// @ts-expect-error shush
	setLocale(newLocale, { reload: false });
	// @ts-expect-error shush
	locale.set(newLocale);
}

export function link(
	tag: string | string[],
	text: string,
	links: string | string[],
	newTab?: boolean | boolean[],
	className?: string | string[],
) {
	if (!text) return "";

	const tags = Array.isArray(tag) ? tag : [tag];
	const linksArr = Array.isArray(links) ? links : [links];
	const newTabArr = Array.isArray(newTab) ? newTab : [newTab];
	const classArr = Array.isArray(className) ? className : [className];

	let result = text;

	tags.forEach((t, i) => {
		const link = linksArr[i] ?? "#";
		const target = newTabArr[i]
			? 'target="_blank" rel="noopener noreferrer"'
			: "";
		const cls = classArr[i] ? `class="${classArr[i]}"` : "";

		const regex = new RegExp(`\\[${t}\\](.*?)\\[\\/${t}\\]`, "g");
		result = result.replace(
			regex,
			(_, inner) => `<a href="${link}" ${target} ${cls} >${inner}</a>`,
		);
	});

	return result;
}

export function sanitize(
	html: string,
	allowedTags: string[] = ["a", "b", "code", "br"],
): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: allowedTags,
		ALLOWED_ATTR: ["href", "target", "rel", "class"],
		ALLOWED_URI_REGEXP:
			/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
	});
}

/**
 * Binary search for a max value without knowing the exact value, only that it
 * can be under or over It dose not test every number but instead looks for
 * 1,2,4,8,16,32,64,128,96,95 to figure out that you thought about #96 from
 * 0-infinity
 *
 * @example findFirstPositive(x => matchMedia(`(max-resolution: ${x}dpi)`).matches)
 * @author Jimmy Wärting
 * @see {@link https://stackoverflow.com/a/72124984/1008999}
 * @param {function} f The function to run the test on (should return truthy or falsy values)
 * @param {bigint} [b=1] Where to start looking from
 * @param {function} d privately used to calculate the next value to test
 * @returns {bigint} Integer
 */
function findFirstPositive(
	f: (x: bigint) => number,
	b = 1n,
	d = (e: bigint, g: bigint, c?: bigint): bigint =>
		g < e
			? -1n
			: 0 < f((c = (e + g) >> 1n))
				? c == e || 0 >= f(c - 1n)
					? c
					: d(e, c - 1n)
				: d(c + 1n, g),
): bigint {
	for (; 0 >= f(b); b <<= 1n);
	return d(b >> 1n, b) - 1n;
}

export const getMaxArrayBufferSize = (): number => {
	if (typeof window === "undefined") return 2 * GB; // default for SSR

	// check cache first
	const cached = localStorage.getItem("maxArrayBufferSize");
	if (cached) {
		const parsed = Number(cached);
		log(
			["converters"],
			`using cached max ArrayBuffer size: ${parsed} bytes`,
		);
		if (!isNaN(parsed) && parsed > 0) return parsed;
	}

	// detect max size using binary search
	const maxSize = findFirstPositive((x) => {
		try {
			new ArrayBuffer(Number(x));
			return 0; // false = can allocate
		} catch {
			return 1; // true = cannot allocate
		}
	});

	const result = Number(maxSize);
	localStorage.setItem("maxArrayBufferSize", result.toString());
	log(["converters"], `detected max ArrayBuffer size: ${result} bytes`);

	return result;
};

export const MAX_ARRAY_BUFFER_SIZE = getMaxArrayBufferSize();
