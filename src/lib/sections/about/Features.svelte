<script lang="ts">
	import { localHref } from "$lib/seo/navigation";
	import Panel from "$lib/components/visual/Panel.svelte";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import { m } from "$lib/paraglide/messages";
</script>

<div class="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-emerald-200 dark:bg-emerald-900 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="shield"
					class="text-emerald-900 dark:text-emerald-200"
					size={24}
				/>
			</div>
			{m["about.features.privacy.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["trust.intro"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-blue-200 dark:bg-blue-900 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="zap"
					class="text-blue-900 dark:text-blue-200"
					size={24}
				/>
			</div>
			{m["about.features.local.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["trust.body"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-indigo-200 dark:bg-indigo-900 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="globe"
					class="text-indigo-900 dark:text-indigo-200"
					size={24}
				/>
			</div>
			{m["about.features.localization.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["about.features.localization.description"]().replace(
				/<\/?b>/g,
				"",
			)}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-purple-200 dark:bg-purple-900 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="infinity"
					class="text-purple-900 dark:text-purple-200"
					size={24}
				/>
			</div>
			{m["about.features.no_limits.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["about.features.no_limits.description"]().replace(/<\/?b>/g, "")}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-pink-200 dark:bg-pink-900 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="gem"
					class="text-pink-900 dark:text-pink-200"
					size={24}
				/>
			</div>
			{m["about.features.free.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["about.features.free.description"]().replace(/<\/?b>/g, "")}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-orange-200 dark:bg-orange-900 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="box"
					class="text-orange-900 dark:text-orange-200"
					size={24}
				/>
			</div>
			{m["about.features.formats.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["about.features.formats.description"]().replace(/<\/?b>/g, "")}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-slate-200 dark:bg-slate-700 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="monitor"
					class="text-slate-900 dark:text-slate-200"
					size={24}
				/>
			</div>
			{m["about.features.offline.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["about.features.offline.description"]().replace(/<\/?b>/g, "")}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-cyan-200 dark:bg-cyan-900 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="palette"
					class="text-cyan-900 dark:text-cyan-200"
					size={24}
				/>
			</div>
			{m["about.features.ui.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["about.features.ui.description"]().replace(/<\/?b>/g, "")}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="pixel-icon-badge bg-lime-200 dark:bg-lime-900 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PixelIcon
					name="leaf"
					class="text-lime-900 dark:text-lime-200"
					size={24}
				/>
			</div>
			{m["about.features.green.title"]()}
		</h2>
		<p class="text-base font-normal">
			{m["eco.feature"]()}
			<a class="underline" href={localHref("/environment/")}
				>{m["eco.methodLink"]()} →</a
			>
		</p>
	</Panel>
</div>
