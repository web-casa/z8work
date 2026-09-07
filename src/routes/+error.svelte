<script lang="ts">
	import { page } from "$app/state";
	import { localeFromPath, localePath } from "$lib/seo/routes.mjs";
</script>

<section class="seo-intro">
	<h1>{page.status}</h1>
	<p>{page.error?.message}</p>
	<a
		class="pixel-button"
		href={localePath("/", localeFromPath(page.url.pathname))}>Z8.Work →</a
	>
</section>
