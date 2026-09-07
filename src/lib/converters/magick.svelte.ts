import { browser, dev } from "$app/environment";
import { error, log } from "$lib/util/logger";
import { m } from "$lib/paraglide/messages";
import { VertFile, type WorkerMessage } from "$lib/types";
import MagickWorker from "$lib/workers/magick?worker&url";
import { Converter, FormatInfo } from "./converter.svelte";
import { imageFormats } from "./magick-automated";
import { Settings } from "$lib/sections/settings/index.svelte";
import magickWasm from "@imagemagick/magick-wasm/magick.wasm?url";
import { ToastManager } from "$lib/util/toast.svelte";
import {
	waitForWorkerMessage,
	WorkerTimeoutError,
} from "$lib/util/worker-message";

import PQueue from "p-queue";
import {
	imageConcurrency,
	imageQuality,
	normalizeImageQuality,
} from "$lib/util/image-quality";

export class MagickConverter extends Converter {
	public name = "imagemagick";
	public readonly processingLocation = "local" as const;
	public ready = $state(false);
	public wasm: ArrayBuffer = null!;

	private activeConversions = new Map<
		string,
		{ worker?: Worker; controller: AbortController }
	>();

	private queue = new PQueue({
		concurrency: browser
			? imageConcurrency(
					navigator.hardwareConcurrency,
					(navigator as Navigator & { deviceMemory?: number })
						.deviceMemory,
				)
			: 2,
	});

	public supportedFormats = [
		// manually tested formats
		new FormatInfo("png", true, true),
		new FormatInfo("jpeg", true, true),
		new FormatInfo("jpg", true, true),
		new FormatInfo("webp", true, true),
		new FormatInfo("gif", true, true),
		new FormatInfo("svg", true, true),
		new FormatInfo("jxl", true, true),
		new FormatInfo("avif", true, true),
		new FormatInfo("heic", true, false), // seems to be unreliable? HEIC/HEIF is very weird if it will actually work
		new FormatInfo("heif", true, false),
		// TODO: .ico files can encode multiple images at various
		// sizes, bitdepths, etc. we should support that in future
		new FormatInfo("ico", true, true),
		new FormatInfo("bmp", true, true),
		new FormatInfo("cur", true, true),
		new FormatInfo("ani", true, false),
		new FormatInfo("icns", true, false),
		new FormatInfo("nef", true, false),
		new FormatInfo("cr2", true, false),
		new FormatInfo("hdr", true, true),
		new FormatInfo("jpe", true, true),
		new FormatInfo("mat", true, true),
		new FormatInfo("pbm", true, true),
		new FormatInfo("pfm", true, true),
		new FormatInfo("pgm", true, true),
		new FormatInfo("pnm", true, true),
		new FormatInfo("ppm", true, true),
		new FormatInfo("tiff", true, true),
		new FormatInfo("jfif", true, true),
		new FormatInfo("eps", false, true),
		new FormatInfo("psd", true, true),

		// raw camera formats
		new FormatInfo("arw", true, false),
		new FormatInfo("tif", true, true),
		new FormatInfo("dng", true, false),
		new FormatInfo("xcf", true, false),
		new FormatInfo("rw2", true, false),
		new FormatInfo("raf", true, false),
		new FormatInfo("orf", true, false),
		new FormatInfo("pef", true, false),
		new FormatInfo("mos", true, false),
		new FormatInfo("raw", true, false),
		new FormatInfo("dcr", true, false),
		new FormatInfo("crw", true, false),
		new FormatInfo("cr3", true, false),
		new FormatInfo("3fr", true, false),
		new FormatInfo("erf", true, false),
		new FormatInfo("mrw", true, false),
		new FormatInfo("mef", true, false),
		new FormatInfo("nrw", true, false),
		new FormatInfo("srw", true, false),
		new FormatInfo("sr2", true, false),
		new FormatInfo("srf", true, false),

		// formats added from maya's somewhat automated testing
		...imageFormats,
	];

