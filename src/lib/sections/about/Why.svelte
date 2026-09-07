<script lang="ts">
	import Panel from "$lib/components/visual/Panel.svelte";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import { m } from "$lib/paraglide/messages";
	import { sanitize } from "$lib/store/index.svelte";
</script>

<Panel class="flex flex-col gap-3 p-6">
	<h2 class="text-2xl font-bold flex items-center">
		<div
			class="pixel-icon-badge bg-accent-pink inline-block mr-3 w-10 h-10"
		>
			<PixelIcon class="text-black" name="question" />
		</div>
		{m["about.why.title"]()}
	</h2>
	<p class="text-lg font-normal">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- Translated markup passes through the shared allowlist sanitizer. -->
		{@html sanitize(m["about.why.description"]())}
	</p>
</Panel>
