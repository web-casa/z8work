import { VertFile, type WorkerMessage } from "$lib/types";
import { Converter, FormatInfo } from "./converter.svelte";
import { browser } from "$app/environment";
import PandocWorker from "$lib/workers/pandoc?worker&url";
import { error, log } from "$lib/util/logger";
import { ToastManager } from "$lib/util/toast.svelte";
import { m } from "$lib/paraglide/messages";
import { waitForWorkerMessage } from "$lib/util/worker-message";

type PandocResponse =
	| { type: "finished"; output: Uint8Array<ArrayBuffer>; isZip?: boolean }
	| { type: "error"; error: unknown; errorKind?: string };

export class PandocConverter extends Converter {
	public name = "pandoc";
	public readonly processingLocation = "local" as const;
	public ready = $state(false);
	public wasm: ArrayBuffer = null!;

	private activeConversions = new Map<
		string,
		{ worker: Worker; controller: AbortController }
	>();

	constructor() {
		super();
		if (!browser) return;
		(async () => {
			try {
				this.status = "downloading";
				this.wasm = await fetch("/pandoc.wasm").then((r) =>
					r.arrayBuffer(),
				);

				this.status = "ready";
			} catch (err) {
				this.status = "error";
				error(
					["converters", this.name],
					`Failed to load Pandoc worker: ${err}`,
				);
				ToastManager.add({
					type: "error",
					message: m["workers.errors.pandoc"](),
				});
			}
		})();
	}

	public async convert(file: VertFile, to: string): Promise<VertFile> {
		const worker = new Worker(PandocWorker, {
			type: "module",
		});

		const controller = new AbortController();
		this.activeConversions.set(file.id, { worker, controller });
		try {
			const loadMsg: WorkerMessage = {
				type: "load",
				wasm: this.wasm,
				id: file.id,
			};
			worker.postMessage(loadMsg);
			await waitForWorkerMessage(
				worker,
				"loaded",
				controller.signal,
				30000,
			);
			const convertMsg: WorkerMessage = {
				type: "convert",
				to,
				input: {
					file: file.file,
					name: file.name,
					from: file.from,
					to,
				},
				compression: null,
				id: file.id,
			};
			worker.postMessage(convertMsg);
			const result = await waitForWorkerMessage<PandocResponse>(
				worker,
				undefined,
				controller.signal,
			);
			if (result.type === "error") {
				worker.terminate();
				// throw new Error(result.error);
				const error = String(result.error);
				switch (result.errorKind) {
					case "PandocUnknownReaderError": {
						throw new Error(
							`${file.from} is not a supported input format for documents.`,
						);
					}

					case "PandocUnknownWriterError": {
						throw new Error(
							`${to} is not a supported output format for documents.`,
						);
					}

					case "PandocParseError": {
						if (error.includes("JSON missing pandoc-api-version")) {
							throw new Error(
								`This JSON file is not a pandoc-converted JSON file. It must be converted with pandoc / VERT to be converted again.`,
							);
						}
					}

					// eslint-disable-next-line no-fallthrough
					default:
						if (result.errorKind)
							throw new Error(
								`[${result.errorKind}] ${result.error}`,
							);
						else throw new Error(String(result.error));
				}
			}

			if (!to.startsWith(".")) to = `.${to}`;

			return new VertFile(
				new File([result.output], file.name),
				result.isZip ? ".zip" : to,
			);
		} finally {
			if (this.activeConversions.get(file.id)?.worker === worker)
				this.activeConversions.delete(file.id);
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
		active.worker.terminate();
		this.activeConversions.delete(input.id);
	}

	public supportedFormats = [
		new FormatInfo("docx", true, true),
		new FormatInfo("doc", true, true),
		new FormatInfo("md", true, true),
		new FormatInfo("html", true, true),
		new FormatInfo("rtf", true, true),
		new FormatInfo("csv", true, true),
		new FormatInfo("tsv", true, true),
		new FormatInfo("json", true, true), // must be a pandoc-converted json
		new FormatInfo("rst", true, true),
		new FormatInfo("epub", true, true),
		new FormatInfo("odt", true, true),
		new FormatInfo("docbook", true, true),
	];
}
