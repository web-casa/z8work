<script lang="ts">
	import type { Options } from "./platform/queue-contract";
	let {
		options,
		english,
		disabled = false,
		pdf = false,
		onchange,
	}: {
		options: Options;
		english: boolean;
		disabled?: boolean;
		pdf?: boolean;
		onchange: (options: Options) => void;
	} = $props();
</script>

<div class="options-editor">
	<label
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
	<label class="checkbox"
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
		{english ? "Keep EXIF / XMP / IPTC" : "保留 EXIF / XMP / IPTC 元数据"}
	</label>
</div>
