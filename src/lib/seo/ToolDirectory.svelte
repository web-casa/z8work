<script lang="ts">
	import { page } from "$app/state";
	import { seoCopy } from "./content";
	import { localeFromPath, localePath, tools } from "./routes.mjs";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	let { exclude = "" }: { exclude?: string } = $props();
	const language = $derived(localeFromPath(page.url.pathname));
	const copy = $derived(seoCopy(language));
</script>

<section class="seo-tools" aria-labelledby="tool-directory-title">
	<h2 id="tool-directory-title">{exclude ? copy.related : copy.directory}</h2>
	<div class="seo-tool-links">
		{#each tools.filter((tool) => tool.slug !== exclude) as tool}
			<a href={localePath(`/tools/${tool.slug}/`, language)}>
				<PixelIcon
					name={tool.inputs.includes(".pdf") ? "file" : "picture"}
					size={24}
				/>
				<span class="seo-tool-label">{copy.tools[tool.slug].title}</span
				><PixelIcon name="arrow" size={20} />
			</a>
		{/each}
	</div>
</section>
