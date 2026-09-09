<script lang="ts">
	import { invoke } from "@tauri-apps/api/core";
	import PixelIcon from "../../src/lib/components/pixel/PixelIcon.svelte";
	let { english }: { english: boolean } = $props();
	const t = (zh: string, en: string) => (english ? en : zh);
	let entries = $state<{ id: string; bytes: number }[]>([]);
	let selected = $state("application");
	let text = $state("");
	let busy = $state(false);
	let failed = $state(false);
	let indexFailed = $state(false);
	async function read() {
		if (busy) return;
		busy = true;
		failed = false;
		text = "";
		try {
			if (!entries.length || indexFailed) {
				try {
					entries = await invoke("license_index");
					indexFailed = false;
				} catch {
					entries = [{ id: "application", bytes: 0 }];
					selected = "application";
					indexFailed = true;
				}
			}
			text = await invoke("read_license", { id: selected });
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<details
	class="licenses"
	ontoggle={(event) => {
		if (event.currentTarget.open && !text && !busy) void read();
	}}
	data-licenses
>
	<summary
		><PixelIcon name="file" />{t(
			"开源许可",
			"Open-source licenses",
		)}</summary
	>
	<p>
		{t(
			"Z8.Work 基于 VERT.SH 开发。你可以离线阅读应用许可证及此安装包附带的组件声明。",
			"Z8.Work builds on VERT.SH. Read the application license and this package’s component notices offline.",
		)}
	</p>
	{#if indexFailed}<p role="status">
			{t(
				"组件许可目录暂时无法读取，仍可阅读应用许可证。",
				"Component notices are unavailable; the application license is still readable.",
			)}
		</p>
		<button onclick={() => void read()} disabled={busy}
			>{t("重新读取目录", "Retry notice list")}</button
		>{/if}
	<label
		>{t("选择许可文件", "Choose a notice")}
		<select
			bind:value={selected}
			onchange={() => void read()}
			disabled={busy || !entries.length}
		>
			{#each entries as entry}<option value={entry.id}
					>{entry.id === "application"
						? "Z8.Work / VERT.SH — AGPL-3.0"
						: entry.id.replace(/^licenses\//, "")}</option
				>{/each}
		</select>
	</label>
	{#if busy}<p role="status">
			{t("正在读取本地许可…", "Reading local notices…")}
		</p>{/if}
	{#if failed}<p role="alert">
			{t(
				"许可文件暂时无法读取，请重试。",
				"Could not read the notice. Please try again.",
			)}
		</p>
		<button onclick={() => void read()} disabled={busy}
			>{t("重试", "Retry")}</button
		>{/if}
	{#if text}<textarea
			readonly
			value={text}
			aria-label={t("许可原文", "Original license text")}
		></textarea>{/if}
</details>

<style>
	.licenses {
		margin-top: 1rem;
		border-top: 2px solid currentColor;
		padding-top: 1rem;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}
	label {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	select {
		max-width: 100%;
		min-width: 0;
	}
	textarea {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		height: 24rem;
		width: 100%;
		resize: vertical;
		overflow: auto;
		padding: 1rem;
		border: 1px solid currentColor;
		font-size: 0.8rem;
	}
</style>
