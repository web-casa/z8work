<script lang="ts">
	import { page } from "$app/state";
	import { seoCopy } from "$lib/seo/content";
	import { localeFromPath } from "$lib/seo/routes.mjs";
	import ToolDirectory from "$lib/seo/ToolDirectory.svelte";
	import ConversionWorkspace from "$lib/components/pixel/ConversionWorkspace.svelte";
	const copy = $derived(seoCopy(localeFromPath(page.url.pathname)));
</script>

<div class="seo-home">
	<ConversionWorkspace heading={copy.home} />
	<ToolDirectory />
</div>
