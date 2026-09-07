<script lang="ts">
	import { localHref } from "$lib/seo/navigation";
	import { onMount } from "svelte";
	import { goto, beforeNavigate, afterNavigate } from "$app/navigation";

	import { DISABLE_ALL_EXTERNAL_REQUESTS } from "$lib/util/consts.js";
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
		syncLocale,
	} from "$lib/store/index.svelte";
	import SeoHead from "$lib/seo/SeoHead.svelte";
	import "$lib/css/seo.scss";
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

	let scrollPositions = new Map<string, number>();

	beforeNavigate((nav) => {
		if (!nav.from || !$isMobile) return;
		scrollPositions.set(nav.from.url.pathname, window.scrollY);
	});

	afterNavigate((nav) => {
		syncLocale();
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
		if (oldLength !== files.files.length) goto(localHref("/convert/"));
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
		if (oldLength !== files.files.length) goto(localHref("/convert/"));
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
		syncLocale();

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

<SeoHead />

<svelte:head>
	<meta name="theme-color" content="#086B68" />
	<link rel="manifest" href="/manifest.json" />
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
