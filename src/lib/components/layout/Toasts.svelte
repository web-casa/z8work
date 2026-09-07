<script lang="ts">
	import Toast from "$lib/components/visual/Toast.svelte";
	import { ToastManager } from "$lib/util/toast.svelte";
</script>

<div
	class="workspace-toasts fixed right-0 p-4 flex flex-col-reverse gap-4 z-50"
>
	{#each ToastManager.toasts as toast (toast.id)}
		<div class="flex justify-end">
			<Toast {toast} />
		</div>
	{/each}
</div>

<style>
	.workspace-toasts {
		bottom: var(--workspace-action-height, 0px);
		max-height: 40svh;
		max-width: 100%;
		overflow-y: auto;
	}
</style>
