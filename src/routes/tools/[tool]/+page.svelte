<script lang="ts">
	import { page } from "$app/state";
	import { seoCopy } from "$lib/seo/content";
	import {
		formatName,
		hubLinks,
		localeFromPath,
		localePath,
	} from "$lib/seo/routes.mjs";
	import { toolIcon } from "$lib/seo/icons";
	import ConversionWorkspace from "$lib/components/pixel/ConversionWorkspace.svelte";
	import RelatedConversions from "$lib/seo/RelatedConversions.svelte";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	let { data } = $props();
	const copy = $derived(seoCopy(localeFromPath(page.url.pathname)));
	const language = $derived(localeFromPath(page.url.pathname));
	const entry = $derived(data.tool);
	const hub = $derived(data.hub);
	const toolCopy = $derived(copy.tools[entry.slug]);
	const hubLinkLists = $derived(hub ? hubLinks(hub) : { from: [], to: [] });
	const steps = $derived(data.isHub ? copy.stepsHub : copy.steps);
	const format = $derived(hub?.format ? formatName(hub.format) : "");
	const fromHeading = $derived(
		toolCopy.hubFromTitle ?? copy.hubFrom.replace("{name}", format),
	);
	const toHeading = $derived(
		toolCopy.hubToTitle ?? copy.hubTo.replace("{name}", format),
	);
</script>

<div class="seo-tool-page">
	<header class="seo-intro">
		<h1>{toolCopy.title}</h1>
		<p>{toolCopy.intro}</p>
	</header>
	<ConversionWorkspace embedded />
	{#if hub}
		<section class="seo-hub-links">
			{#if hubLinkLists.from.length}
				<div>
					<h2>{fromHeading}</h2>
					<div class="seo-tool-links">
						{#each hubLinkLists.from as link (link.slug)}
							<a
								href={localePath(
									`/tools/${link.slug}/`,
									language,
								)}
							>
								<PixelIcon name={toolIcon(link)} size={24} />
								<span class="seo-tool-label"
									>{copy.tools[link.slug].title}</span
								><PixelIcon name="arrow" size={20} />
							</a>
						{/each}
					</div>
				</div>
			{/if}
			{#if hubLinkLists.to.length}
				<div>
					<h2>{toHeading}</h2>
					<div class="seo-tool-links">
						{#each hubLinkLists.to as link (link.slug)}
							<a
								href={localePath(
									`/tools/${link.slug}/`,
									language,
								)}
							>
								<PixelIcon name={toolIcon(link)} size={24} />
								<span class="seo-tool-label"
									>{copy.tools[link.slug].title}</span
								><PixelIcon name="arrow" size={20} />
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{/if}
	<section class="seo-guide">
		<div>
			<h2>{copy.guide}</h2>
			<ol>
				{#each steps as step}<li>{step}</li>{/each}
			</ol>
		</div>
		<div>
			<h2>{copy.notes}</h2>
			<p>{toolCopy.detail}</p>
			<p>{toolCopy.tip}</p>
		</div>
	</section>
	<section class="seo-faq" aria-labelledby="seo-faq-title">
		<h2 id="seo-faq-title">{copy.faq}</h2>
		{#each toolCopy.faqs as item}
			<h3>{item.q}</h3>
			<p>{item.a}</p>
		{/each}
	</section>
	<RelatedConversions slug={entry.slug} isHub={!!hub} />
</div>
