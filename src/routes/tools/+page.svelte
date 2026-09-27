<script lang="ts">
	import { page } from "$app/state";
	import { seoCopy } from "$lib/seo/content";
	import {
		groupOrder,
		hubs,
		localeFromPath,
		localePath,
		tools,
	} from "$lib/seo/routes.mjs";
	import { toolIcon } from "$lib/seo/icons";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";

	const language = $derived(localeFromPath(page.url.pathname));
	const copy = $derived(seoCopy(language));
	const title = $derived(copy.pages["/tools/"][0]);
	const intro = $derived(copy.pages["/tools/"][1]);
	const sections = $derived(
		groupOrder
			.map((group) => ({
				group,
				label: copy.groups[group],
				tools: tools.filter((tool) => tool.group === group),
			}))
			.filter((section) => section.tools.length > 0),
	);
</script>

<div class="seo-tool-page">
	<header class="seo-intro">
		<h1>{title}</h1>
		<p>{intro}</p>
	</header>
	<section class="seo-tools" aria-labelledby="format-guides-title">
		<h2 id="format-guides-title">{copy.formatGuides}</h2>
		<div class="seo-tool-links">
			{#each hubs as hub (hub.slug)}
				<a href={localePath(`/tools/${hub.slug}/`, language)}>
					<PixelIcon name={toolIcon(hub)} size={24} />
					<span class="seo-tool-label"
						>{copy.tools[hub.slug].title}</span
					>
					<PixelIcon name="arrow" size={20} />
				</a>
			{/each}
		</div>
	</section>
	{#each sections as section (section.group)}
		<section class="seo-tools" aria-labelledby={`group-${section.group}`}>
			<h2 id={`group-${section.group}`}>{section.label}</h2>
			<div class="seo-tool-links">
				{#each section.tools as tool (tool.slug)}
					<a href={localePath(`/tools/${tool.slug}/`, language)}>
						<PixelIcon name={toolIcon(tool)} size={24} />
						<span class="seo-tool-label"
							>{copy.tools[tool.slug].title}</span
						>
						<PixelIcon name="arrow" size={20} />
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>
