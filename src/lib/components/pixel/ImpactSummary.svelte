<script lang="ts">
	import { localHref } from "$lib/seo/navigation";
	import { files, locale } from "$lib/store/index.svelte";
	import { m } from "$lib/paraglide/messages";
	import {
		summarizeImageSavings,
		formatCarbon,
	} from "$lib/util/environmental-impact";
	import { formatSize } from "./presentation";
	import PixelIcon from "./PixelIcon.svelte";
	const impact = $derived(summarizeImageSavings(files.files));
</script>

{#if impact.count > 0}
	<section
		class="pixel-impact"
		aria-label={m["eco.queue"]()}
		aria-live="polite"
	>
		<p class="pixel-impact-eyebrow">
			<PixelIcon name="leaf" size={20} />{m["eco.queue"]()}
		</p>
		{#if impact.savedBytes > 0}
			<h3>{m["eco.resultTitle"]()}</h3>
			<dl>
				<div>
					<dt>{m["eco.saved"]()}</dt>
					<dd data-impact-bytes={impact.savedBytes}>
						{formatSize(impact.savedBytes)}
					</dd>
				</div>
				<div>
					<dt>{m["eco.carbonYear"]()}</dt>
					<dd>{formatCarbon(impact.gramsCO2, $locale)}</dd>
				</div>
			</dl>
			<p class="pixel-impact-note">{m["eco.condition"]()}</p>
		{:else}
			<p class="pixel-impact-note">{m["eco.noSaving"]()}</p>
		{/if}
		<a class="pixel-impact-link" href={localHref("/environment/#method")}
			>{m["eco.methodLink"]()}<PixelIcon name="arrow" size={18} /></a
		>
	</section>
{/if}
