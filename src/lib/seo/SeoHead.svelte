<script lang="ts">
	import { page } from "$app/state";
	import { SITE_NAME } from "$lib/util/consts";
	import {
		indexedLocales,
		indexablePaths,
		localeFromPath,
		localePath,
		siteUrl,
		toolForPath,
		unlocalizedPath,
	} from "./routes.mjs";
	import { seoCopy } from "./content";
	const language = $derived(localeFromPath(page.url.pathname));
	const path = $derived(unlocalizedPath(page.url.pathname));
	const copy = $derived(seoCopy(language));
	const tool = $derived(toolForPath(path));
	const toolCopy = $derived(tool ? copy.tools[tool.slug] : undefined);
	const pageTitle = $derived(
		toolCopy?.title ?? copy.pages[path]?.[0] ?? copy.home,
	);
	const title = $derived(
		page.status >= 400
			? `${page.status} · ${SITE_NAME}`
			: pageTitle.includes(SITE_NAME)
				? pageTitle
				: `${pageTitle} · ${SITE_NAME}`,
	);
	const description = $derived(
		toolCopy?.intro ?? copy.pages[path]?.[1] ?? copy.description,
	);
	const canonical = $derived(siteUrl + localePath(path, language));
	const indexable = $derived(
		page.status < 400 &&
			indexedLocales.includes(language) &&
			indexablePaths.includes(path),
	);
	const image = `${siteUrl}/brand/social-card.png`;
	const schema = $derived({
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "WebSite",
				"@id": `${siteUrl}/#website`,
				name: SITE_NAME,
				url: `${siteUrl}/`,
			},
			{
				"@type": "WebPage",
				"@id": `${canonical}#page`,
				url: canonical,
				name: title,
				description,
				inLanguage: language,
				isPartOf: { "@id": `${siteUrl}/#website` },
			},
			...(path === "/"
				? [
						{
							"@type": "SoftwareApplication",
							"@id": `${siteUrl}/#application`,
							name: SITE_NAME,
							url: `${siteUrl}/`,
							applicationCategory: "UtilitiesApplication",
							operatingSystem:
								"Any operating system with a supported browser",
							browserRequirements:
								"Requires JavaScript and WebAssembly",
							offers: {
								"@type": "Offer",
								price: "0",
								priceCurrency: "USD",
							},
							license:
								"https://www.gnu.org/licenses/agpl-3.0.html",
							sameAs: "https://github.com/web-casa/z8work",
						},
					]
				: []),
			...(tool
				? [
						{
							"@type": "BreadcrumbList",
							itemListElement: [
								{
									"@type": "ListItem",
									position: 1,
									name: SITE_NAME,
									item: siteUrl + localePath("/", language),
								},
								{
									"@type": "ListItem",
									position: 2,
									name: toolCopy?.title,
									item: canonical,
								},
							],
						},
					]
				: []),
		],
	});
	const structuredDataHtml = $derived(
		'<script type="application/ld+json">' +
			JSON.stringify(schema).replace(/</g, "\\u003c") +
			"</" +
			"script>",
	);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	{#if !indexable}<meta name="robots" content="noindex, follow" />{/if}
	{#if page.status < 400}<link rel="canonical" href={canonical} />{/if}
	{#if indexable}
		{#each indexedLocales as code}<link
				rel="alternate"
				hreflang={code}
				href={siteUrl + localePath(path, code)}
			/>{/each}
		<link rel="alternate" hreflang="x-default" href={siteUrl + path} />
	{/if}
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Z8.Work" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
	{#if indexable}
		<!-- JSON is serialized from local metadata and escapes every '<', preventing script termination. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html structuredDataHtml}
	{/if}
</svelte:head>
