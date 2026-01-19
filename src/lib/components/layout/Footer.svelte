<script lang="ts">
	import { m } from "$lib/paraglide/messages";

	const year = new Date().getFullYear();
</script>


<footer
	class="hidden md:block w-full h-14 border-t border-separator fixed bottom-0 mt-12"
>
	<div
		class="w-full h-full flex items-center justify-center text-muted gap-3 relative"
	>
		<p>{m["footer.copyright"]({ year })}</p>
		<p>•</p>
		<a
			class="hover:underline font-normal"
			href="/privacy/"
		>
			{m["footer.privacy_policy"]()}
		</a>
	</div>

	<div
		class="absolute bottom-0 left-0 w-full h-24 -z-10 pointer-events-none"
		style="background: linear-gradient(to bottom, transparent, var(--bg) 100%)"
	></div>
</footer>
