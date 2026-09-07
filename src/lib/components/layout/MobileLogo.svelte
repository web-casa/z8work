<script>
	import { localHref } from "$lib/seo/navigation";
	import Logo from "$lib/components/visual/svg/Logo.svelte";
</script>

<div class="flex md:hidden justify-center items-center pb-8 pt-4">
	<a
		class="flex items-center justify-center bg-panel p-2 rounded-[20px] shadow-panel"
		href={localHref("/")}
	>
		<div
			class="h-14 bg-accent rounded-[14px] flex items-center justify-center"
		>
			<div class="w-28 h-5">
				<Logo />
			</div>
		</div>
	</a>
</div>
