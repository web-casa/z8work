<script lang="ts">
	import { getLocale } from "$lib/paraglide/runtime";
	type ComponentNotice = {
		name: string;
		version: string;
		license: string;
		notices: string[];
	};
	let components = $state<ComponentNotice[]>([]);
	let expanded = $state<Record<number, boolean>>({});
	let loading = $state(false);
	let error = $state(false);
	const zh = $derived(getLocale().startsWith("zh"));
	async function load(event: Event) {
		if (
			!(event.currentTarget as HTMLDetailsElement).open ||
			components.length ||
			loading
		)
			return;
		loading = true;
		error = false;
		try {
			const response = await fetch("/desktop-notices.json");
			if (!response.ok) throw Error("Notices unavailable");
			const data = await response.json();
			if (data.schema !== 1 || !Array.isArray(data.components))
				throw Error("Invalid notices");
			components = data.components;
		} catch {
			error = true;
		} finally {
			loading = false;
		}
	}
</script>

<details class="col-span-full min-w-0" ontoggle={load}>
	<summary class="cursor-pointer p-4 bg-button"
		>{zh
			? "开源许可（离线可读）"
			: "Open-source licenses (available offline)"}</summary
	>
	<div class="p-4 space-y-3">
		<p>
			{zh
				? "许可正文随应用提供。项目源码与发行说明见项目仓库。"
				: "License texts are included with the app. Project sources and release notes are available in the project repository."}
		</p>
		{#if loading}<p>{zh ? "正在读取…" : "Loading…"}</p>{/if}
		{#if error}<p role="alert">
				{zh
					? "未能读取许可，请折叠后重试。"
					: "Unable to load notices. Close and reopen to retry."}
			</p>{/if}
		{#each components as component, index}
			<details
				ontoggle={(event) => {
					expanded[index] = event.currentTarget.open;
				}}
			>
				<summary class="cursor-pointer break-words"
					>{component.name}
					{component.version} — {component.license}</summary
				>
				{#if expanded[index]}{#each component.notices as notice}<pre
							class="whitespace-pre-wrap break-words text-sm my-3">{notice}</pre>{/each}{/if}
			</details>
		{/each}
	</div>
</details>
