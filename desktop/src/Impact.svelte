<script lang="ts">
	import { invoke } from "@tauri-apps/api/core";
	import PixelIcon from "../../src/lib/components/pixel/PixelIcon.svelte";
	import {
		IMPACT_MODEL,
		estimateGlobal,
		formatCarbon,
	} from "../../src/lib/util/environmental-impact";
	import { summarizeSavedImages } from "./platform/impact";
	import type { Task } from "./platform/queue-contract";
	let {
		english,
		tasks,
		location,
	}: { english: boolean; tasks: Task[]; location: unknown } = $props();
	const t = (zh: string, en: string) => (english ? en : zh);
	const saving = $derived(summarizeSavedImages(tasks, location));
	const global = estimateGlobal(1);
	const number = (value: number) =>
		new Intl.NumberFormat(english ? "en" : "zh-Hans", {
			maximumSignificantDigits: 3,
		}).format(value);
	let failed = $state(false);
	let opening = $state(false);
	async function openSource(id: string) {
		if (opening) return;
		opening = true;
		failed = false;
		try {
			await invoke("open_impact_source", { id });
		} catch {
			failed = true;
		} finally {
			opening = false;
		}
	}
</script>

<section class="impact" aria-labelledby="impact-title" data-impact>
	<h2 id="impact-title">
		<PixelIcon name="leaf" />{t(
			"更小的图片，更少的存储需求",
			"Smaller images, less storage demand",
		)}
	</h2>
	<p data-impact-summary>
		{t(
			"当前队列已保存图片：",
			"Saved images in this queue: ",
		)}{saving.count} · {saving.savedBytes >= 0
			? t(
					"相对原图潜在减少：",
					"Potential reduction compared to originals: ",
				)
			: t("相对原图增加：", "Increase compared to originals: ")}{number(
			Math.abs(saving.savedBytes),
		)} B
	</p>
	<p>
		{t(
			"按以下一年存储情景估算：",
			"Estimated for the one-year storage scenario below: ",
		)}{formatCarbon(saving.gramsCO2, english ? "en" : "zh-Hans")}
	</p>
	<p>
		{t(
			"原图仍保留，不代表已释放磁盘空间或实际减排。仅统计当前队列中完整保存的图片，体积增加会抵扣减少；重试不累计，清空即重置。",
			"Originals are retained: this is neither freed disk space nor measured emissions avoided. Only completely saved images in the current queue count; larger results offset reductions. Retries do not accumulate; clearing resets the estimate.",
		)}
	</p>
	<details data-impact-details>
		<summary
			>{t(
				"环保说明与估算依据（离线可读）",
				"Environmental context and assumptions (available offline)",
			)}</summary
		>
		<p>
			{t(
				"制造存储设备需要材料与能源，废弃电子设备可能释放有害物质。减少不必要的存储需求、延长设备寿命和正规回收有助于减少浪费。但缩小几个文件并不一定降低设备功耗或避免制造一块硬盘。",
				"Storage devices require materials and energy to manufacture, and discarded electronics can release hazardous substances. Reducing unnecessary storage demand, extending device life and proper recycling can reduce waste. Shrinking a few files does not necessarily reduce device power or avoid manufacturing a drive.",
			)}
		</p>
		<p>
			{t("模型版本：", "Model version: ")}{IMPACT_MODEL.version} · {t(
				"来源复核：2026-09-09。",
				"Sources checked: 2026-09-09.",
			)}
		</p>
		<p>
			{t(
				"假设一份副本在 HDD 上持续保存 365 天，按容量分摊 0.65 W/TB（2020 年情景），采用 2025 年全球发电平均值 435 g CO₂/kWh。1 MB = 1,000,000 B；1 TB = 1,000,000,000,000 B。",
				"Assumes one copy continuously stored on HDD for 365 days, allocating 0.65 W/TB (a 2020 scenario), with the 2025 global electricity-generation average of 435 g CO₂/kWh. 1 MB = 1,000,000 B; 1 TB = 1,000,000,000,000 B.",
			)}
		</p>
		<p>
			{t(
				"电量 kWh = 潜在减少字节 ÷ 10¹² × 365 × 24 × 0.65 ÷ 1000；CO₂ 克数 = kWh × 435。",
				"Energy kWh = potential byte reduction ÷ 10¹² × 365 × 24 × 0.65 ÷ 1000; grams CO₂ = kWh × 435.",
			)}
		</p>
		<p>
			{t(
				"如果 60 亿网民每人每天新增减少 1 MB，第一年情景电量约为 ",
				"If 6 billion Internet users each add 1 MB of reduction daily, the first-year scenario is approximately ",
			)}{number(global.kWh)} kWh{t(
				"。每天新增的减少分别保留 365、364…1 天，不把全年新增量都算作保存一年。",
				". Each daily reduction remains for 365, 364…1 days; the entire year's reduction is not treated as stored for a full year.",
			)}
		</p>
		<p>
			{t(
				"这是容量分摊的教学模型，不是设备测量或碳抵消凭证；实际用电取决于设备、利用率、电网与保留时间。未计入转换耗电、制造、网络、副本及机房冷却，不宣称生命周期净收益。",
				"This is an educational capacity-allocation model, not a device measurement or carbon-offset certificate. Actual energy depends on hardware, utilization, grid and retention. Conversion energy, manufacturing, networking, replication and cooling are excluded; no net life-cycle benefit is claimed.",
			)}
		</p>
		<p>
			{t(
				"以下来源将用系统浏览器打开并连接互联网；不会附带你的文件。",
				"Sources below open in your system browser and connect to the Internet; your files are not attached.",
			)}
		</p>
		<div class="source-actions">
			{#each [["storage", "Cloud Carbon Footprint"], ["electricity", "IEA · Electricity 2026"], ["population", "ITU · Facts and Figures 2025"], ["materials", "Seagate · Circularity"], ["waste", "ITU · E-waste Monitor 2024"]] as [id, label]}
				<button disabled={opening} onclick={() => openSource(id)}
					><PixelIcon name="link" size={16} />{label}</button
				>
			{/each}
		</div>
		{#if failed}<p role="alert">
				{t(
					"无法打开系统浏览器，请稍后重试。",
					"Could not open the system browser. Please try again.",
				)}
			</p>{/if}
	</details>
</section>
