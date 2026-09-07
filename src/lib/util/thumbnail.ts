/** A thumbnail owns its temporary media URL until loading and drawing finish. */
export async function generateMediaThumbnail(
	file: File,
	isVideo: boolean,
	signal: AbortSignal,
): Promise<string | undefined> {
	signal.throwIfAborted();
	const media = isVideo ? document.createElement("video") : new Image();
	const url = URL.createObjectURL(file);
	try {
		await new Promise<void>((resolve, reject) => {
			const finish = (error?: unknown) => {
				clearTimeout(timer);
				signal.removeEventListener("abort", abort);
				media.removeEventListener("load", loaded);
				media.removeEventListener("loadeddata", loaded);
				media.removeEventListener("error", failed);
				if (error) reject(error);
				else resolve();
			};
			const abort = () => finish(signal.reason);
			const failed = () => finish(new Error("Thumbnail decoding failed"));
			// The first decoded frame avoids extra seek/decoder work for a preview.
			const loaded = () => finish();
			const timer = setTimeout(
				() => finish(new Error("Thumbnail loading timed out")),
				15000,
			);
			signal.addEventListener("abort", abort, { once: true });
			media.addEventListener(isVideo ? "loadeddata" : "load", loaded);
			media.addEventListener("error", failed);
			try {
				signal.throwIfAborted();
				media.src = url;
			} catch (error) {
				finish(error);
			}
		});
		signal.throwIfAborted();
		const width = isVideo
			? (media as HTMLVideoElement).videoWidth
			: (media as HTMLImageElement).naturalWidth;
		const height = isVideo
			? (media as HTMLVideoElement).videoHeight
			: (media as HTMLImageElement).naturalHeight;
		if (!Number.isFinite(width * height) || width <= 0 || height <= 0)
			return;
		const canvas = document.createElement("canvas");
		// Bound both dimensions, including very tall or wide images.
		const scale = Math.min(1, 180 / width, 180 / height);
		canvas.width = Math.max(1, Math.round(width * scale));
		canvas.height = Math.max(1, Math.round(height * scale));
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
		const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
		for (let index = 3; index < data.length; index += 4) {
			if (data[index] !== 0) return canvas.toDataURL();
		}
		return;
	} finally {
		// Release the URL even when loading, drawing or encoding fails.
		URL.revokeObjectURL(url);
		media.removeAttribute("src");
		if (isVideo) {
			(media as HTMLVideoElement).pause();
			(media as HTMLVideoElement).load();
		}
	}
}
