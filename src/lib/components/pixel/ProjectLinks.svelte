<script lang="ts">
	import { m } from "$lib/paraglide/messages";
	import { SITE_NAME, SITE_URL } from "$lib/util/consts";
	import PixelIcon from "./PixelIcon.svelte";
	const links = [
		{
			url: "https://debian.club/",
			name: "Debian.Club",
		},
		{
			url: "https://hestiacp.cn/",
			name: "Hestiacp.cn",
		},
		{
			url: "https://portcyou.com/",
			name: "PortCyou",
		},
		{
			url: "https://cloud.fan/",
			name: "CloudFan",
		},
		{
			url: "https://www.almalinux.com.cn/",
			name: "AlmaLinuxCN",
		},
		{
			url: "https://p.cafe/",
			name: "P.Cafe",
		},
		{
			url: "https://www.rank.fan/",
			name: "RankFan",
		},
		{
			url: "https://www.apponarm.com/",
			name: "APP on ARM",
		},
		{
			url: "https://mf8.biz/",
			name: "MF8",
		},
		{
			url: "https://aat.ee/",
			name: "AAT.ee",
		},
		{
			url: SITE_URL,
			name: SITE_NAME,
		},
		{
			url: "https://geo.fan/",
			name: "GEO.Fan",
		},
		{
			url: "https://llstack.com/",
			name: "LLStack",
		},
	];
</script>

<details class="pixel-formats pixel-project-links">
	<summary
		><PixelIcon name="globe" />{m["upload.friend_links"]()}<PixelIcon
			name="chevron"
		/></summary
	>
	<nav
		aria-label={m["upload.friend_links"]()}
		class="pixel-project-links-list"
	>
		{#each links as link}<a
				href={link.url}
				target="_blank"
				rel="noopener noreferrer">{link.name}</a
			>{/each}
	</nav>
	<div class="pixel-project-badges">
		<a href="https://www.aat.ee/" target="_blank" rel="noopener noreferrer">
			<img
				src="/badges/aat-light.svg"
				alt="AAT Featured"
				class="h-8 dark:hidden"
			/>
			<img
				src="/badges/aat-dark.svg"
				alt="AAT Featured"
				class="h-8 hidden dark:block"
			/>
		</a>
		<a
			href="https://www.hicyou.com/"
			target="_blank"
			rel="noopener noreferrer"
		>
			<img
				src="/badges/hicyou-light.svg"
				alt="HicYou Featured"
				class="h-8 dark:hidden"
			/>
			<img
				src="/badges/hicyou-dark.svg"
				alt="HicYou Featured"
				class="h-8 hidden dark:block"
			/>
		</a>
	</div>
</details>
