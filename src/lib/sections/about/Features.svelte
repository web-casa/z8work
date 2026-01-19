<script lang="ts">
	import Panel from "$lib/components/visual/Panel.svelte";
	import {
		ShieldCheckIcon,
		GlobeIcon,
		ZapIcon,
		InfinityIcon,
		GemIcon,
		FileBoxIcon,
		WifiOffIcon,
		PaletteIcon,
		LeafIcon
	} from "lucide-svelte";
	import { m } from "$lib/paraglide/messages";
</script>

<div class="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-emerald-200 dark:bg-emerald-900 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<ShieldCheckIcon class="text-emerald-900 dark:text-emerald-200" size="20" />
			</div>
			{m["about.features.privacy.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.privacy.description"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-blue-200 dark:bg-blue-900 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<ZapIcon class="text-blue-900 dark:text-blue-200" size="20" />
			</div>
			{m["about.features.local.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.local.description"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-indigo-200 dark:bg-indigo-900 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<GlobeIcon class="text-indigo-900 dark:text-indigo-200" size="20" />
			</div>
			{m["about.features.localization.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.localization.description"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-purple-200 dark:bg-purple-900 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<InfinityIcon class="text-purple-900 dark:text-purple-200" size="20" />
			</div>
			{m["about.features.no_limits.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.no_limits.description"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-pink-200 dark:bg-pink-900 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<GemIcon class="text-pink-900 dark:text-pink-200" size="20" />
			</div>
			{m["about.features.free.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.free.description"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-orange-200 dark:bg-orange-900 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<FileBoxIcon class="text-orange-900 dark:text-orange-200" size="20" />
			</div>
			{m["about.features.formats.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.formats.description"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-slate-200 dark:bg-slate-700 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<WifiOffIcon class="text-slate-900 dark:text-slate-200" size="20" />
			</div>
			{m["about.features.offline.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.offline.description"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-cyan-200 dark:bg-cyan-900 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<PaletteIcon class="text-cyan-900 dark:text-cyan-200" size="20" />
			</div>
			{m["about.features.ui.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.ui.description"]()}
		</p>
	</Panel>

	<Panel class="flex flex-col gap-3 p-6">
		<h2 class="text-xl font-bold flex items-center">
			<div
				class="rounded-full bg-lime-200 dark:bg-lime-900 p-2 inline-block mr-3 w-10 h-10 flex items-center justify-center"
			>
				<LeafIcon class="text-lime-900 dark:text-lime-200" size="20" />
			</div>
			{m["about.features.green.title"]()}
		</h2>
		<p class="text-base font-normal">
			{@html m["about.features.green.description"]()}
		</p>
	</Panel>
</div>
