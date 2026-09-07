<script lang="ts">
	import type { VertFile } from "$lib/types";
	import { files, vertdLoaded, locale } from "$lib/store/index.svelte";
	import { categories } from "$lib/converters";
	import { fileState } from "$lib/util/queue-state";
	import { ToastManager } from "$lib/util/toast.svelte";
	import { m } from "$lib/paraglide/messages";
	import FormatDropdown from "$lib/components/functional/FormatDropdown.svelte";
	import PixelIcon from "./PixelIcon.svelte";
	import { fileIssue, formatLabel, formatSize } from "./presentation";
	import {
		imageSaving,
		estimateStorage,
		formatCarbon,
	} from "$lib/util/environmental-impact";
	let { file }: { file: VertFile } = $props();
	const converter = $derived(file.findConverter());
	const saving = $derived(imageSaving(file));
	const issue = $derived(fileIssue(file, $vertdLoaded));
	let expanded = $state(false);
	const currentState = $derived(fileState(file));
	const status = $derived(
		currentState === "processing"
			? file.cancelled
				? m["workspace.cancelling"]()
				: file.pageProgress
					? m["pdf_conversion.progress"]({
							current: file.pageProgress.current,
							total: file.pageProgress.total,
						})
					: file.conversionPhase
						? m[`image_conversion.${file.conversionPhase}`]()
						: m["pixel.processing"]()
			: currentState === "queued"
				? m["pixel.waiting"]()
				: currentState === "complete"
					? m["pixel.complete"]()
					: currentState === "failed"
						? m["pixel.failed"]()
						: currentState === "cancelled"
							? m["pixel.cancelled"]()
							: m["pixel.queued"](),
	);
	async function download() {
		try {
			await file.download();
		} catch (error) {
			ToastManager.add({
				type: "error",
				message: m["workspace.download_error"]({
					error: String(error),
				}),
			});
		}
	}

	async function remove() {
		await files.remove(file);
	}
</script>

<article
	class="pixel-file compact-file"
	class:has-issue={!!issue}
	aria-label={file.name}
	data-state={currentState}
