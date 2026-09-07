<script lang="ts">
	import { localHref } from "$lib/seo/navigation";
	import { m } from "$lib/paraglide/messages";
	import { locale, files } from "$lib/store/index.svelte";
	import {
		IMPACT_SOURCES,
		estimateGlobal,
		formatCarbon,
		type StorageKind,
	} from "$lib/util/environmental-impact";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import ImpactSummary from "$lib/components/pixel/ImpactSummary.svelte";
	let dailyMB = $state<number | undefined>(1);
	let storage = $state<StorageKind>("hdd");
	const valid = $derived(
		dailyMB !== undefined &&
			Number.isFinite(dailyMB) &&
			dailyMB >= 0.01 &&
			dailyMB <= 1000,
	);
	const scenario = $derived(valid ? estimateGlobal(dailyMB!, storage) : null);
	const number = (value: number) =>
		new Intl.NumberFormat($locale, { maximumFractionDigits: 2 }).format(
			value,
		);
	function largeSize(bytes: number) {
		const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
		const index = Math.min(
			6,
			Math.max(0, Math.floor(Math.log10(bytes || 1) / 3)),
		);
		return `${number(bytes / 1000 ** index)} ${units[index]}`;
	}
</script>

<article class="pixel-story eco-page">
	<header class="eco-intro">
		<div>
			<p class="eco-eyebrow">
				<PixelIcon name="leaf" size={24} />{m["eco.eyebrow"]()}
			</p>
			<h1>{m["eco.title"]()}</h1>
			<p class="eco-lead">{m["eco.intro"]()}</p>
			<a class="eco-cta" href={files.files.length ? "/convert/" : "/"}
				>{m["eco.back"]()}<PixelIcon name="arrow" size={24} /></a
			>
		</div>
		<div class="eco-stamp" aria-hidden="true">
			<PixelIcon name="leaf" size={84} /><span>1 MB</span><span
				>× 6,000,000,000</span
			>
		</div>
	</header>
	<ImpactSummary />
	<section class="eco-calculator" aria-labelledby="global-heading">
		<div class="eco-calculator-controls">
			<h2 id="global-heading">{m["eco.globalTitle"]()}</h2>
			<p>
				{m["eco.globalIntro"]()}
				<a
					href={IMPACT_SOURCES.population}
					target="_blank"
					rel="noopener noreferrer">ITU, 2025 ↗</a
				>
			</p>
			<label for="daily-saving">{m["eco.dailyLabel"]()}</label>
			<div class="eco-input-unit">
				<input
					id="daily-saving"
					type="number"
					min="0.01"
					max="1000"
					step="0.01"
					bind:value={dailyMB}
					aria-invalid={!valid}
					aria-describedby={!valid ? "saving-error" : "global-note"}
				/><span aria-hidden="true">MB</span>
			</div>
			{#if !valid}<p
					class="eco-input-error"
					id="saving-error"
					role="alert"
				>
					{m["eco.invalid"]()}
				</p>{/if}
			<label for="storage-kind">{m["eco.storageLabel"]()}</label>
			<select id="storage-kind" bind:value={storage}
				><option value="hdd">{m["eco.hdd"]()}</option><option
					value="ssd">{m["eco.ssd"]()}</option
				></select
			>
			<p class="eco-small" id="global-note">{m["eco.globalNote"]()}</p>
		</div>
		<div
			class="eco-calculator-result"
			aria-live="polite"
			aria-atomic="true"
		>
			<dl>
				<div>
					<dt>{m["eco.daily"]()}</dt>
					<dd data-eco="daily">
						{scenario ? largeSize(scenario.dailyBytes) : "—"}
					</dd>
				</div>
				<div>
					<dt>{m["eco.yearEnd"]()}</dt>
					<dd data-eco="year-end">
						{scenario ? largeSize(scenario.yearEndBytes) : "—"}
					</dd>
				</div>
				<div class="eco-energy">
					<dt>{m["eco.energy"]()}</dt>
					<dd data-eco="energy">
						{scenario ? `${number(scenario.kWh)} kWh` : "—"}
					</dd>
				</div>
				<div>
					<dt>{m["eco.carbon"]()}</dt>
					<dd data-eco="carbon">
						{scenario
							? formatCarbon(scenario.gramsCO2, $locale)
							: "—"}
					</dd>
				</div>
			</dl>
			<p class="eco-small">{m["eco.globalScope"]()}</p>
			<a href="#method">{m["eco.methodLink"]()} ↓</a>
		</div>
	</section>
	<section class="eco-lifecycle" aria-labelledby="physical-heading">
		<h2 id="physical-heading">{m["eco.whyTitle"]()}</h2>
		<div class="eco-story-row">
			<span class="eco-step" aria-hidden="true">01</span>
			<h3>{m["eco.materialsTitle"]()}</h3>
			<p>
				{m["eco.materialsBody"]()}
				<a
					href={IMPACT_SOURCES.materials}
					target="_blank"
					rel="noopener noreferrer">Seagate · LCA ↗</a
				>
			</p>
		</div>
		<div class="eco-story-row">
			<span class="eco-step" aria-hidden="true">02</span>
			<h3>{m["eco.powerTitle"]()}</h3>
			<p>
				{m["eco.powerBody"]()}
				<a
					href={IMPACT_SOURCES.storage}
					target="_blank"
					rel="noopener noreferrer">Cloud Carbon Footprint ↗</a
				>
			</p>
		</div>
		<div class="eco-story-row">
			<span class="eco-step" aria-hidden="true">03</span>
			<h3>{m["eco.wasteTitle"]()}</h3>
			<p>
				{m["eco.wasteBody"]()}
				<a
					href={IMPACT_SOURCES.waste}
					target="_blank"
					rel="noopener noreferrer">ITU / UNITAR, 2024 ↗</a
				>
				{m["eco.pollution"]()}
				<a
					href="https://www.who.int/news-room/fact-sheets/detail/electronic-waste-(e-waste)"
					target="_blank"
					rel="noopener noreferrer">WHO, 2024 ↗</a
				>
			</p>
		</div>
	</section>
	<section class="eco-method" id="method" aria-labelledby="method-heading">
		<h2 id="method-heading">{m["eco.methodTitle"]()}</h2>
		<p>{m["eco.methodIntro"]()}</p>
		<div class="eco-table-wrap">
			<table>
				<thead
					><tr
						><th scope="col">{m["eco.factor"]()}</th><th scope="col"
							>{m["eco.value"]()}</th
						><th scope="col">{m["eco.source"]()}</th></tr
					></thead
				>
				<tbody>
					<tr
						><th scope="row">{m["eco.popFactor"]()}</th><td
							>{m["eco.popValue"]()}</td
						><td
							><a
								href={IMPACT_SOURCES.population}
								target="_blank"
								rel="noopener noreferrer">ITU, 2025 ↗</a
							></td
						></tr
					>
					<tr
						><th scope="row">{m["eco.storageFactor"]()}</th><td
							>{m["eco.storageValue"]()}</td
						><td
							><a
								href={IMPACT_SOURCES.storage}
								target="_blank"
								rel="noopener noreferrer"
								>Cloud Carbon Footprint ↗</a
							></td
						></tr
					>
					<tr
						><th scope="row">{m["eco.electricityFactor"]()}</th><td
							>{m["eco.electricityValue"]()}</td
						><td
							><a
								href={IMPACT_SOURCES.electricity}
								target="_blank"
								rel="noopener noreferrer"
								>IEA · Electricity 2026 ↗</a
							></td
						></tr
					>
					<tr
						><th scope="row">{m["eco.durationFactor"]()}</th><td
							colspan="2">{m["eco.durationValue"]()}</td
						></tr
					>
				</tbody>
			</table>
		</div>
		<p class="eco-formula">{m["eco.formula"]()}</p>
		<p>{m["eco.limits"]()}</p>
		<p class="eco-small">{m["eco.units"]()}</p>
		<p class="eco-small">{m["eco.version"]()}</p>
	</section>
	<section class="eco-actions">
		<PixelIcon name="leaf" size={40} />
		<div>
			<h2>{m["eco.actionsTitle"]()}</h2>
			<p>{m["eco.actionsBody"]()}</p>
			<a class="eco-cta" href={files.files.length ? "/convert/" : "/"}
				>{m["eco.back"]()}<PixelIcon name="arrow" size={24} /></a
			>
			<a class="eco-privacy-link" href={localHref("/privacy/")}
				>{m["eco.privacyLink"]()}</a
			>
		</div>
	</section>
</article>
