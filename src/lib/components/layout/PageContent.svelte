<script lang="ts">
	import { page } from "$app/state";
	import { unlocalizedPath } from "$lib/seo/routes.mjs";
	import type { Snippet } from "svelte";
	let { children }: { children: Snippet } = $props();
	const path = $derived(unlocalizedPath(page.url.pathname));
</script>

<main
	id="main-content"
	class="pixel-main"
	class:pixel-secondary={path !== "/" &&
		!path.startsWith("/convert") &&
		!path.startsWith("/tools/")}
	tabindex="-1"
>
	{@render children()}
</main>
