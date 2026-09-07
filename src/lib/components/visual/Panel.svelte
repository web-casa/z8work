<script lang="ts">
	import type { Snippet } from "svelte";

	type Props = {
		class?: string;
		children: Snippet<[]>;
	};

	const { class: classList, children }: Props = $props();
</script>

<div class="pixel-panel bg-panel {classList} p-3">
	{@render children?.()}
</div>
