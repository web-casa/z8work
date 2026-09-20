import scope from "../../../packaging/desktop/v1-scope.json" with { type: "json" };
import { estimateStorage } from "../../../src/lib/util/environmental-impact.ts";
import type { Task } from "./queue-contract.ts";

export function localRoute(task: Task): boolean {
	const extension = task.name.split(".").pop()?.toLowerCase() ?? "";
	return scope.groups.some(
		(g) => g.inputs.includes(extension) && g.outputs.includes(task.format),
	);
}
// Explicit backend capability plus frozen route coverage, not network telemetry.
export function localProcessing(
	location: unknown,
	tasks: readonly Task[],
): boolean {
	return location === "device-v1" && tasks.every(localRoute);
}
export function summarizeSavedImages(
	tasks: readonly Task[],
	location: unknown,
) {
	let count = 0;
	let savedBytes = 0;
	// A newer occurrence replaces a stale saved event, including a running retry.
	const latest = new Map(tasks.map((task) => [task.id, task]));
	const images = scope.groups.find((g) => g.id === "images")!;
	for (const task of latest.values()) {
		const result = task.result;
		if (
			!localProcessing(location, [task]) ||
			task.phase !== "saved" ||
			!result?.complete ||
			!images.inputs.includes(
				task.name.split(".").pop()?.toLowerCase() ?? "",
			) ||
			!images.outputs.includes(task.format) ||
			!Number.isSafeInteger(task.bytes) ||
			!Number.isSafeInteger(result.bytes) ||
			task.bytes <= 0 ||
			result.bytes <= 0
		)
			continue;
		count++;
		savedBytes += task.bytes - result.bytes;
	}
	return { count, savedBytes, ...estimateStorage(Math.max(0, savedBytes)) };
}

