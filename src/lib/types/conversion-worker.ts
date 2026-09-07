import { VertFile } from "./file.svelte";

interface ConvertMessage {
	type: "convert";
	input:
		| {
				file: File;
				name: string;
				from: string;
				to: string;
		  }
		| VertFile;
	to: string;
	compression: number | null;
	keepMetadata?: boolean;
}

interface FinishedMessage {
	type: "finished";
	output: ArrayBufferLike | Uint8Array;
	zip?: boolean;
}

interface LoadMessage {
	type: "load";
	wasm: ArrayBuffer;
}

interface LoadedMessage {
	type: "loaded";
}

interface ReadyMessage {
	type: "ready";
}

interface PhaseMessage {
	type: "phase";
	phase: "decoding" | "encoding";
}

interface ErrorMessage {
	type: "error";
	error: string;
}

export type WorkerMessage = (
	| ConvertMessage
	| FinishedMessage
	| LoadMessage
	| LoadedMessage
	| ReadyMessage
	| PhaseMessage
	| ErrorMessage
) & {
	id: string; // unused? rn just using file id, probably meant to be incrementing w/ every message posted?
};
