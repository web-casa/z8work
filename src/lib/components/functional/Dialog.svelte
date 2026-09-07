<script lang="ts">
	import { duration, fade, fly } from "$lib/util/animation";
	import { removeDialog } from "$lib/store/DialogProvider";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import { quintOut } from "svelte/easing";
	import type { Dialog as DialogType } from "$lib/store/DialogProvider";

	type Props = DialogType & { additional?: unknown };

	const { id, title, message, buttons, type, additional }: Props = $props();

	const colors = {
		success: "purple",
		error: "red",
		info: "blue",
		warning: "pink",
	};

	const icons = {
		success: "check",
		error: "cancel",
		info: "info",
		warning: "warning",
	} as const;

	let color = $derived(colors[type]);
	let icon = $derived(icons[type]);
</script>

<div
	class="flex flex-col items-center justify-between w-full max-w-sm p-4 gap-6 bg-panel border-accent-{color}-alt rounded-lg shadow-md"
	in:fly={{
		duration,
		easing: quintOut,
		x: 0,
		y: 100,
	}}
	out:fade={{
		duration,
		easing: quintOut,
	}}
>
	<div class="flex justify-between w-full items-center">
		<div class="flex items-center gap-3">
			<div
				class="pixel-icon-badge pixel-icon-badge-small bg-accent-{color} inline-block w-8 h-8"
			>
				<PixelIcon class="text-black" name={icon} size={16} />
			</div>
			<p class="text-lg font-semibold">{title}</p>
		</div>
	</div>
	<div class="flex flex-col gap-1 w-full">
		{#if typeof message === "string"}
			<p class="text-sm font-normal text-muted whitespace-pre-wrap">
				{message}
			</p>
		{:else}
			{@const MessageComponent = message}
			<div class="text-sm font-normal text-muted">
				<MessageComponent {id} {title} {type} {buttons} {additional} />
			</div>
		{/if}
	</div>
	<div class="flex flex-row items-center gap-4 w-full">
		{#each buttons as { text, action }, i}
			<button
				class="hover:scale-105 active:scale-100 duration-200 flex items-center gap-2 p-2 rounded-md {i ===
				1
					? `bg-accent-${color} text-black`
					: 'bg-button text-black dynadark:text-white'} px-6"
				onclick={() => {
					action();
					removeDialog(id);
				}}
			>
				{text}
			</button>
		{/each}
	</div>
</div>
