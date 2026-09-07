import { Converter, FormatInfo } from "./converter.svelte";
import { VertFile } from "$lib/types";
import type { PdfRequest, PdfResponse } from "$lib/types/pdf-worker";
import { Settings } from "$lib/sections/settings/index.svelte";
import { imageQuality } from "$lib/util/image-quality";
import { PDF_FORMATS, PDF_LIMITS, isPdfFormat } from "$lib/util/pdf-options";
import {
	waitForWorkerMessage,
	WorkerTimeoutError,
} from "$lib/util/worker-message";
import { m } from "$lib/paraglide/messages";
import PdfWorker from "$lib/workers/pdf?worker&url";
import PQueue from "p-queue";

export class PdfConverter extends Converter {
	public name = "pdf";
	public readonly processingLocation = "local" as const;
	public readonly reportsProgress = true;
	public supportedFormats = [
		new FormatInfo("pdf", true, false),
		...PDF_FORMATS.map(
			(format) => new FormatInfo(format, false, true, false),
		),
	];
	private queue = new PQueue({ concurrency: 1 });
	private active = new Map<
		string,
		{ controller: AbortController; worker?: Worker }
	>();

	constructor() {
		super();
		// Load the PDF engine on first use, not on every visit to the homepage.
		this.status = "ready";
		this.clearTimeout();
	}

	public async convert(input: VertFile, to: string): Promise<VertFile> {
		if (!isPdfFormat(to)) throw new Error("Unsupported PDF output format");
		if (input.file.size > PDF_LIMITS.inputBytes)
			throw new Error(m["pdf_conversion.input_size"]());
		const task: { controller: AbortController; worker?: Worker } = {
			controller: new AbortController(),
		};
		const { signal } = task.controller;
		this.active.set(input.id, task);
		input.conversionPhase = "waiting";
		const settings = Settings.instance.settings;
		const quality = imageQuality(
			to,
			settings.magickQualityMode,
			settings.magickQuality,
		);
		try {
			return await this.queue.add(
				async () => {
					signal.throwIfAborted();
					input.conversionPhase = "loading";
					const worker = (task.worker = new Worker(PdfWorker, {
						type: "module",
					}));
					const progress = ({ data }: MessageEvent<PdfResponse>) => {
						if (data.type !== "progress" || signal.aborted) return;
						input.conversionPhase = "encoding";
						input.pageProgress = {
							current: data.current,
							total: data.total,
						};
						input.progress = Math.round(
							(data.current / data.total) * 100,
						);
					};
					worker.addEventListener("message", progress);
					try {
						await waitForWorkerMessage<PdfResponse>(
							worker,
							"ready",
							signal,
							10000,
						);
						const request: PdfRequest = {
							type: "convert",
							file: input.file,
							to,
							quality,
						};
						// A dedicated worker per task lets cancellation stop synchronous WASM.
						// Listen before posting; preserve typed error codes for translated messages.
						const result = waitForWorkerMessage<PdfResponse>(
							worker,
							undefined,
							signal,
							180000,
						);
						worker.postMessage(request);
						let message = await result;
						while (message.type === "progress") {
							message = await waitForWorkerMessage<PdfResponse>(
								worker,
								undefined,
								signal,
								180000,
							);
						}
						if (message.type === "error") {
							throw new Error(
								message.code
									? m[`pdf_conversion.${message.code}`]()
									: message.error,
							);
						}
						if (message.type !== "finished")
							throw new Error("Unexpected PDF worker response");
						return new VertFile(
							new File([message.output], input.name, {
								type: message.output.type,
							}),
							message.zip ? ".zip" : to,
						);
					} finally {
						worker.removeEventListener("message", progress);
						worker.terminate();
					}
				},
				{ signal },
			);
		} catch (error) {
			if (error instanceof WorkerTimeoutError)
				throw new Error(m["pdf_conversion.timeout"]());
			throw error;
		} finally {
			if (this.active.get(input.id) === task)
				this.active.delete(input.id);
		}
	}

	public async cancel(input: VertFile): Promise<void> {
		const task = this.active.get(input.id);
		task?.controller.abort();
		task?.worker?.terminate();
	}
}
