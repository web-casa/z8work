<script lang="ts">
	import { page } from "$app/state";
	import { seoCopy } from "$lib/seo/content";
	import { localeFromPath, localePath } from "$lib/seo/routes.mjs";
	import FormatPicker from "$lib/seo/FormatPicker.svelte";
	import ConversionWorkspace from "$lib/components/pixel/ConversionWorkspace.svelte";
	const copy = $derived(seoCopy(localeFromPath(page.url.pathname)));
	const language = $derived(localeFromPath(page.url.pathname));
</script>

<div class="seo-home">
	<ConversionWorkspace heading={copy.home} />
	<section class="seo-home-picker" aria-labelledby="home-picker-title">
		<h2 id="home-picker-title">{copy.directory}</h2>
		<FormatPicker />
		<a class="seo-home-browse" href={localePath("/tools/", language)}>
			{copy.picker.browse}
		</a>
	</section>
</div>
