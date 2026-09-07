<script lang="ts">
	import type { ISettings } from "$lib/sections/settings/index.svelte";
	import { normalizeImageQuality } from "$lib/util/image-quality";
	import { m } from "$lib/paraglide/messages";
	let {
		settings = $bindable(),
		disabled = false,
		pdfImages = false,
		onchange = () => {},
	}: {
		settings: ISettings;
		disabled?: boolean;
		pdfImages?: boolean;
		onchange?: () => void;
	} = $props();
</script>

<div class="image-quality-control">
	<label>
		<span>{m["image_conversion.mode"]()}</span>
		<select
			{disabled}
			value={settings.magickQualityMode}
			onchange={(event) => {
				settings.magickQualityMode =
					event.currentTarget.value === "custom"
						? "custom"
						: "balanced";
				onchange();
			}}
		>
			<option value="balanced">{m["image_conversion.balanced"]()}</option>
			<option value="custom">{m["image_conversion.custom"]()}</option>
		</select>
	</label>
	{#if settings.magickQualityMode === "custom"}
		<label>
			<span>{m["pixel.quality"]()}</span>
			<input
				type="number"
				min="1"
				max="100"
				step="1"
				{disabled}
				value={settings.magickQuality}
				onchange={(event) => {
					settings.magickQuality = normalizeImageQuality(
						event.currentTarget.value,
						settings.magickQuality,
					);
					event.currentTarget.value = String(settings.magickQuality);
					onchange();
				}}
			/>
		</label>
		<p>
			{settings.magickQuality === 100
				? m["image_conversion.lossless_hint"]()
				: m["image_conversion.custom_hint"]()}
		</p>
	{:else}
		<p>
			{pdfImages
				? m["pdf_conversion.balanced_hint"]()
				: m["image_conversion.balanced_hint"]()}
		</p>
	{/if}
	<details>
		<summary>{m["image_conversion.format_limits"]()}</summary>
		<p>{m["image_conversion.precision_hint"]()}</p>
		<p>{m["image_conversion.lossless_formats_hint"]()}</p>
	</details>
</div>

<style>
	.image-quality-control {
		display: grid;
		gap: 0.65rem;
		margin-block: 1rem;
		min-width: 0;
	}
	label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.875rem;
	}
	select,
	input {
		border: 1px solid currentColor;
		background: var(--bg-panel);
		color: var(--fg);
		border-radius: 2px;
		min-height: 40px;
		padding: 0.4rem 0.5rem;
		max-width: 100%;
		font: inherit;
	}
	input {
		width: 5rem;
	}
	p {
		font-size: 0.8rem;
		line-height: 1.6;
		margin: 0;
	}
	summary {
		cursor: pointer;
		font-size: 0.8rem;
	}
	details p {
		margin-top: 0.5rem;
	}
</style>
