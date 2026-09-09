export type PreviewState = {
	id: string;
	url: string;
	busy: boolean;
	error: string;
};
export const emptyPreview = (): PreviewState => ({
	id: "",
	url: "",
	busy: false,
	error: "",
});
export function previewKind(name: string) {
	if (/\.(png|jpe?g|webp|avif|hei[cf])$/i.test(name)) return "image";
	if (/\.pdf$/i.test(name)) return "pdf";
	if (/\.(mp4|mov|mkv|webm)$/i.test(name)) return "video";
	if (/\.(mp3|wav|flac|ogg|m4a|opus)$/i.test(name)) return "audio";
	return undefined;
}
export function previewable(name: string, bytes: number): boolean {
	return (
		!!previewKind(name) &&
		Number.isFinite(bytes) &&
		bytes >= 0 &&
		bytes <= 32 * 1024 * 1024
	);
}
export function previewPresentation(name: string, english: boolean) {
	const kind = previewKind(name);
	if (!kind) return undefined;
	const text = (zh: string, en: string) => (english ? en : zh);
	const copy = {
		image: {
			button: text("预览原图", "Preview input"),
			alt: text("首帧预览", "first-frame preview"),
			caption: text(
				"原图首帧快照 · 最长边 256 像素 · 转换使用原文件",
				"Input snapshot · First frame, up to 256 px · Conversion uses the original",
			),
		},
		pdf: {
			button: text("预览首页", "Preview first page"),
			alt: text("首页预览", "first-page preview"),
			caption: text(
				"PDF 首页快照 · 最长边 256 像素 · 转换仍逐页导出",
				"PDF first page · Up to 256 px · Conversion still exports each page",
			),
		},
		video: {
			button: text("预览首帧", "Preview first frame"),
			alt: text("视频首帧预览", "video first-frame preview"),
			caption: text(
				"视频首帧快照 · 最长边 256 像素 · 开场黑帧会原样显示 · 转换使用原文件",
				"Video first frame · Up to 256 px · A black opening frame is shown as-is · Conversion uses the original",
			),
		},
		audio: {
			button: text("查看封面", "Preview cover"),
			alt: text("音频内嵌封面预览", "embedded audio cover preview"),
			caption: text(
				"音频内嵌封面 · 最长边 256 像素 · 转换使用原文件",
				"Embedded audio cover · Up to 256 px · Conversion uses the original",
			),
		},
	};
	return copy[kind];
}
export function previewBytes(value: unknown): ArrayBuffer {
	if (
		!(value instanceof ArrayBuffer) ||
		value.byteLength < 33 ||
		value.byteLength > 512 * 1024
	)
		throw new Error("Invalid preview payload");
	const bytes = new Uint8Array(value),
		signature = [137, 80, 78, 71, 13, 10, 26, 10];
	if (
		!signature.every((v, i) => bytes[i] === v) ||
		String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
	)
		throw new Error("Preview must be PNG");
	const header = new DataView(value);
	for (const size of [header.getUint32(16), header.getUint32(20)])
		if (size < 1 || size > 256)
			throw new Error("Preview dimensions exceed budget");
	return value;
}
export function createPreview(
	read: (id: string) => Promise<unknown>,
	update: (state: PreviewState) => void,
	urls = {
		create: (data: ArrayBuffer) =>
			URL.createObjectURL(new Blob([data], { type: "image/png" })),
		revoke: (url: string) => URL.revokeObjectURL(url),
	},
) {
	let state = emptyPreview(),
		generation = 0,
		disposed = false;
	function clear() {
		generation++;
		if (state.url) urls.revoke(state.url);
		state = emptyPreview();
		if (!disposed) update(state);
	}
	return {
		clear,
		async open(id: string) {
			if (disposed || state.busy) return;
			clear();
			const current = generation;
			state = { ...emptyPreview(), id, busy: true };
			update(state);
			try {
				const bytes = await read(id);
				if (disposed || generation !== current) return;
				state = {
					id,
					url: urls.create(previewBytes(bytes)),
					busy: false,
					error: "",
				};
			} catch (error) {
				if (disposed || generation !== current) return;
				state = { id, url: "", busy: false, error: String(error) };
			}
			update(state);
		},
		dispose() {
			disposed = true;
			clear();
		},
	};
}
