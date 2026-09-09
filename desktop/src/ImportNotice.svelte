<script lang="ts">
	import type { ImportReport, ImportReason } from "./platform/queue-contract";
	let {
		report,
		english,
		ondismiss,
	}: {
		report: ImportReport;
		english: boolean;
		ondismiss: (id: string) => void;
	} = $props();
	const t = (zh: string, en: string) => (english ? en : zh);
	function reason(value: ImportReason) {
		const descriptions = {
			unreadable: t(
				"无法读取文件，请检查位置和访问权限。",
				"Cannot read this file; check its location and access permissions.",
			),
			not_regular: t(
				"请选择普通文件；不支持导入目录或设备。",
				"Select a regular file; folders and devices cannot be imported.",
			),
			too_large: t(
				"文件超过 512 MiB 导入限制。",
				"File exceeds the 512 MiB import limit.",
			),
			unsupported: t(
				"暂不支持此格式，或所需原生引擎不可用。",
				"This format is unsupported or its native engine is unavailable.",
			),
			queue_full: t(
				"队列已达 100 个文件，请移除部分任务后重新选择。",
				"The queue has reached 100 files; remove some tasks and select this file again.",
			),
		};
		return descriptions[value];
	}
</script>

<aside class="import-notice" data-import-report>
	<p role="status">
		<strong>{t("最近一次导入", "Last import")}</strong>
		· {t("已添加", "Added")}
		{report.accepted}
		· {t("已跳过", "Skipped")}
		{report.issues.length}
	</p>
	{#if report.issues.length}
		<details open>
			<summary>{t("查看跳过原因", "Skipped files and reasons")}</summary>
			<ul>
				{#each report.issues as issue}<li>
						<strong
							>{issue.name ||
								t("未命名文件", "Unnamed file")}</strong
						>
						— {reason(issue.reason)}
					</li>{/each}
			</ul>
		</details>
	{/if}
	<button onclick={() => ondismiss(report.id)} data-import-dismiss
		>{t("关闭导入提示", "Dismiss import notice")}</button
	>
</aside>
