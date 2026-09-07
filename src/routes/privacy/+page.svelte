<script lang="ts">
	import { localHref } from "$lib/seo/navigation";
	import { m } from "$lib/paraglide/messages";
	import { CONTACT_EMAIL } from "$lib/util/consts";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import PrivacyStatus from "$lib/components/pixel/PrivacyStatus.svelte";
</script>

<article class="pixel-story privacy-story">
	<header>
		<p class="eco-eyebrow">
			<PixelIcon name="lock" size={24} />{m["trust.local"]()}
		</p>
		<h1>{m["trust.privacyTitle"]()}</h1>
		<p class="eco-lead">{m["trust.intro"]()}</p>
	</header>
	<PrivacyStatus />
	<section>
		<h2>{m["trust.filesTitle"]()}</h2>
		<p>{m["trust.filesBody"]()}</p>
	</section>
	<section>
		<h2>{m["trust.connectionsTitle"]()}</h2>
		<p>{m["trust.connectionsBody"]()}</p>
	</section>
	<section>
		<h2>{m["trust.analyticsTitle"]()}</h2>
		<p>{m["trust.analyticsBody"]()}</p>
	</section>
	<section>
		<h2>{m["trust.storageTitle"]()}</h2>
		<p>
			{m["trust.storageBody"]()}
			<a href={localHref("/settings/")}>{m["navbar.settings"]()} →</a>
		</p>
	</section>
	<section>
		<h2>{m["trust.contactTitle"]()}</h2>
		<p>
			{m["trust.contactBody"]()}
			<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
		</p>
	</section>
	<p class="eco-small">{m["trust.updated"]()}</p>
	<a class="eco-cta" href={localHref("/")}
		>{m["pixel.workspace"]()}<PixelIcon name="arrow" size={24} /></a
	>
</article>
