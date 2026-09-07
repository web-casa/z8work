<script lang="ts">
	import Panel from "$lib/components/visual/Panel.svelte";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import { m } from "$lib/paraglide/messages";
</script>

<Panel class="flex flex-col gap-6 p-6">
	<h2 class="text-xl md:text-2xl font-bold flex items-center gap-3">
		<PixelIcon name="heart" size={28} />
		{m["acknowledgements.developers"]()}
	</h2>
	<p class="text-lg leading-relaxed">{m["acknowledgements.foundation"]()}</p>
	<a
		href="https://vert.sh/"
		target="_blank"
		rel="noopener noreferrer"
		class="inline-flex items-center gap-2 underline underline-offset-4 self-start"
	>
		VERT.SH <PixelIcon name="arrow" size={20} />
	</a>
	<div class="flex flex-col gap-3">
		<h3 class="text-lg font-bold">{m["about.credits.libraries"]()}</h3>
		<p class="leading-relaxed">
			{m["about.credits.libraries_description"]()}
		</p>
	</div>
</Panel>
