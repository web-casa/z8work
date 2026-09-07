<script lang="ts">
	import Panel from "$lib/components/visual/Panel.svelte";
	import { CONTACT_EMAIL, GITHUB_URL_PROJECT } from "$lib/util/consts";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import { m } from "$lib/paraglide/messages";
</script>

<Panel class="flex flex-col gap-4 p-6">
	<h2 class="text-2xl font-bold flex items-center">
		<div
			class="pixel-icon-badge bg-accent-purple inline-block mr-3 w-10 h-10"
		>
			<PixelIcon class="text-black" name="link" />
		</div>
		{m["about.resources.title"]()}
	</h2>
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
		<a
			href={GITHUB_URL_PROJECT}
			target="_blank"
			rel="noopener noreferrer"
			class="btn min-w-0 gap-3 p-4 bg-button flex items-center"
		>
			<PixelIcon name="github" size={24} />
			<span class="min-w-0 flex flex-col gap-1">
				<span>{m["about.resources.source"]()}</span>
				<span class="text-sm break-all">web-casa/z8work</span>
			</span>
		</a>
		<a
			href="mailto:{CONTACT_EMAIL}"
			class="btn min-w-0 gap-3 p-4 bg-button flex items-center"
		>
			<PixelIcon name="mail" size={24} />
			<span class="min-w-0 flex flex-col gap-1">
				<span>{m["about.resources.email"]()}</span>
				<span class="text-sm break-all">{CONTACT_EMAIL}</span>
			</span>
		</a>
	</div>
</Panel>