// Translate only known application notes; never echo arbitrary engine messages.
export function resultNote(note: string, english: boolean): string {
	const notes = [
		[
			"First audio track only. OGG uses lossy Vorbis quality 5; AIFF uses uncompressed PCM 16-bit. Tags and cover art are removed. Output may be larger.",
			"仅保留第一条音轨。OGG 使用有损 Vorbis（质量 5）；AIFF 使用未压缩的 16 位 PCM。移除标签和封面，输出可能变大。",
		],
		[
			"First frame only. BMP uses a white background; TGA/QOI preserve alpha. 8-bit output; metadata and ICC profiles are omitted. Output may be larger.",
			"仅转换首帧。BMP 使用白底；TGA/QOI 保留透明度。8 位输出，不保留元数据与 ICC 配置。输出可能变大。",
		],
		[
			"First frame only. Fixed 8-bit sRGB output; metadata and ICC profiles are omitted. Formats without alpha use a white background.",
			"仅转换首帧。固定 8 位 sRGB 输出，不保留元数据与 ICC 配置；不支持透明的格式使用白底。",
		],
		[
			"First frame only. PBM/XBM is thresholded at 50% to a 1-bit black-and-white image; metadata and ICC profiles are omitted.",
			"仅转换首帧。PBM/XBM 会按 50% 阈值化为 1 位黑白图像；不保留元数据与 ICC 配置。",
		],
		[
			"First frame only. PGM is an 8-bit grayscale image; metadata and ICC profiles are omitted.",
			"仅转换首帧。PGM 为 8 位灰度图像；不保留元数据与 ICC 配置。",
		],
		[
			"First frame only. XPM is limited to 256 colors; metadata and ICC profiles are omitted.",
			"仅转换首帧。XPM 最多 256 色；不保留元数据与 ICC 配置。",
		],
		[
			"First frame only. GIF is a static 256-color image; metadata and ICC profiles are omitted. Output may be larger.",
			"仅转换首帧。GIF 为静态 256 色图片，不保留元数据与 ICC 配置；输出可能变大。",
		],
		[
			"First frame only. TIFF is a single 8-bit sRGB page, not BigTIFF, multi-page, CMYK or high-bit-depth preservation. Metadata and ICC profiles are omitted.",
			"仅转换首帧。TIFF 为单页 8 位 sRGB，不支持 BigTIFF、多页、CMYK 或高位深保真；不保留元数据与 ICC 配置。",
		],
		[
			"First frame only. ICO is a single centered 256 × 256 icon; metadata and ICC profiles are omitted.",
			"仅转换首帧。ICO 是单个居中的 256 × 256 图标，不保留元数据与 ICC 配置。",
		],
		[
			"First frame only. HEIC/HEIF uses a lossy HEVC 8-bit SDR compatibility profile with 4:2:0 chroma and a white background. Metadata and ICC profiles are omitted. Third-party preview support varies.",
			"仅转换首帧。HEIC/HEIF 使用有损 HEVC、8 位 SDR、4:2:0 色度和白底的兼容档位；不保留元数据与 ICC 配置。第三方预览支持因系统而异。",
		],
		[
			"First frame only. JPEG XL is 8-bit sRGB. Metadata and ICC profiles are omitted; operating-system and browser preview support varies.",
			"仅转换首帧。JPEG XL 为 8 位 sRGB，不保留元数据与 ICC 配置；操作系统和浏览器预览支持因环境而异。",
		],
		[
			"First image only. HDR/linear source is mapped with a fixed exposure to 8-bit sRGB SDR; it is not a high-dynamic-range preservation conversion.",
			"仅转换首图。HDR/线性输入会以固定曝光映射到 8 位 sRGB SDR；这不是高动态范围保真转换。",
		],
		[
			"First image only. DPX is reduced to 8-bit sRGB SDR using ImageMagick's decoded DPX interpretation. Log/camera-specific LUTs, custom reference black/white choices, production metadata, multiple elements and high-bit-depth preservation are not retained.",
			"仅转换首图。DPX 会按 ImageMagick 解码后的解释降为 8 位 sRGB SDR；不保留 Log/相机专用 LUT、自定义参考黑白点、制作元数据、多图像元素和高位深保真。",
		],
		[
			"Static SVG only. Scripts, animation, external files and system fonts are not used; embedded raster data is limited. Output is an 8-bit sRGB bitmap.",
			"仅支持静态 SVG：不使用脚本、动画、外部文件或系统字体；嵌入位图受到限制。输出为 8 位 sRGB 位图。",
		],
		[
			"First audio track only. MP3 is lossy at 192 kb/s; sources at unsupported MP3 sampling rates are resampled. Metadata is removed.",
			"仅保留第一条音轨。MP3 为 192 kb/s 有损编码；不受 MP3 支持的源采样率会被重采样。元数据会移除。",
		],
		[
			"First audio track only. M4A uses lossy AAC at 192 kb/s; sources at unsupported AAC sampling rates are resampled. Metadata is removed.",
			"仅保留第一条音轨。M4A 使用 192 kb/s 有损 AAC；不受 AAC 支持的源采样率会被重采样。元数据会移除。",
		],
		[
			"First audio track only. Opus is lossy at 128 kb/s and uses a 48 kHz clock; sources not at 48 kHz are resampled. Metadata is removed.",
			"仅保留第一条音轨。Opus 为 128 kb/s 有损编码，使用 48 kHz 时钟；非 48 kHz 的源文件会被重采样。元数据会移除。",
		],
		[
			"First audio track only. WAV uses PCM 16-bit; FLAC is lossless. Metadata is removed.",
			"仅保留第一条音轨。WAV 使用 16 位 PCM；FLAC 为无损编码。元数据会移除。",
		],
		[
			"First audio track only. AAC uses a lossy ADTS stream at 192 kb/s; sources at unsupported AAC sampling rates are resampled. Tags and cover art are removed.",
			"仅保留第一条音轨。AAC 使用 192 kb/s 的有损 ADTS 流；不受 AAC 支持的源采样率会被重采样。移除标签和封面。",
		],
		[
			"First audio track only. ALAC is lossless and stored in an M4A container. Tags and cover art are removed; output may be larger.",
			"仅保留第一条音轨。ALAC 无损并存放于 M4A 容器；移除标签和封面，输出可能变大。",
		],
		[
			"Text only; images, layout and formatting are omitted.",
			"仅保留纯文本，不保留图片、版式和格式。",
		],
		[
			"Text only. Org markup is interpreted by Pandoc; underscores can represent subscripts, so use Org literal/code markup or #+OPTIONS: ^:{} for identifiers that must retain underscores. Images, layout and formatting are omitted.",
			"仅保留纯文本。Org 标记会由 Pandoc 解析；下划线可表示下标，需要保留原样的标识符请使用 Org 字面/代码标记或 #+OPTIONS: ^:{}。不保留图片、版式和格式。",
		],
		[
			"First frame only. JPEG uses a white background; PNG preserves pixels. EXIF/XMP/IPTC are optional; ICC is retained. Output may be larger.",
			"仅转换首帧。JPEG 使用白色背景；PNG 保留像素。EXIF/XMP/IPTC 可选保留；保留 ICC。输出可能变大。",
		],
	];
	const known = notes.find(([en]) => en === note);
	if (known) return known[english ? 0 : 1];
	const pdf =
		/^PDF: (\d{1,3}) pages, (72|96|144) DPI, at most 4000 × 4000 pixels per page\. Successfully saved pages are retained on cancellation or failure\.$/.exec(
			note,
		);
	if (pdf)
		return english
			? note
			: `PDF：${pdf[1]} 页，${pdf[2]} DPI，每页最多 4000 × 4000 像素。取消或失败时保留已保存的页面。`;
	return note
		? english
			? "Saved with the selected format. Review the output before using it."
			: "已按所选格式保存，使用前请检查输出。"
		: "";
}
