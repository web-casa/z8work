<script lang="ts">
	import Panel from "$lib/components/visual/Panel.svelte";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import type { ISettings } from "./index.svelte";
	import { effects } from "$lib/store/index.svelte";
	import { m } from "$lib/paraglide/messages";
	import { swManager, type CacheInfo } from "$lib/util/sw";
	import { onMount } from "svelte";
	import { error } from "$lib/util/logger";
	import { ToastManager } from "$lib/util/toast.svelte";
	import { addDialog } from "$lib/store/DialogProvider";

	const { settings = $bindable() }: { settings: ISettings } = $props();

	let cacheInfo = $state<CacheInfo | null>(null);
	let isLoadingCache = $state(false);

	async function loadCacheInfo() {
		if (isLoadingCache) return;
		isLoadingCache = true;
		try {
			await swManager.init();

			if ("serviceWorker" in navigator) {
				await navigator.serviceWorker.ready;
			}

			if (!navigator.serviceWorker.controller) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			cacheInfo = await swManager.getCacheInfo();
		} catch (err) {
			error(["privacy", "cache"], "Failed to load cache info:", err);
		} finally {
			isLoadingCache = false;
		}
	}

	async function clearCache() {
		if (isLoadingCache) return;
		isLoadingCache = true;
		try {
			await swManager.clearCache();
			cacheInfo = null;
			await loadCacheInfo();
			ToastManager.add({
				type: "success",
				message: m["settings.privacy.cache_cleared"](),
			});
		} catch (err) {
			error(["privacy", "cache"], "Failed to clear cache:", err);
			ToastManager.add({
				type: "error",
				message: m["settings.privacy.cache_clear_error"](),
			});
		} finally {
			isLoadingCache = false;
		}
	}

	async function clearAllData() {
		if (isLoadingCache) return;

		addDialog(
			m["settings.privacy.clear_all_data_confirm_title"](),
			m["settings.privacy.clear_all_data_confirm"](),
			[
				{
					text: m["settings.privacy.clear_all_data_cancel"](),
					action: () => {},
				},
				{
					text: m["settings.privacy.clear_all_data"](),
					action: async () => {
						isLoadingCache = true;
						try {
							await swManager.clearCache();
							localStorage.clear();
							sessionStorage.clear();

							ToastManager.add({
								type: "success",
								message:
									m["settings.privacy.all_data_cleared"](),
							});

							setTimeout(() => {
								window.location.href = "/";
							}, 1500);
						} catch (err) {
							error(
								["privacy", "data"],
								`Failed to clear all data: ${err}`,
							);
							ToastManager.add({
								type: "error",
								message:
									m[
										"settings.privacy.all_data_clear_error"
									](),
							});
						} finally {
							isLoadingCache = false;
						}
					},
				},
			],
			"warning",
		);
	}

	onMount(() => {
		loadCacheInfo();
	});
</script>

<Panel class="flex flex-col gap-8 p-6">
	<div class="flex flex-col gap-3">
		<h2 class="text-2xl font-bold">
			<span
				class="text-black inline-block -mt-1 mr-2 bg-accent-blue pixel-icon-badge"
				><PixelIcon name="lock" size={24} /></span
			>
			{m["settings.privacy.title"]()}
		</h2>
		<div class="flex flex-col gap-8">
			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					<p class="text-base font-bold">
						{m["settings.privacy.cache_title"]()}
					</p>
					<p class="text-sm text-muted font-normal">
						{m["settings.privacy.cache_description"]()}
					</p>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="bg-button p-4 rounded-lg">
						<div class="text-sm text-muted">
							{m["settings.privacy.total_size"]()}
						</div>
						<div class="text-lg font-bold flex items-center gap-2">
							{#if isLoadingCache}
								<PixelIcon
									name="reload"
									size={16}
									class="animate-spin"
								/>
								{m["settings.privacy.loading_cache"]()}
							{:else}
								{cacheInfo
									? swManager.formatSize(cacheInfo.totalSize)
									: "0 B"}
							{/if}
						</div>
					</div>
					<div class="bg-button p-4 rounded-lg">
						<div class="text-sm text-muted">
							{m["settings.privacy.files_cached_label"]()}
						</div>
						<div class="text-lg font-bold flex items-center gap-2">
							{#if isLoadingCache}
								<PixelIcon
									name="reload"
									size={16}
									class="animate-spin"
								/>
								{m["settings.privacy.loading_cache"]()}
							{:else}
								{cacheInfo?.fileCount ?? 0}
							{/if}
						</div>
					</div>
				</div>

				<div class="flex gap-3 w-full">
					<button
						onclick={loadCacheInfo}
						class="btn {$effects
							? ''
							: '!scale-100'} flex-1 p-4 rounded-lg text-black dynadark:text-white flex items-center justify-center"
						disabled={isLoadingCache}
					>
						<PixelIcon
							name="reload"
							size={24}
							class="inline-block mr-2"
						/>
						{m["settings.privacy.refresh_cache"]()}
					</button>
					<button
						onclick={clearCache}
						class="btn {$effects
							? ''
							: '!scale-100'} flex-1 p-4 rounded-lg text-black dynadark:text-white flex items-center justify-center"
						disabled={isLoadingCache}
					>
						<PixelIcon
							name="trash"
							size={24}
							class="inline-block mr-2"
						/>
						{m["settings.privacy.clear_cache"]()}
					</button>
				</div>
			</div>

			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					<p class="text-base font-bold">
						{m["settings.privacy.site_data_title"]()}
					</p>
					<p class="text-sm text-muted font-normal">
						{m["settings.privacy.site_data_description"]()}
					</p>
				</div>

				<button
					onclick={clearAllData}
					class="btn {$effects
						? ''
						: '!scale-100'} w-full p-4 rounded-lg text-black dynadark:text-white flex items-center justify-center"
					disabled={isLoadingCache}
				>
					<PixelIcon
						name="trash"
						size={24}
						class="inline-block mr-2"
					/>
					{m["settings.privacy.clear_all_data"]()}
				</button>
			</div>
		</div>
	</div></Panel
>
