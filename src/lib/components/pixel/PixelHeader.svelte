<script lang="ts">
	import { localHref } from "$lib/seo/navigation";
	import { page } from "$app/state";
	import { browser } from "$app/environment";
	import { getLocale } from "$lib/paraglide/runtime";
	import { unlocalizedPath } from "$lib/seo/routes.mjs";
	import { tick } from "svelte";
	import {
		files,
		theme,
		setTheme,
		locale,
		availableLocales,
		updateLocale,
	} from "$lib/store/index.svelte";
	import { m } from "$lib/paraglide/messages";
	import { SITE_NAME } from "$lib/util/consts";
	import PixelIcon from "./PixelIcon.svelte";
	import AddFiles from "./AddFiles.svelte";
	const path = $derived(unlocalizedPath(page.url.pathname));
	const currentLocale = $derived(browser ? $locale : getLocale());
</script>

<a class="pixel-skip" href="#main-content">{m["pixel.skip"]()}</a>
<header class="pixel-header">
	<div class="pixel-titlebar">
		<a href={localHref("/")} class="pixel-wordmark" aria-label={SITE_NAME}
			>{SITE_NAME}</a
		>
		<p>{m["pixel.brand"]()}</p>
		<label class="pixel-language">
			<span class="sr-only">{m["settings.language.title"]()}</span>
			<PixelIcon name="globe" size={22} />
			<select
				id="header-language"
				value={currentLocale}
				title={`${m["settings.language.title"]()}: ${availableLocales[currentLocale]}`}
				onchange={async (event) => {
					await updateLocale(event.currentTarget.value);
					// Locale changes remount the translated layout; restore keyboard focus.
					await tick();
					document
						.getElementById("header-language")
						?.focus({ preventScroll: true });
				}}
			>
				{#each Object.entries(availableLocales) as [code, name]}
					<option value={code} lang={code}>{name}</option>
				{/each}
			</select>
			<PixelIcon name="chevron" size={18} />
		</label>
	</div>
	<nav class="pixel-menubar" aria-label={m["pixel.workspace"]()}>
		<a
			class="pixel-menu-item"
			class:active={path === "/" || path.startsWith("/convert")}
			aria-current={path === "/" || path.startsWith("/convert")
				? "page"
				: undefined}
			href={localHref(files.files.length ? "/convert/" : "/")}
		>
			<PixelIcon name="file" size={28} /><span
				>{m["pixel.workspace"]()}</span
			>
			{#if files.files.length}<span class="pixel-count"
					>{files.files.length}</span
				>{/if}
		</a>
		<AddFiles compact />
		<a
			class="pixel-menu-item"
			class:active={path.startsWith("/settings")}
			aria-current={path.startsWith("/settings") ? "page" : undefined}
			href={localHref("/settings/")}
			><PixelIcon name="sliders" size={28} /><span
				>{m["pixel.settings"]()}</span
			></a
		>
		<a
			class="pixel-menu-item"
			class:active={path.startsWith("/about")}
			aria-current={path.startsWith("/about") ? "page" : undefined}
			href={localHref("/about/")}
			><PixelIcon name="info" size={28} /><span
				>{m["navbar.about"]()}</span
			></a
		>
		<a
			class="pixel-menu-item"
			class:active={path.startsWith("/environment")}
			aria-label={m["eco.nav"]()}
			aria-current={path.startsWith("/environment") ? "page" : undefined}
			href={localHref("/environment/")}
			><PixelIcon name="leaf" size={28} /><span
				class="pixel-nav-full"
				aria-hidden="true">{m["eco.nav"]()}</span
			><span class="pixel-nav-short" aria-hidden="true"
				>{m["eco.navShort"]()}</span
			></a
		>
		<button
			class="pixel-menu-item pixel-theme-toggle"
			aria-label={m["navbar.toggle_theme"]()}
			title={m["navbar.toggle_theme"]()}
			onclick={() => setTheme($theme === "dark" ? "light" : "dark")}
			><PixelIcon name={$theme === "dark" ? "sun" : "moon"} /></button
		>
	</nav>
</header>
