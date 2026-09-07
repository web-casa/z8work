<script lang="ts">
	import { dropping } from "$lib/store/index.svelte";
</script>

{#if $dropping}<div class="pixel-drop-overlay" aria-hidden="true"></div>{/if}
