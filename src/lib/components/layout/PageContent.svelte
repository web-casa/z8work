<script lang="ts">
	import { page } from "$app/state";
	import type { Snippet } from "svelte";
	let { children }: { children: Snippet } = $props();
</script>

<main
	id="main-content"
	class="pixel-main"
	class:pixel-secondary={page.url.pathname !== "/" &&
		!page.url.pathname.startsWith("/convert")}
	tabindex="-1"
>
	{@render children()}
</main>
