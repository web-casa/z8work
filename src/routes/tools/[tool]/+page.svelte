<script lang="ts">
	import { page } from "$app/state";
	import { seoCopy } from "$lib/seo/content";
	import { localeFromPath } from "$lib/seo/routes.mjs";
	import ConversionWorkspace from "$lib/components/pixel/ConversionWorkspace.svelte";
	import ToolDirectory from "$lib/seo/ToolDirectory.svelte";
	let { data } = $props();
	const copy = $derived(seoCopy(localeFromPath(page.url.pathname)));
	const tool = $derived(copy.tools[data.tool.slug]);
</script>

<div class="seo-tool-page">
	<header class="seo-intro">
		<h1>{tool.title}</h1>
		<p>{tool.intro}</p>
	</header>
	<ConversionWorkspace embedded />
	<section class="seo-guide">
		<div>
			<h2>{copy.guide}</h2>
			<ol>
				{#each copy.steps as step}<li>{step}</li>{/each}
			</ol>
		</div>
		<div>
			<h2>{copy.notes}</h2>
			<p>{tool.detail}</p>
			<p>{tool.tip}</p>
		</div>
	</section>
	<ToolDirectory exclude={data.tool.slug} />
</div>