	public readonly reportsProgress = false;

	constructor() {
		super();
		log(["converters", this.name], `created converter`);
		if (!browser) return;
		this.initializeWasm();
	}

	private async initializeWasm() {
		try {
			this.status = "downloading";
			// Older service workers cached Vite's unversioned WASM URL. A fresh
			// dev key also bypasses that old controller during its update.
			const wasmUrl = new URL(magickWasm, window.location.href);
			if (dev) wasmUrl.searchParams.set("t", String(Date.now()));
			const response = await fetch(wasmUrl, {
				cache: dev ? "no-store" : "default",
			});
			if (!response.ok) {
				throw new Error(
					`Failed to fetch WASM: ${response.status} ${response.statusText}`,
				);
			}

			this.wasm = await response.arrayBuffer();
			this.status = "ready";
		} catch (err) {
			this.status = "error";
			error(
				["converters", this.name],
				`Failed to load ImageMagick WASM: ${err}`,
			);

			ToastManager.add({
				type: "error",
				message: m["workers.errors.magick"](),
			});
		}
	}

	public async convert(
		input: VertFile,
		to: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		...args: any[]
	): Promise<VertFile> {
		const configured = imageQuality(
			to,
			Settings.instance.settings.magickQualityMode,
			Settings.instance.settings.magickQuality,
		);
		const compression = normalizeImageQuality(args.at(0), configured);
		const controller = new AbortController();
		this.activeConversions.set(input.id, { controller });
		input.conversionPhase = "waiting";
		try {
			return await this.queue.add(
				() =>
					this.convertWithWorker(input, to, compression, controller),
				{ signal: controller.signal },
			);
		} finally {
			if (this.activeConversions.get(input.id)?.controller === controller)
				this.activeConversions.delete(input.id);
		}
	}

	private async convertWithWorker(
		input: VertFile,
		to: string,
		compression: number,
		controller: AbortController,
		statusFile: VertFile = input,
	): Promise<VertFile> {
		controller.signal.throwIfAborted();
		statusFile.conversionPhase = "loading";
		log(
			["converters", this.name],
			`converting ${input.name} to ${to}, quality ${compression}`,
		);

		// handle converting from SVG manually because magick-wasm doesn't support it
		if (input.from === ".svg") {
			try {
				const blob = await this.svgToImage(input, controller.signal);
				if (input.cancelled) throw new Error("Conversion cancelled");
				const pngFile = new VertFile(
					new File([blob], input.name.replace(/\.svg$/i, ".png")),
					input.to,
				);
				// Keep cancellation attached to the original file through SVG rasterization.
				pngFile.id = input.id;
				if (to === ".png") return pngFile; // if target is png, return it directly
				return await this.convertWithWorker(
					pngFile,
					to,
					compression,
					controller,
					statusFile,
				); // otherwise, recursively convert png to user's target format
			} catch (err) {
				error(
					["converters", this.name],
					`SVG conversion failed: ${err}`,
				);
				throw err;
			}
		}

		const worker = new Worker(MagickWorker, {
			type: "module",
		});
		this.activeConversions.set(input.id, { worker, controller });
		const onPhase = (event: MessageEvent<WorkerMessage>) => {
			if (event.data.type === "phase" && !controller.signal.aborted)
				statusFile.conversionPhase = event.data.phase;
		};
		worker.addEventListener("message", onPhase);

		try {
			await waitForWorkerMessage(
				worker,
				"ready",
				controller.signal,
				10000,
			);

			const loadMsg: WorkerMessage = {
				type: "load",
				wasm: this.wasm,
				id: input.id,
			};
			worker.postMessage(loadMsg);

			await waitForWorkerMessage(
				worker,
				"loaded",
				controller.signal,
				30000,
			);

			// every other format handled by magick worker
			const keepMetadata: boolean =
				Settings.instance.settings.metadata ?? true;
			log(["converters", this.name], `keep metadata: ${keepMetadata}`);
			const convertMsg: WorkerMessage = {
				type: "convert",
				id: input.id,
				input: {
					file: input.file,
					name: input.name,
					from: input.from,
					to: input.to,
				},
				to,
				compression,
				keepMetadata,
			};
			worker.postMessage(convertMsg);

			const res = await waitForWorkerMessage(
				worker,
				"finished",
				controller.signal,
				180000,
			);
			if (res.type === "finished") {
				log(
					["converters", this.name],
					`converted ${input.name} to ${to}`,
				);
				return new VertFile(
					new File([res.output as unknown as BlobPart], input.name),
					res.zip ? ".zip" : to,
				);
			}

			if (res.type === "error") {
				throw new Error(res.error);
			}

			throw new Error("Unknown message type");
		} catch (err) {
			if (err instanceof WorkerTimeoutError)
				throw new Error(m["image_conversion.timeout"]());
			throw err;
		} finally {
			worker.removeEventListener("message", onPhase);
			if (this.activeConversions.get(input.id)?.worker === worker) {
				this.activeConversions.delete(input.id);
			}
			worker.terminate();
		}
	}

