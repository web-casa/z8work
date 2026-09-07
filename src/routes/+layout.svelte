<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { goto, beforeNavigate, afterNavigate } from "$app/navigation";

	import {
		DISABLE_ALL_EXTERNAL_REQUESTS,
		VERT_NAME,
		SITE_NAME,
		SITE_URL,
	} from "$lib/util/consts.js";
	import * as Layout from "$lib/components/layout";
	import PixelHeader from "$lib/components/pixel/PixelHeader.svelte";
	import { Settings } from "$lib/sections/settings/index.svelte";
	import { converters } from "$lib/converters";
	import {
		files,
		isMobile,
		effects,
		theme,
		dropping,
		vertdLoaded,
		locale,
		updateLocale,
	} from "$lib/store/index.svelte";
	import "$lib/css/app.scss";
	import "$lib/css/pixel.scss";
	import "$lib/css/impact.scss";
	import "$lib/css/workspace.scss";
	import { initStores as initAnimStores } from "$lib/util/animation.js";
	import { VertdInstance } from "$lib/sections/settings/vertdSettings.svelte.js";
	import { ToastManager } from "$lib/util/toast.svelte.js";
	import { m } from "$lib/paraglide/messages.js";
	import { log } from "$lib/util/logger.js";
	import "$lib/util/sw";

	let { children } = $props();
	let isAprilFools = $state(false);
	const canonicalUrl = $derived(new URL(page.url.pathname, SITE_URL).href);
	const featuredImage = new URL("brand/social-card.png", SITE_URL).href;

	let scrollPositions = new Map<string, number>();

	beforeNavigate((nav) => {
		if (!nav.from || !$isMobile) return;
		scrollPositions.set(nav.from.url.pathname, window.scrollY);
	});

	afterNavigate((nav) => {
		if (!$isMobile) return;
		const scrollY = nav.to
			? scrollPositions.get(nav.to.url.pathname) || 0
			: 0;
		window.scrollTo(0, scrollY);
	});

	const dropFiles = (e: DragEvent) => {
		e.preventDefault();
		dropping.set(false);
		const oldLength = files.files.length;
		files.add(e.dataTransfer?.files);
		if (oldLength !== files.files.length) goto("/convert");
	};

	const handleDrag = (e: DragEvent, drag: boolean) => {
		e.preventDefault();
		dropping.set(drag);
	};

	const handlePaste = (e: ClipboardEvent) => {
		const clipboardData = e.clipboardData;
		if (!clipboardData || !clipboardData.files.length) return;
		e.preventDefault();
		const oldLength = files.files.length;
		files.add(clipboardData.files);
		if (oldLength !== files.files.length) goto("/convert");
	};

	onMount(() => {
		const now = new Date();
		isAprilFools = now.getDate() === 1 && now.getMonth() === 3;

		initAnimStores();

		const handleResize = () => {
			isMobile.set(window.innerWidth <= 800);
		};

		isMobile.set(window.innerWidth <= 800); // initial page load
		window.addEventListener("resize", handleResize); // handle window resize
		window.addEventListener("paste", handlePaste);

		effects.set(localStorage.getItem("effects") !== "false"); // defaults to true if not set
		theme.set(
			(localStorage.getItem("theme") as "light" | "dark") || "light",
		);
		const storedLocale = localStorage.getItem("locale");
		updateLocale(storedLocale ?? undefined);

		Settings.instance.load();

		if (
			!DISABLE_ALL_EXTERNAL_REQUESTS &&
			converters.some(
				(converter) => converter.processingLocation === "remote",
			)
		) {
			VertdInstance.instance
				.url()
				.then((u) => fetch(`${u}/api/version`))
				.then((res) => {
					$vertdLoaded = res.ok;
				})
				.catch(() => {
					$vertdLoaded = false;
				});
		}

		// detect if insecure context
		if (!window.isSecureContext) {
			log(
				["layout"],
				'Insecure context (HTTP) detected, some features may not work as expected -- you may want to enable "PUB_DISABLE_FAILURE_BLOCKS" on local deployments.',
			);
			ToastManager.add({
				type: "warning",
				message: m["toast.insecure_context"](),
				disappearing: false,
			});
		}

		return () => {
			window.removeEventListener("paste", handlePaste);
			window.removeEventListener("resize", handleResize);
		};
	});
</script>

<svelte:head>
	<title>{VERT_NAME}</title>
	<meta name="theme-color" content="#086B68" />
	<meta
		name="title"
		content="{VERT_NAME} — Free, fast, and awesome file converter"
	/>
	{#if !["/environment", "/privacy"].includes(page.url.pathname.replace(/\/$/, ""))}
		<meta name="description" content={m["trust.body"]()} />
	{/if}
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta
		property="og:title"
		content="{VERT_NAME} — Free, fast, and awesome file converter"
	/>
	<meta property="og:description" content={m["trust.body"]()} />
	<meta property="og:image" content={featuredImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={SITE_NAME} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="twitter:domain" content={new URL(SITE_URL).hostname} />
	<meta property="twitter:url" content={canonicalUrl} />
	<meta
		property="twitter:title"
		content="{VERT_NAME} — Free, fast, and awesome file converter"
	/>
	<meta property="twitter:description" content={m["trust.body"]()} />
	<meta property="twitter:image" content={featuredImage} />
	<link rel="manifest" href="/manifest.json" />
	<link rel="canonical" href={canonicalUrl} />
	{#if isAprilFools}
		<style>
			* {
				font-family: "Comic Sans MS", "Comic Sans", cursive !important;
			}
		</style>
	{/if}
</svelte:head>

<!-- FIXME: if user resizes between desktop/mobile, highlight of page disappears (only shows on original size) -->
{#key $locale}
	<div
		class="pixel-app"
		ondrop={dropFiles}
		ondragenter={(e) => handleDrag(e, true)}
		ondragover={(e) => handleDrag(e, true)}
		ondragleave={(e) => handleDrag(e, false)}
		role="region"
	>
		<Layout.UploadRegion />

		<PixelHeader />

		<!-- 
		SvelteKit throws the following warning when developing - safe to ignore as we render the children in this component:
		`<slot />` or `{@render ...}` tag missing — inner content will not be rendered
		-->
		<Layout.PageContent {children} />

		<Layout.Toasts />
		<Layout.Dialogs />

		<Layout.Footer />
	</div>
{/key}
