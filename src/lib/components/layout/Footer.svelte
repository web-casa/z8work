<script lang="ts">
	import { localHref } from "$lib/seo/navigation";
	import { page } from "$app/state";
	import {
		indexedLocales,
		localePath,
		unlocalizedPath,
		localeFromPath,
	} from "$lib/seo/routes.mjs";
	import { seoCopy } from "$lib/seo/content";
	import { availableLocales, updateLocale } from "$lib/store/index.svelte";
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
		<a href={localHref("/privacy/")}>{m["footer.privacy_policy"]()}</a>
		<a href={localHref("/environment/")}>{m["eco.nav"]()}</a>
	</div>
	<a class="pixel-footer-server" href={localHref("/privacy/")}
		><PixelIcon name="lock" size={24} />{usesOnlyLocalConverters(converters)
			? m["trust.local"]()
			: m["trust.unknown"]()}</a
	>
</footer>
<nav
	class="seo-languages"
	aria-label={seoCopy(localeFromPath(page.url.pathname)).languages}
>
	{#each indexedLocales as code}<a
			href={localePath(unlocalizedPath(page.url.pathname), code)}
			lang={code}
			hreflang={code}
			onclick={(event) => {
				if (
					!event.ctrlKey &&
					!event.metaKey &&
					!event.shiftKey &&
					!event.altKey &&
					event.button === 0
				) {
					event.preventDefault();
					void updateLocale(code);
				}
			}}>{availableLocales[code as keyof typeof availableLocales]}</a
		>{/each}
</nav>
