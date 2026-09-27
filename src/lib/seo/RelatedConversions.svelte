<script lang="ts">
	import { page } from "$app/state";
	import { seoCopy } from "./content";
	import {
		localeFromPath,
		localePath,
		relatedForTool,
		hubs,
	} from "./routes.mjs";
	import { toolIcon } from "./icons";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";

	let { slug, isHub = false }: { slug: string; isHub?: boolean } = $props();

	const language = $derived(localeFromPath(page.url.pathname));
	const copy = $derived(seoCopy(language));
	const links = $derived.by(() => {
		if (isHub) return hubs.filter((hub) => hub.slug !== slug);
		const related = relatedForTool(slug);
		return [...related.hubs, ...related.pairs];
	});
</script>

<section class="seo-tools" aria-labelledby="related-links-title">
	<h2 id="related-links-title">
		{isHub ? copy.otherConverters : copy.related}
	</h2>
	<div class="seo-tool-links">
		{#each links as link (link.slug)}
			<a href={localePath(`/tools/${link.slug}/`, language)}>
				<PixelIcon name={toolIcon(link)} size={24} />
				<span class="seo-tool-label">{copy.tools[link.slug].title}</span
				>
				<PixelIcon name="arrow" size={20} />
			</a>
		{/each}
	</div>
</section>
