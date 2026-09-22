<script lang="ts">
	import type { Options, Format } from "./platform/queue-contract";
	let {
		options,
		format,
		english,
		disabled = false,
		pdf = false,
		onchange,
	}: {
		options: Options;
		format: Format;
		english: boolean;
		disabled?: boolean;
		pdf?: boolean;
		onchange: (options: Options) => void;
	} = $props();
	const imageOptions = $derived(
		["png", "jpeg", "webp", "avif", "heic", "heif", "jxl"].includes(format),
	);
	const fixedRaster = $derived(
		[
			"bmp",
			"tga",
			"qoi",
			"pbm",
			"pgm",
			"ppm",
			"pnm",
			"pam",
			"gif",
			"tiff",
			"ico",
			"pcx",
			"xbm",
			"xpm",
		].includes(format),
	);
</script>

<div class="options-editor">
	{#if format === "mp3"}<p>
			{english
				? "First audio track only. MP3 is lossy at 192 kb/s; sources at unsupported MP3 sampling rates are resampled. Metadata is removed."
				: "仅保留第一条音轨。MP3 为 192 kb/s 有损编码；不受 MP3 支持的源采样率会被重采样。元数据会移除。"}
		</p>{/if}
	{#if format === "m4a"}<p>
			{english
				? "First audio track only. M4A uses lossy AAC at 192 kb/s; sources at unsupported AAC sampling rates are resampled. Metadata is removed."
				: "仅保留第一条音轨。M4A 使用 192 kb/s 有损 AAC；不受 AAC 支持的源采样率会被重采样。元数据会移除。"}
		</p>{/if}
	{#if format === "opus"}<p>
			{english
				? "First audio track only. Opus is lossy at 128 kb/s and uses a 48 kHz clock; sources not at 48 kHz are resampled. Metadata is removed."
				: "仅保留第一条音轨。Opus 为 128 kb/s 有损编码，使用 48 kHz 时钟；非 48 kHz 的源文件会被重采样。元数据会移除。"}
		</p>{/if}
	{#if format === "ogg"}<p>
			{english
				? "First audio track only. OGG uses lossy Vorbis quality 5. Tags and cover art are removed. Output may be larger."
				: "仅保留第一条音轨。OGG 使用有损 Vorbis（质量 5）。移除标签和封面，输出可能变大。"}
		</p>
	{:else if format === "aiff"}<p>
			{english
				? "First audio track only. AIFF uses uncompressed PCM 16-bit; higher source bit depths are reduced. Tags and cover art are removed. Output may be larger."
				: "仅保留第一条音轨。AIFF 使用未压缩的 16 位 PCM；更高源位深会降低。移除标签和封面，输出可能变大。"}
		</p>
	{:else if format === "aac"}<p>
			{english
				? "First audio track only. AAC uses a lossy ADTS stream at 192 kb/s; sources at unsupported AAC sampling rates are resampled. Tags and cover art are removed."
				: "仅保留第一条音轨。AAC 使用 192 kb/s 的有损 ADTS 流；不受 AAC 支持的源采样率会被重采样。移除标签和封面。"}
		</p>
	{:else if format === "alac"}<p>
			{english
				? "First audio track only. ALAC is lossless and stored in an M4A container. Tags and cover art are removed; output may be larger."
				: "仅保留第一条音轨。ALAC 无损并存放于 M4A 容器；移除标签和封面，输出可能变大。"}
		</p>{/if}
	{#if format === "txt"}<p>
			{english
				? "Plain text only. Images and page layout are omitted. Scripts are not executed; referenced external resources are not loaded. No OCR."
				: "仅提取纯文本，不保留图片和页面排版；不执行脚本，不加载文档引用的外部资源，不提供 OCR。"}
		</p>{/if}
	{#if imageOptions}<label
			>{english ? "Image quality" : "图片质量"}
			<select
				{disabled}
				value={options.quality}
				onchange={(e) =>
					onchange({
						...options,
						quality: e.currentTarget.value as Options["quality"],
					})}
			>
				<option value="small"
					>{english ? "Smaller file" : "更小体积"}</option
				>
				<option value="balanced"
					>{english ? "Balanced" : "均衡（推荐）"}</option
				>
				<option value="high"
					>{english ? "Higher quality" : "更高画质"}</option
				>
			</select>
		</label>
	{/if}
	{#if ["pbm", "xbm"].includes(format)}<p>
			{english
				? "PBM/XBM output is thresholded at 50% to a 1-bit black-and-white image. Metadata and ICC profiles are omitted."
				: "PBM/XBM 输出会按 50% 阈值化为 1 位黑白图像，不保留元数据与 ICC 配置。"}
		</p>
	{:else if format === "pgm"}<p>
			{english
				? "PGM output is an 8-bit grayscale image. Metadata and ICC profiles are omitted."
				: "PGM 输出为 8 位灰度图像，不保留元数据与 ICC 配置。"}
		</p>
	{:else if format === "xpm"}<p>
			{english
				? "XPM output is limited to 256 colors. Metadata and ICC profiles are omitted."
				: "XPM 输出最多 256 色，不保留元数据与 ICC 配置。"}
		</p>
	{:else if fixedRaster}<p>
			{english
				? "Fixed 8-bit sRGB output; metadata and ICC profiles are omitted. GIF is static, TIFF is one page, and ICO is a 256 px icon. Formats without alpha use a white background."
				: "固定 8 位 sRGB 输出，不保留元数据与 ICC 配置。GIF 为静态图，TIFF 只有一页，ICO 为 256 像素图标；不支持透明的格式使用白底。"}
		</p>{/if}
	{#if format === "heic" || format === "heif"}<p>
			{english
				? "Lossy HEVC, 8-bit SDR and 4:2:0 chroma. Output uses a white background. Other apps may need a platform codec to preview it."
				: "使用有损 HEVC、8 位 SDR 与 4:2:0 色度，透明区域使用白底。其他应用预览时可能需要系统编解码器。"}
		</p>{/if}
	{#if format === "jxl"}<p>
			{english
				? "JPEG XL output is 8-bit sRGB. It is verified in Z8.Work, but browser and system preview support varies."
				: "JPEG XL 输出为 8 位 sRGB。Z8.Work 会验证结果，但浏览器和系统预览支持并不一致。"}
		</p>{/if}
	{#if pdf}<label
			>{english ? "PDF resolution" : "PDF 分辨率"}
			<select
				{disabled}
				value={options.pdf_dpi}
				onchange={(e) =>
					onchange({
						...options,
						pdf_dpi: Number(
							e.currentTarget.value,
						) as Options["pdf_dpi"],
					})}
			>
				<option value={72}>72 DPI</option><option value={96}
					>96 DPI</option
				><option value={144}>144 DPI</option>
			</select>
		</label>{/if}
	{#if imageOptions && !["heic", "heif", "jxl"].includes(format)}<label
			class="checkbox"
			><input
				type="checkbox"
				{disabled}
				checked={options.keep_metadata}
				onchange={(e) =>
					onchange({
						...options,
						keep_metadata: e.currentTarget.checked,
					})}
			/>
			{english
				? "Keep EXIF / XMP / IPTC"
				: "保留 EXIF / XMP / IPTC 元数据"}
		</label>
	{/if}
</div>
