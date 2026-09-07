<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { files } from "$lib/store/index.svelte";
	import { m } from "$lib/paraglide/messages";
	import PixelIcon from "./PixelIcon.svelte";
	let { compact = false }: { compact?: boolean } = $props();
	let input: HTMLInputElement;
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	function add() {
		files.add(input.files);
		input.value = "";
		goto("/convert/");
	}
</script>

<input
	type="file"
	disabled={!mounted}
	multiple
	bind:this={input}
	onchange={add}
	class="sr-only"
	tabindex="-1"
	aria-label={m["pixel.add"]()}
/>
<button
	type="button"
	disabled={!mounted}
	class={compact ? "pixel-menu-item" : "pixel-button pixel-add"}
	onclick={() => input.click()}
>
	<PixelIcon name={compact ? "file" : "plus"} size={compact ? 27 : 42} />
	<span>{m["pixel.add"]()}</span>
</button>