>
	<div class="file-thumbnail" aria-hidden="true">
		{#if file.blobUrl}<img src={file.blobUrl} alt="" loading="lazy" />
		{:else}<PixelIcon
				name={converter?.name === "ffmpeg"
					? "music"
					: ["pandoc", "pdf"].includes(converter?.name ?? "")
						? "file"
						: "picture"}
				size={32}
			/>{/if}
	</div>
	<div class="file-identity">
		<h2>
			<button
				type="button"
				class="file-name"
				class:expanded
				aria-expanded={expanded}
				aria-controls={`filename-${file.id}`}
				title={file.name}
				aria-label={`${expanded ? m["workspace.collapse_name"]() : m["workspace.full_name"]()}: ${file.name}`}
				onclick={() => (expanded = !expanded)}
			>
				<span id={`filename-${file.id}`}>{file.name}</span><PixelIcon
					name="chevron"
					size={16}
				/>
			</button>
		</h2>
		<p class="pixel-file-size">
			<span class="file-extension">{formatLabel(file.from)}</span>
			{formatSize(file.file.size)}
			{#if file.result}<span aria-hidden="true">→</span><strong
					>{formatLabel(file.result.to)}
					{formatSize(file.result.file.size)}</strong
				>{/if}
		</p>
		<div
			class="pixel-file-status"
			class:success={currentState === "complete"}
		>
			{#if currentState === "complete"}<PixelIcon
					name="check"
					size={16}
				/>{/if}
			{currentState === "pending" ? issue || status : status}
		</div>
	</div>
	<button
		type="button"
		class="file-remove"
		aria-label={m["pixel.remove"]({ name: file.name })}
		onclick={remove}><PixelIcon name="close" size={20} /></button
	>

	{#if saving}
		<div class="pixel-file-saving file-detail">
			{#if saving.savedBytes > 0}
				<strong
					>{m["eco.perFile"]({
						size: formatSize(saving.savedBytes),
					})}</strong
				>
				<a href="/environment/#method" title={m["eco.condition"]()}>
					<span>{m["eco.carbonYear"]()}</span>
					{formatCarbon(
						estimateStorage(saving.savedBytes).gramsCO2,
						$locale,
					)}
				</a>
			{:else}
				<p>
					{saving.savedBytes < 0
						? m["eco.increase"]({
								size: formatSize(-saving.savedBytes),
							})
						: m["eco.unchanged"]()}
				</p>
			{/if}
		</div>
	{/if}
	{#if file.processing}
		<progress
			class="pixel-progress file-detail"
			max="100"
			value={converter?.reportsProgress || file.isZip()
				? file.progress
				: undefined}
			aria-label={m["pixel.processing"]()}
		></progress>
	{/if}
	{#if file.failed && file.errorMessage}
		<details class="pixel-conversion-error file-detail">
			<summary>{m["image_conversion.error_details"]()}</summary>
			<p>{file.errorMessage}</p>
		</details>
	{/if}
	<div class="pixel-file-controls">
		<div class="pixel-file-format">
			<FormatDropdown
				{file}
				{categories}
				from={file.from}
				selected={file.to}
				dropdownSize="small"
				disabled={file.processing || file.queued}
				onselect={(format) => file.setTarget(format)}
			/>
		</div>
		{#if file.processing || file.queued}
			<button
				class="pixel-square"
				title={m["pixel.cancel"]()}
				aria-label={m["pixel.cancel"]()}
				onclick={() => file.cancel()}><PixelIcon name="close" /></button
			>
		{:else if file.result}
			<button
				class="pixel-square"
				title={m["convert.tooltips.download_file"]()}
				aria-label={m["convert.tooltips.download_file"]()}
				onclick={download}><PixelIcon name="download" /></button
			>
		{:else}
			<button
				class="pixel-square"
				title={m["convert.tooltips.convert_file"]()}
				aria-label={m["convert.tooltips.convert_file"]()}
				disabled={!!issue}
				onclick={() => file.convert()}
				><PixelIcon name="arrow" /></button
			>
		{/if}
	</div>
	{#if file.from === ".pdf"}
		<p class="pixel-frame-hint file-detail">{m["pdf_conversion.hint"]()}</p>
		{#if file.to === ".ico"}
			<p class="pixel-frame-hint file-detail">
				{m["pdf_conversion.ico_hint"]()}
			</p>
		{:else if file.to === ".psd"}
			<p class="pixel-frame-hint file-detail">
				{m["pdf_conversion.psd_hint"]()}
			</p>
		{:else if [".hdr", ".exr"].includes(file.to)}
			<p class="pixel-frame-hint file-detail">
				{m["pdf_conversion.hdr_hint"]()}
			</p>
		{/if}
	{/if}
	{#if [".gif", ".webp"].includes(file.from) && ![".gif", ".webp"].includes(file.to)}
		<p class="pixel-frame-hint file-detail">
			{m["image_conversion.still_hint"]()}
		</p>
	{/if}
	{#if file.from !== ".pdf" && converter?.name === "imagemagick"}
		{#if [".jpeg", ".jpg", ".jpe", ".jfif"].includes(file.to)}
			<p class="pixel-frame-hint file-detail">
				{m["image_conversion.jpeg_hint"]()}
			</p>
		{:else if file.to === ".gif"}
			<p class="pixel-frame-hint file-detail">
				{m["image_conversion.gif_hint"]()}
			</p>
		{/if}
	{/if}
</article>

<style>
	.pixel-frame-hint {
		font-size: 0.75rem;
		line-height: 1.5;
		margin-block: 0.5rem;
	}
	.pixel-conversion-error {
		font-size: 0.8rem;
		line-height: 1.5;
		margin-block: 0.5rem;
	}
	.pixel-conversion-error summary {
		cursor: pointer;
	}
	.pixel-conversion-error p {
		overflow-wrap: anywhere;
		max-height: 10rem;
		overflow: auto;
	}
</style>
