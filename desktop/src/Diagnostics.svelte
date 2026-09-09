<script lang="ts">
	import { invoke } from "@tauri-apps/api/core";
	import { onDestroy } from "svelte";
	import PixelIcon from "../../src/lib/components/pixel/PixelIcon.svelte";
	import {
		parseDiagnosticPreview,
		type DiagnosticPreview,
		diagnosticError,
	} from "./platform/diagnostics";
	let { english }: { english: boolean } = $props();
	let report = $state<DiagnosticPreview | null>(null);
	let busy = $state(false);
	let error = $state("");
	let outcome = $state<"saved" | "cancelled" | null>(null);
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const t = (zh: string, en: string) => (english ? en : zh);
	async function load() {
		if (busy) return;
		busy = true;
		error = "";
		outcome = null;
		report = null;
		try {
			const value = parseDiagnosticPreview(
				await invoke("preview_diagnostics"),
			);
			if (!disposed) report = value;
		} catch (e) {
			if (!disposed) error = String(e);
		} finally {
			if (!disposed) busy = false;
		}
	}
	async function save() {
		if (busy || !report) return;
		busy = true;
		error = "";
		outcome = null;
		try {
			const saved = await invoke<boolean>("save_diagnostics", {
				id: report.id,
			});
			if (!disposed) outcome = saved ? "saved" : "cancelled";
		} catch (e) {
			if (!disposed) error = String(e);
		} finally {
			if (!disposed) busy = false;
		}
	}
</script>

<details class="diagnostics" data-diagnostics>
	<summary>{t("帮助排查问题", "Troubleshooting")}</summary>
	<p>
		{t(
			"诊断报告只包含系统类型、引擎状态和任务数量，不含文件正文、文件名、路径或原始日志。先查看内容，再自行保存或分享；不会自动发送。",
			"The report includes system type, engine status and task counts. It excludes file contents, names, paths and raw logs. Review it before saving or sharing; nothing is sent automatically.",
		)}
	</p>
	<button disabled={busy} onclick={load} data-diagnostics-preview
		><PixelIcon name="info" size={18} />{report
			? t("重新生成报告", "Refresh report")
			: t("预览诊断报告", "Preview diagnostic report")}</button
	>
	{#if report}
		<label for="diagnostic-report"
			>{t(
				"报告内容（生成时的快照）",
				"Report contents (snapshot at generation)",
			)}</label
		>
		<textarea
			id="diagnostic-report"
			readonly
			value={report.text}
			rows="12"
			spellcheck={false}
		></textarea>
		<div class="actions">
			<button
				disabled={busy}
				onclick={() => {
					const field = document.getElementById(
						"diagnostic-report",
					) as HTMLTextAreaElement | null;
					field?.focus();
					field?.select();
				}}
				data-diagnostics-select
				>{t("选择全部文本", "Select all text")}</button
			>
			<button disabled={busy} onclick={save} data-diagnostics-save
				>{t("保存此报告…", "Save this report…")}</button
			>
		</div>
		<p>
			{t(
				"可以复制以上内容；保存时请选择新文件名，已有文件不会被覆盖。",
				"You can copy the text above. Choose a new filename when saving; existing files will not be overwritten.",
			)}
		</p>
	{/if}
	{#if busy}<p role="status">{t("正在处理…", "Working…")}</p>{/if}
	{#if outcome}<p role="status" data-diagnostics-outcome>
			{outcome === "saved"
				? t(
						"报告已保存，尚未发送给任何人。",
						"Report saved. It has not been sent to anyone.",
					)
				: t("已取消保存。", "Save cancelled.")}
		</p>{/if}
	{#if error}<p class="error" role="alert">
			{diagnosticError(error, english)}
		</p>{/if}
</details>

<style>
	.diagnostics {
		margin-block: 1.5rem;
	}
	summary {
		cursor: pointer;
	}
	p {
		line-height: 1.6;
		font-size: 0.875rem;
	}
	label {
		display: block;
		margin-top: 1rem;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		font-family: monospace;
		padding: 0.75rem;
		margin-block: 0.5rem;
		border: 2px solid currentColor;
		background: transparent;
		color: inherit;
		resize: vertical;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
