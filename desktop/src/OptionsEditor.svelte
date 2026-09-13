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
		["png", "jpeg", "webp", "avif"].includes(format),
	);
	const fixedRaster = $derived(["bmp", "tga", "qoi"].includes(format));
</script>

<div class="options-editor">
	{#if format === "ogg" || format === "aiff"}<p>
			{english
				? "First audio track only. OGG: lossy Vorbis, quality 5. AIFF: uncompressed PCM 16-bit; higher source bit depths are reduced. Tags and covers are removed. Output may grow."
				: "仅保留第一条音轨。OGG：有损 Vorbis，质量 5。AIFF：未压缩的 16 位 PCM，更高源位深会降低。移除标签和封面，输出可能变大。"}
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
	{#if fixedRaster}<p>
			{english
				? "8-bit output; metadata and ICC profiles are omitted. BMP uses a white background; TGA/QOI keep transparency."
				: "8 位输出，不保留元数据与 ICC 配置。BMP 使用白底；TGA/QOI 保留透明度。"}
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
	{#if imageOptions}<label class="checkbox"
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
