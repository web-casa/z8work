<script lang="ts">
	import * as About from "$lib/sections/about";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import { m } from "$lib/paraglide/messages";
</script>

<div class="flex flex-col h-full items-center">
	<h1 class="text-2xl md:text-[40px] tracking-tight leading-tight mb-6 px-4">
		<PixelIcon name="heart" size={40} class="inline-block -mt-2 mr-2" />
		{m["acknowledgements.title"]()}
	</h1>

	<div
		class="w-full max-w-[1280px] flex flex-col md:flex-row gap-4 p-4 md:px-4 md:py-0"
	>
		<!-- Resources & Credits -->
		<div class="flex flex-col gap-4 flex-1">
			<About.Resources />
			<About.Credits />
		</div>
	</div>
</div>