	public async cancel(input: VertFile): Promise<void> {
		const active = this.activeConversions.get(input.id);
		if (!active) {
			error(
				["converters", this.name],
				`no active conversion found for file ${input.name}`,
			);
			return;
		}

		log(
			["converters", this.name],
			`cancelling conversion for file ${input.name}`,
		);

		active.controller.abort();
		active.worker?.terminate();
		this.activeConversions.delete(input.id);
	}

	private async svgToImage(
		input: VertFile,
		signal: AbortSignal,
	): Promise<Blob> {
		log(["converters", this.name], `converting SVG to image (PNG)`);

		const svgText = await input.file.text();
		const svgBlob = new Blob([svgText], { type: "image/svg+xml" });

		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Failed to get canvas context");

		const img = new Image();

		// try to extract dimensions from SVG, and if not fallback to default
		let width = 512;
		let height = 512;
		const widthMatch = svgText.match(/width=["'](\d+)["']/);
		const heightMatch = svgText.match(/height=["'](\d+)["']/);
		const viewBoxMatch = svgText.match(
			/viewBox=["'][^"']*\s+(\d+)\s+(\d+)["']/,
		);

		if (widthMatch && heightMatch) {
			width = parseInt(widthMatch[1]);
			height = parseInt(heightMatch[1]);
		} else if (viewBoxMatch) {
			width = parseInt(viewBoxMatch[1]);
			height = parseInt(viewBoxMatch[2]);
		}

		signal.throwIfAborted();
		// Allocate only after synchronous setup succeeds; otherwise a missing
		// Canvas context would leave an Object URL outside the cleanup path.
		const svgUrl = URL.createObjectURL(svgBlob);
		return new Promise((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timer);
				signal.removeEventListener("abort", abort);
				img.onload = null;
				img.onerror = null;
				URL.revokeObjectURL(svgUrl);
			};
			const fail = (err: unknown) => {
				cleanup();
				reject(err);
			};
			const abort = () => fail(signal.reason);
			const timer = setTimeout(
				() => fail(new Error(m["image_conversion.timeout"]())),
				30000,
			);
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) {
				abort();
				return;
			}

			img.onload = () => {
				try {
					canvas.width = img.naturalWidth || width;
					canvas.height = img.naturalHeight || height;

					ctx.drawImage(img, 0, 0);

					canvas.toBlob((blob) => {
						cleanup();
						if (blob) {
							resolve(blob);
						} else {
							reject(
								new Error("Failed to convert canvas to Blob"),
							);
						}
					}, "image/png");
				} catch (err) {
					cleanup();
					reject(err);
				}
			};

			img.onerror = () => {
				cleanup();
				reject(new Error("Failed to load SVG image"));
			};

			try {
				img.src = svgUrl;
			} catch (err) {
				fail(err);
			}
		});
	}
}
