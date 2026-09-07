import {
	initializeImageMagick,
	MagickFormat,
	MagickImage,
	MagickReadSettings,
} from "@imagemagick/magick-wasm";
import { makeZip } from "client-zip";
import { parseAni } from "$lib/util/parse/ani";
import { parseIcns } from "vert-wasm";
import type { WorkerMessage } from "$lib/types";
import {
	convertImage,
	writeImage,
	readImageCollection,
} from "$lib/util/magick-image";

let magickInitialized = false;

self.postMessage({ type: "ready", id: "0" });

const handleMessage = async (
	message: WorkerMessage,
): Promise<Partial<WorkerMessage>> => {
	switch (message.type) {
		case "load": {
			try {
				if (!message.wasm || !(message.wasm instanceof ArrayBuffer)) {
					throw new Error(
						`Invalid WASM data: ${typeof message.wasm}`,
					);
				}

				const wasmBytes = new Uint8Array(message.wasm);

				await initializeImageMagick(wasmBytes);
				magickInitialized = true;
				return { type: "loaded" };
			} catch (error) {
				return {
					type: "error",
					error: `error loading magick-wasm: ${(error as Error).message}`,
				};
			}
		}
		case "convert": {
			if (!magickInitialized) {
				return { type: "error", error: "magick-wasm not initialized" };
			}

			const compression: number | undefined =
				message.compression ?? undefined;
			const keepMetadata: boolean = message.keepMetadata ?? true;
			if (!message.to.startsWith(".")) message.to = `.${message.to}`;
			message.to = message.to.toLowerCase();
			if (message.to === ".jfif") message.to = ".jpeg";

			let from = message.input.from;
			if (from === ".jfif") from = ".jpeg";
			if (from === ".fit") from = ".fits";

			self.postMessage({
				type: "phase",
				phase: "decoding",
				id: message.id,
			});
			const buffer = await message.input.file.arrayBuffer();

			// special ico handling to split them all into separate images
			if (from === ".ico") {
				const imgs = readImageCollection(new Uint8Array(buffer), from);
				try {
					if (imgs.length === 0) {
						return {
							type: "error",
							error: `Failed to read ICO -- no images found inside?`,
						};
					}

					const convertedImgs: Uint8Array[] = [];
					await Promise.all(
						imgs.map(async (img, i) => {
							const output = await writeImage(
								img,
								message.to,
								keepMetadata,
								compression,
							);
							convertedImgs[i] = output;
						}),
					);

					const zip = makeZip(
						convertedImgs.map(
							(img, i) =>
								new File(
									[new Uint8Array(img)],
									`image${i}.${message.to.slice(1)}`,
								),
						),
						"images.zip",
					);

					// read the ReadableStream to the end
					const zipBytes = await readToEnd(zip.getReader());

					return {
						type: "finished",
						output: zipBytes,
						zip: true,
					};
				} finally {
					imgs.dispose();
				}
			} else if (from === ".ani") {
				console.log("Parsing ANI file");
				const parsedAni = parseAni(new Uint8Array(buffer));
				const files: File[] = [];
				await Promise.all(
					parsedAni.images.map(async (img, i) => {
						const frame = MagickImage.create(
							img,
							new MagickReadSettings({
								format: MagickFormat.Ico,
							}),
						);
						try {
							const blob = writeImage(
								frame,
								message.to,
								keepMetadata,
								compression,
							);
							files[i] = new File(
								[new Uint8Array(blob)],
								`image${i}${message.to}`,
							);
						} finally {
							frame.dispose();
						}
					}),
				);

				const zip = makeZip(files, "images.zip");
				const zipBytes = await readToEnd(zip.getReader());

				return {
					type: "finished",
					output: zipBytes,
					zip: true,
				};
			} else if (from === ".icns") {
				const icns: Uint8Array[] = parseIcns(new Uint8Array(buffer));
				if (typeof icns === "string") {
					return {
						type: "error",
						error: `Failed to read ICNS -- ${icns}`,
					};
				}

				const formats = [
					MagickFormat.Png,
					MagickFormat.Jpeg,
					MagickFormat.Rgba,
					MagickFormat.Rgb,
				];
				const outputs: Uint8Array[] = [];
				for (const file of icns) {
					for (const format of formats) {
						try {
							const img = MagickImage.create(
								file,
								new MagickReadSettings({
									format: format,
								}),
							);
							try {
								outputs.push(
									writeImage(
										img,
										message.to,
										keepMetadata,
										compression,
									),
								);
							} finally {
								img.dispose();
							}

							break;
							// eslint-disable-next-line @typescript-eslint/no-unused-vars
						} catch (_) {
							continue;
						}
					}
				}

				if (!outputs.length)
					throw new Error("No readable images in ICNS file");

				const zip = makeZip(
					outputs.map(
						(img, i) =>
							new File(
								[new Uint8Array(img)],
								`image${i}.${message.to.slice(1)}`,
							),
					),
					"images.zip",
				);
				const zipBytes = await readToEnd(zip.getReader());

				return {
					type: "finished",
					output: zipBytes,
					zip: true,
				};
			}

			const converted = convertImage(
				new Uint8Array(buffer),
				from,
				message.to,
				keepMetadata,
				compression,
				() =>
					self.postMessage({
						type: "phase",
						phase: "encoding",
						id: message.id,
					}),
			);

			return {
				type: "finished",
				output: converted,
			};
		}
		default:
			return {
				type: "error",
				error: `Unknown message type: ${message.type}`,
			};
	}
};

const readToEnd = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
	const chunks: Uint8Array[] = [];
	let done = false;
	while (!done) {
		const { value, done: d } = await reader.read();
		if (value) chunks.push(value);
		done = d;
	}
	const blob = new Blob(
		chunks.map((chunk) => new Uint8Array(chunk)),
		{ type: "application/zip" },
	);
	const arrayBuffer = await blob.arrayBuffer();
	return new Uint8Array(arrayBuffer);
};

onmessage = async (e) => {
	const message = e.data;
	try {
		const res = await handleMessage(message);
		if (!res) return;
		postMessage({
			...res,
			id: message.id,
		});
	} catch (e) {
		postMessage({
			type: "error",
			error: e instanceof Error ? e.message : String(e),
			id: message.id,
		});
	}
};
