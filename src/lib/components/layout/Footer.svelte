<script lang="ts">
	import { converters } from "$lib/converters";
	import { usesOnlyLocalConverters } from "$lib/util/conversion-privacy";
	import {
		summarizeQueue,
		queueStatus,
	} from "$lib/components/pixel/presentation";
	import { files, vertdLoaded } from "$lib/store/index.svelte";
	import { m } from "$lib/paraglide/messages";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	const year = new Date().getFullYear();
	const summary = $derived(summarizeQueue(files.files, $vertdLoaded));
	const processing = $derived(summary.running > 0);
</script>

<footer class="pixel-footer">
	<div class="pixel-footer-status" role="status">
		<PixelIcon
			name={processing
				? "loader"
				: summary.groups.complete.length === summary.total &&
					  summary.total
					? "check"
					: "info"}
			size={26}
		/>{queueStatus(summary)}
	</div>
	<div class="pixel-footer-links">
		<span>{m["footer.copyright"]({ year })}</span>
		<a
			href="https://screenhello.com"
			target="_blank"
			rel="noopener noreferrer">{m["navbar.screenhello"]()}</a
		>
		<a href="/privacy/">{m["footer.privacy_policy"]()}</a>
		<a href="/environment/">{m["eco.nav"]()}</a>
	</div>
	<a class="pixel-footer-server" href="/privacy/"
		><PixelIcon name="lock" size={24} />{usesOnlyLocalConverters(converters)
			? m["trust.local"]()
			: m["trust.unknown"]()}</a
	>
</footer>
