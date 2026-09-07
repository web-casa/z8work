import { byNative, converters } from "$lib/converters";
import { converterSupports } from "$lib/util/output-formats";
import { inputFormat, normalizedInputName } from "$lib/util/input-format";
import {
	downloadSnapshot,
	downloadName,
	saveDownload,
} from "$lib/util/download";
import type { Converter } from "$lib/converters/converter.svelte";
import { m } from "$lib/paraglide/messages";
import { DEFAULT_FILENAME_FORMAT } from "$lib/util/consts";
import { ToastManager } from "$lib/util/toast.svelte";
import type { Component } from "svelte";
import { MAX_ARRAY_BUFFER_SIZE } from "$lib/store/index.svelte";

export class VertFile {
	public id: string = Math.random().toString(36).slice(2, 8);
	public readonly file: File;

	public get from() {
		return inputFormat(this.file);
	}

	public get name() {
		return this.file.name;
	}

	public progress = $state(0);
	public pageProgress = $state<{ current: number; total: number } | null>(
		null,
	);
	public result = $state<VertFile | null>(null);

	public to = $state("");
	public targetChosen = false;

	public blobUrl = $state<string>();

	public processing = $state(false);

	public cancelled = $state(false);
	public queued = $state(false);
	public failed = $state(false);
	public errorMessage = $state("");
	public conversionPhase = $state<
		"waiting" | "loading" | "decoding" | "encoding" | null
	>(null);
	private conversionVersion = 0;
	private archiveConversions = new Map<number, Set<VertFile>>();

	public converters: Converter[] = [];

	public isZip = $state(() => this.from === ".zip");

	public findConverters(supportedFormats: string[] = [this.from]) {
		const converter = this.converters
			.filter((converter) =>
				converter
					.formatStrings()
					.map((f) => supportedFormats.includes(f)),
			)
			.sort(byNative(this.from));
		return converter;
	}

	public findConverter() {
		// zip will always only be added if there's one converter that supports all files - handled in store's _handleZipFile()
		if (this.isZip()) return this.converters[0];

		const converter = this.converters.find((converter) =>
			converterSupports(converter, this.from, this.to),
		);
		return converter;
	}

	public isLarge(): boolean {
		return this.file.size > MAX_ARRAY_BUFFER_SIZE;
	}

	public supportsStreaming(): boolean {
		// only vertd (video/gif -> video/gif) supports streaming
		// rest of converters need entire file in memory, limited by ArrayBuffer limits
		const converter = this.findConverter();
		return converter?.name === "vertd";
	}

