<script lang="ts">
	import { m } from "$lib/paraglide/messages";
	import { fade, fly } from "$lib/util/animation";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";
	import { quintOut } from "svelte/easing";
	import { ToastManager } from "$lib/util/toast.svelte";
	import type { ToastExports } from "$lib/util/toast.svelte";
	import clsx from "clsx";
	import type { Toast as ToastType } from "$lib/util/toast.svelte";

	const {
		toast,
	}: {
		toast: ToastType<unknown>;
	} = $props();

	const { id, type, message, durations } = toast;

	const additional = "additional" in toast ? toast.additional : {};

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

	let msg = $state<ToastExports>();
	const title = $derived(msg?.title ?? "");

	// Literal class names let Tailwind include each notification border color.
	const colourVariants = {
		success: "border-accent-purple-alt",
		error: "border-accent-red-alt",
		info: "border-accent-blue-alt",
		warning: "border-accent-pink-alt",
	};
</script>

<div
	class="flex flex-col max-w-[100%] md:max-w-md p-4 gap-2 bg-accent-{color} {colourVariants[
		type
	]} border-l-4 rounded-lg shadow-md"
	in:fly={{
		duration: durations.enter,
		easing: quintOut,
		x: 0,
		y: 100,
	}}
	out:fade={{
		duration: durations.exit,
		easing: quintOut,
	}}
>
	<div class="flex flex-row items-center justify-between w-full gap-4">
		<div class="flex items-center gap-2">
			<PixelIcon
				name={icon}
				class="w-6 h-6 text-black flex-shrink-0"
				size={24}
			/>
			<p
				class={clsx("text-black whitespace-pre-wrap", {
					"font-normal": !title,
				})}
			>
				{title || message}
			</p>
		</div>
		<button
			class="toast-close text-gray-600 hover:text-black flex-shrink-0 min-w-11 min-h-11 flex items-center justify-center"
			aria-label={m["workspace.close"]()}
			onclick={() => ToastManager.remove(id)}
		>
			<PixelIcon name="close" size={16} />
		</button>
	</div>
	{#if typeof message !== "string"}
		{@const MessageComponent = message}
		<div class="font-normal">
			<MessageComponent
				bind:this={msg}
				{durations}
				{id}
				{message}
				{type}
				{additional}
			/>
		</div>
	{/if}
</div>
