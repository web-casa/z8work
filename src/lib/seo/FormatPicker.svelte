<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { seoCopy } from "./content";
	import {
		formatName,
		groupOrder,
		localeFromPath,
		localePath,
		pickerEntries,
	} from "./routes.mjs";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";

	const language = $derived(localeFromPath(page.url.pathname));
	const copy = $derived(seoCopy(language));
	const entries = $derived(pickerEntries());

	let from = $state("");
	let to = $state("");

	const targets = $derived(
		entries.find((entry) => entry.format === from)?.targets ?? [],
	);

	function pickTarget(event: Event) {
		// Read the DOM value: the bound state may not be updated yet when the
		// change listener runs.
		const slug = (event.currentTarget as HTMLSelectElement).value;
		const target = targets.find((candidate) => candidate.slug === slug);
		if (target) goto(localePath(`/tools/${target.slug}/`, language));
	}
</script>

<div class="seo-picker">
	<label class="seo-picker-card">
		<span class="seo-picker-visually-hidden">{copy.picker.from}</span>
		<select
			bind:value={from}
			onchange={() => {
				to = "";
			}}
		>
			<option value="" disabled>{copy.picker.from}</option>
			{#each groupOrder as group (group)}
				{@const groupEntries = entries.filter(
					(entry) => entry.group === group,
				)}
				{#if groupEntries.length}
					<optgroup label={copy.groups[group]}>
						{#each groupEntries as entry (entry.format)}
							<option value={entry.format}
								>{formatName(entry.format)}</option
							>
						{/each}
					</optgroup>
				{/if}
			{/each}
		</select>
		<PixelIcon name="chevron" size={18} />
	</label>

	<span class="seo-picker-to" aria-hidden="true">
		<PixelIcon name="arrow" size={22} />
		<span>{copy.picker.to}</span>
	</span>

	<label class="seo-picker-card">
		<span class="seo-picker-visually-hidden">{copy.picker.toControl}</span>
		<select bind:value={to} onchange={pickTarget} disabled={!from}>
			<option value="" disabled>
				{from ? copy.picker.to : "···"}
			</option>
			{#each targets as target (target.slug)}
				<option value={target.slug}>{formatName(target.format)}</option>
			{/each}
		</select>
		<PixelIcon name="chevron" size={18} />
	</label>
</div>
