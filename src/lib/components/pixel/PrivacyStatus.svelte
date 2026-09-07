<script lang="ts">
	import { localHref } from "$lib/seo/navigation";
	import { converters } from "$lib/converters";
	import { m } from "$lib/paraglide/messages";
	import { usesOnlyLocalConverters } from "$lib/util/conversion-privacy";
	import PixelIcon from "./PixelIcon.svelte";
	const local = $derived(usesOnlyLocalConverters(converters));
</script>

<aside class="pixel-trust" aria-label={m["trust.local"]()}>
	<div class="pixel-trust-heading">
		<PixelIcon name="lock" size={28} />
		<div>
			<strong>{local ? m["trust.title"]() : m["trust.unknown"]()}</strong>
			{#if local}<p>{m["trust.body"]()}</p>{/if}
		</div>
	</div>
	{#if local}
		<div class="pixel-upload-count">
			<span>{m["trust.label"]()}</span><strong>0 B</strong>
		</div>
		<details class="pixel-trust-details">
			<summary>{m["trust.details"]()}</summary>
			<p>
				{m["trust.scope"]()}
				{m["trust.network"]()}
				<a href={localHref("/privacy/")}
					>{m["footer.privacy_policy"]()}</a
				>
			</p>
		</details>
	{/if}
</aside>