	constructor(file: File, to: string, blobUrl?: string) {
		const newFile = new File(
			[file.slice(0, file.size, file.type)],
			normalizedInputName(file.name),
			{ type: file.type, lastModified: file.lastModified },
		);
		this.file = newFile;
		this.to = to.startsWith(".") ? to : `.${to}`;
		const matching = converters.filter((c) =>
			c.formatStrings().includes(this.from),
		);
		const readers = matching.filter((c) =>
			c.supportedFormats.some(
				(f) => f.name === this.from && f.fromSupported,
			),
		);
		// Output-only formats remain identifiable for the existing error message.
		// PDF image writers must not become candidate readers for ordinary images.
		this.converters = readers.length ? readers : matching;
		this.convert = this.convert.bind(this);
		this.download = this.download.bind(this);
		this.blobUrl = blobUrl;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async convert(...args: any[]) {
		if (this.processing) return;
		const version = ++this.conversionVersion;
		this.queued = false;
		this.result = null;
		this.progress = 0;
		this.pageProgress = null;
		this.processing = true;
		this.cancelled = false;
		this.failed = false;
		this.errorMessage = "";
		this.conversionPhase = null;
		let res;
		try {
			const converter = this.findConverter();
			if (!converter) throw new Error("No converter found");
			// for zips: extract > convert each > re-zip
			// else convert normally
			res = this.isZip()
				? await this.convertZip(converter, version)
				: await converter.convert(this, this.to, ...args);
			if (version === this.conversionVersion && !this.cancelled)
				this.result = res;
		} catch (err) {
			if (version === this.conversionVersion && !this.cancelled) {
				this.failed = true;
				this.errorMessage =
					err instanceof Error
						? err.message
						: typeof err === "string"
							? err
							: "";
				this.toastErr(err);
			}
			if (version === this.conversionVersion) this.result = null;
		} finally {
			if (version === this.conversionVersion) {
				this.processing = false;
				this.conversionPhase = null;
			}
		}
		return res;
	}

	private async convertZip(
		converter: Converter,
		version: number,
	): Promise<VertFile> {
		const activeFiles = new Set<VertFile>();
		this.archiveConversions.set(version, activeFiles);
		try {
			return await this.convertZipEntries(
				converter,
				version,
				activeFiles,
			);
		} finally {
			this.archiveConversions.delete(version);
		}
	}

	private async convertZipEntries(
		converter: Converter,
		version: number,
		activeFiles: Set<VertFile>,
	): Promise<VertFile> {
		const cancelled = () =>
			this.cancelled || version !== this.conversionVersion;
		const target = this.to;
		const { extractZip, createZip } = await import("$lib/util/zip");
		const { default: PQueue } = await import("p-queue");

		const entries = await extractZip(this.file);
		const totalFiles = entries.length;
		const fileProgress: number[] = new Array(totalFiles).fill(0);
		const convertedFiles: File[] = [];

		const queue = new PQueue({
			concurrency: navigator.hardwareConcurrency || 4,
		});

		const updateProgress = () => {
			if (cancelled()) return;
			const totalProgress = fileProgress.reduce((sum, p) => sum + p, 0);
			this.progress = Math.round(totalProgress / totalFiles);
		};

		// convert all files in the zip
		await queue.addAll(
			entries.map(({ filename, data }, index) => async () => {
				if (cancelled()) {
					throw new Error("Conversion cancelled");
				}

				const file = new File([new Uint8Array(data)], filename, {
					type: "application/octet-stream",
				});
				const tempVFile = new VertFile(file, target);
				tempVFile.converters = [converter];
				activeFiles.add(tempVFile);
				const progressInterval = converter.reportsProgress
					? setInterval(() => {
							fileProgress[index] = tempVFile.progress;
							updateProgress();
						}, 100)
					: undefined;
				try {
					const converted = await converter.convert(
						tempVFile,
						target,
					);
					if (cancelled()) throw new Error("Conversion cancelled");
					const outputExt = converted.to.startsWith(".")
						? converted.to
						: `.${converted.to}`;
					convertedFiles[index] = new File(
						[await converted.file.arrayBuffer()],
						converted.name.replace(/\.[^/.]+$/, outputExt),
					);
					fileProgress[index] = 100;
					updateProgress();
				} finally {
					clearInterval(progressInterval);
					activeFiles.delete(tempVFile);
				}
			}),
		);

		// return zip of converted files
		if (cancelled()) throw new Error("Conversion cancelled");
		const resultArray = await createZip(convertedFiles);
		const outputFilename = this.file.name.replace(/\.[^/.]+$/, ".zip");
		const resultFile = new File(
			[new Uint8Array(resultArray)],
			outputFilename,
		);
		return new VertFile(resultFile, ".zip");
	}

	public async cancel() {
		if (this.queued) {
			this.queued = false;
			this.cancelled = true;
			return;
		}
		if (!this.processing) return;
		const version = this.conversionVersion;
		const converter = this.findConverter();
		if (!converter) throw new Error("No converter found");
		this.cancelled = true;
		try {
			if (this.isZip()) {
				await Promise.all(
					Array.from(
						this.archiveConversions.get(version) ?? [],
						(file) => {
							file.cancelled = true;
							return converter.cancel(file);
						},
					),
				);
			} else {
				await converter.cancel(this);
			}
			if (version === this.conversionVersion) {
				this.processing = false;
				this.result = null;
			}
		} catch (err) {
			this.toastErr(err);
		}
	}

	private toastErr(err: unknown) {
		type ToastMsg = {
			component: Component;
			additional: unknown;
		};

		const castedErr = err as Error | string | ToastMsg;
		let toastMsg: string | ToastMsg = "";
		if (typeof castedErr === "string") {
			toastMsg = castedErr;
		} else if (castedErr instanceof Error) {
			toastMsg = castedErr.message;
		} else {
			toastMsg = castedErr;
		}

		// ToastManager.add({
		// 	type: "error",
		// 	message:
		// 		typeof toastMsg === "string"
		// 			? m["workers.errors.general"]({
		// 					file: this.file.name,
		// 					message: toastMsg,
		// 				})
		// 			: toastMsg,
		// });

		if (typeof toastMsg === "string") {
			ToastManager.add({
				type: "error",
				message:
					this.failed && this.errorMessage
						? m["workspace.conversion_failed"]({
								name:
									[...this.file.name].length > 60
										? [...this.file.name]
												.slice(0, 57)
												.join("") + "…"
										: this.file.name,
							})
						: m["workers.errors.general"]({
								file: this.file.name,
								message: toastMsg,
							}),
			});
		} else {
			ToastManager.add({
				type: "error",
				message: toastMsg.component,
				additional: toastMsg.additional,
			});
		}
	}

	public setTarget(to: string) {
		this.targetChosen = true;
		if (this.processing || this.queued || this.to === to) return;
		this.to = to;
		this.pageProgress = null;
		this.result = null;
		this.failed = false;
		this.cancelled = false;
		this.errorMessage = "";
		this.conversionPhase = null;
	}

	public async download() {
		const [snapshot] = downloadSnapshot([this]);
		if (!snapshot) throw new Error("No result found");
		const settings = JSON.parse(localStorage.getItem("settings") ?? "{}");
		const name = downloadName(
			settings.filenameFormat || DEFAULT_FILENAME_FORMAT,
			snapshot.originalName,
			snapshot.to,
		);
		saveDownload(snapshot.input, name);
	}

	public hash(): Promise<string> {
		const stream = this.file.stream();
		const hashes = new Set<string>();
		const reader = stream.getReader();
		return new Promise<string>((resolve, reject) => {
			function processChunk() {
				reader.read().then(({ done, value }) => {
					if (done) {
						const combinedHash = Array.from(hashes).sort().join("");
						resolve(combinedHash);
						return;
					}

					crypto.subtle
						.digest("SHA-256", value)
						.then((hashBuffer) => {
							const hashArray = Array.from(
								new Uint8Array(hashBuffer),
							);
							const hashHex = hashArray
								.map((b) => b.toString(16).padStart(2, "0"))
								.join("");
							hashes.add(hashHex);
							processChunk();
						})
						.catch((err) => {
							reject(err);
						});
				});
			}
			processChunk();
		});
	}
}

export interface Categories {
	[key: string]: {
		formats: string[];
		canConvertTo?: string[];
	};
}
