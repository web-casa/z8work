<script lang="ts">
	import { tick } from "svelte";
	import { m } from "$lib/paraglide/messages";
	import { isMobile, files, dropdownStates } from "$lib/store/index.svelte";
	import { VertFile, type Categories } from "$lib/types";
	import { converters } from "$lib/converters";
	import { outputFormats } from "$lib/util/output-formats";
	import { ToastManager } from "$lib/util/toast.svelte";
	import { formatLabel } from "$lib/components/pixel/presentation";
	import PixelIcon from "$lib/components/pixel/PixelIcon.svelte";

	let {
		categories,
		from,
		selected = $bindable(""),
		onselect,
		disabled = false,
		dropdownSize = "default",
		file,
		allowedFormats,
	}: {
		categories: Categories;
		from?: string;
		selected?: string;
		onselect?: (option: string) => void;
		disabled?: boolean;
		dropdownSize?: "default" | "large" | "small";
		file?: VertFile;
		allowedFormats?: readonly string[];
	} = $props();
	const id = $props.id();
	let open = $state(false);
	let trigger: HTMLButtonElement;
	let dialog: HTMLDialogElement;
	let results = $state<HTMLDivElement>();
	let search = $state<HTMLInputElement>();
	let query = $state("");
	let category = $state("");
	let expanded = $state(false);
	let extracting = $state(false);
	// Presentation only: every entry is intersected with the existing legal
	// candidates below. Aliases remain separate, searchable output extensions.
	const commonFormatGroups = [
		[".jpeg", ".jpg"],
		[".png"],
		[".webp"],
		[".avif"],
		[".gif"],
		[".tiff", ".tif"],
		[".mp3"],
		[".wav"],
		[".flac"],
		[".m4a"],
		[".ogg"],
		[".opus"],
		[".docx"],
		[".odt"],
		[".md"],
		[".html"],
		[".epub"],
	];
	const purposeLabels: Record<string, () => string> = {
		".jpg": m["formats.purpose.jpeg"],
		".jpeg": m["formats.purpose.jpeg"],
		".png": m["formats.purpose.png"],
		".webp": m["formats.purpose.webp"],
		".avif": m["formats.purpose.avif"],
		".gif": m["formats.purpose.gif"],
		".tiff": m["formats.purpose.tiff"],
		".tif": m["formats.purpose.tiff"],
		".mp3": m["formats.purpose.mp3"],
		".wav": m["formats.purpose.wav"],
		".flac": m["formats.purpose.flac"],
		".m4a": m["formats.purpose.m4a"],
		".ogg": m["formats.purpose.ogg"],
		".opus": m["formats.purpose.opus"],
		".docx": m["formats.purpose.docx"],
		".odt": m["formats.purpose.odt"],
		".md": m["formats.purpose.md"],
		".html": m["formats.purpose.html"],
		".epub": m["formats.purpose.epub"],
	};
	const categoryLabels = {
		image: m["convert.dropdown.image"],
		audio: m["convert.dropdown.audio"],
		video: m["convert.dropdown.video"],
		doc: m["convert.dropdown.doc"],
	};
	const candidates = $derived.by(() => {
		const all = [
			...new Set(
				Object.values(categories)
					.flatMap((c) => c.formats)
					.filter((format) =>
						converters.some((converter) =>
							converter.supportedFormats.some(
								(f) => f.name === format && f.toSupported,
							),
						),
					),
			),
		];
		const legal = allowedFormats
			? all.filter((f) => allowedFormats.includes(f))
			: file
				? outputFormats(file, all)
				: all;
		return legal.filter(
			(format) =>
				!(
					categories.audio?.formats.includes(from ?? "") &&
					format === ".gif"
				),
		);
	});
	const availableCategories = $derived(
		Object.keys(categories).filter((key) =>
			categories[key].formats.some((f) => candidates.includes(f)),
		),
	);
	const activeCategory = $derived(
		availableCategories.includes(category)
			? category
			: availableCategories[0],
	);
	const normalizedQuery = $derived(
		query.trim().toLowerCase().replace(/^\./, ""),
	);
	const categoryFormats = $derived(
		candidates.filter((f) =>
			categories[activeCategory]?.formats.includes(f),
		),
	);
	const frequentFormats = $derived(
		commonFormatGroups
			.map(
				(group) =>
					group.find(
						(f) => f === selected && categoryFormats.includes(f),
					) ?? group.find((f) => categoryFormats.includes(f)),
			)
			.filter((f): f is string => !!f),
	);
	const otherFormats = $derived(
		categoryFormats.filter((f) => !frequentFormats.includes(f)),
	);
	const filtered = $derived.by(() => {
		if (!normalizedQuery)
			return frequentFormats.length ? frequentFormats : categoryFormats;
		return candidates
			.filter((f) => f.slice(1).includes(normalizedQuery))
			.sort(
				(a, b) =>
					Number(b.slice(1) === normalizedQuery) -
					Number(a.slice(1) === normalizedQuery),
			);
	});
	const canExpand = $derived(
		!normalizedQuery &&
			frequentFormats.length > 0 &&
			otherFormats.length > 0,
	);
	const visibleCount = $derived(
		filtered.length + (canExpand && expanded ? otherFormats.length : 0),
	);

	async function show() {
		if (disabled) return;
		query = "";
		category =
			availableCategories.find((key) =>
				categories[key].formats.includes(selected),
			) || availableCategories[0];
		// Keep an already selected uncommon extension visible when reopening.
		expanded =
			candidates.includes(selected) &&
			!frequentFormats.includes(selected);
		open = true;
		await tick();
		if (!open || !dialog?.isConnected) return;
		dialog.showModal();
		if (expanded)
			dialog
				.querySelector('.format-options button[aria-pressed="true"]')
				?.scrollIntoView({ block: "nearest", behavior: "instant" });
		if (!$isMobile) search?.focus();
	}
	function close() {
		dialog.close();
		open = false;
		trigger?.focus({ preventScroll: true });
	}
	function select(format: string) {
		if (disabled || !candidates.includes(format)) return;
		const changed = selected !== format;
		selected = format;
		if (file)
			dropdownStates.update((value) => ({
				...value,
				[file.name]: format,
			}));
		close();
		if (changed) onselect?.(format);
	}
	$effect(() => {
		if (!open) return;
		const viewport = window.visualViewport;
		const initialWidth = window.innerWidth;
		const position = () => {
			if (window.innerWidth !== initialWidth) {
				close();
				return;
			}
			const height = viewport?.height ?? window.innerHeight;
			dialog.style.maxHeight = `${Math.max(80, height - 24)}px`;
			const free = Math.max(
				12,
				height - dialog.getBoundingClientRect().height,
			);
			dialog.style.top = `${(viewport?.offsetTop ?? 0) + ($isMobile ? free - 8 : free / 2)}px`;
		};
		const observer = new ResizeObserver(position);
		observer.observe(dialog);
		viewport?.addEventListener("resize", position);
		viewport?.addEventListener("scroll", position);
		window.addEventListener("resize", position);
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			observer.disconnect();
			viewport?.removeEventListener("resize", position);
			viewport?.removeEventListener("scroll", position);
			window.removeEventListener("resize", position);
			document.body.style.overflow = overflow;
		};
	});
	$effect(() => {
		if (disabled && open) close();
	});
	$effect(() => {
		// A fresh search/category starts at the first match, even after the user
		// scrolled through a long expanded list. Reopening scrolls to selection.
		if (!normalizedQuery && !activeCategory) return;
		if (open && results) results.scrollTop = 0;
	});
	async function extract() {
		if (!file || extracting) return;
		const source = file;
		extracting = true;
		try {
			const { extractZip } = await import("$lib/util/zip");
			const entries = await extractZip(source.file);
			if (
				!entries.length ||
				!files.files.includes(source) ||
				source.processing ||
				source.queued
			)
				return;
			const added = entries.map(
				({ filename, data }) =>
					new VertFile(
						new File([new Uint8Array(data)], filename),
						filename.split(".").pop() ?? "",
					),
			);
			close();
			await files.remove(source);
			files.add(added);
		} catch (error) {
			ToastManager.add({
				type: "error",
				message: m["convert.archive_file.extract_error"]({
					filename: source.name,
					error: String(error),
				}),
			});
		} finally {
			extracting = false;
		}
	}
</script>

{#snippet options(formats: string[])}
	<div class="format-options">
		{#each formats as format}
			{@const purpose = purposeLabels[format]?.()}
			<button
				type="button"
				aria-label={format}
				aria-describedby={purpose
					? `${id}-purpose-${format}`
					: undefined}
				aria-pressed={format === selected}
				onclick={() => select(format)}
			>
				<span>{format}</span>
				{#if purpose}<small id={`${id}-purpose-${format}`}
						>{purpose}</small
					>{/if}
			</button>
		{:else}<p>
				{normalizedQuery
					? m["convert.dropdown.no_results"]()
					: m["convert.dropdown.no_formats"]()}
			</p>{/each}
	</div>
{/snippet}

<div class="pixel-format-selector" data-size={dropdownSize}>
	<button
		type="button"
		bind:this={trigger}
		{disabled}
		onclick={show}
		aria-label={`${m["pixel.output"]()}${selected ? `: ${formatLabel(selected)}` : ""}`}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-controls={id}
	>
		<span>{selected ? formatLabel(selected) : m["pixel.select"]()}</span
		><PixelIcon name="chevron" size={20} />
	</button>
	<dialog
		bind:this={dialog}
		{id}
		class="pixel-format-menu"
		onkeydown={(event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
			if (event.key === "Tab") {
				const controls = [
					...dialog.querySelectorAll<HTMLElement>(
						"button:enabled, input:enabled",
					),
				].filter((element) => element.getClientRects().length);
				const first = controls[0];
				const last = controls.at(-1);
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first?.focus();
				}
			}
		}}
		aria-label={m["pixel.output"]()}
		onclose={() => {
			// close() already restored focus. The native close event arrives
			// later, so it must not steal a subsequent focus or close a reopened menu.
			if (!open || dialog.open) return;
			open = false;
			trigger?.focus({ preventScroll: true });
		}}
		onclick={(event) => {
			if (event.target === dialog) {
				const r = dialog.getBoundingClientRect();
				if (
					event.clientX < r.left ||
					event.clientX > r.right ||
					event.clientY < r.top ||
					event.clientY > r.bottom
				)
					close();
			}
		}}
	>
		{#if open}
			<header>
				<strong>{m["pixel.output"]()}</strong><button
					type="button"
					onclick={close}
					aria-label={m["workspace.close"]()}
					><PixelIcon name="close" /></button
				>
			</header>
			<input
				bind:this={search}
				type="search"
				bind:value={query}
				placeholder={m["convert.dropdown.placeholder"]()}
				aria-label={m["convert.dropdown.placeholder"]()}
				autocomplete="off"
				onkeydown={(event) => {
					if (event.key === "Enter" && !event.isComposing) {
						event.preventDefault();
						if (filtered[0]) select(filtered[0]);
					}
				}}
			/>
			{#if !normalizedQuery}<div class="format-categories">
					{#each availableCategories as key}<button
							type="button"
							aria-pressed={activeCategory === key}
							onclick={() => {
								category = key;
								expanded = false;
							}}
							>{categoryLabels[
								key as keyof typeof categoryLabels
							]?.() || key}</button
						>{/each}
				</div>{/if}
			<p class="format-count" role="status">
				{normalizedQuery
					? m["workspace.matches"]({ count: filtered.length })
					: m["formats.shown"]({
							count: visibleCount,
							total: categoryFormats.length,
						})}
			</p>
			<div class="format-results" bind:this={results}>
				{#if !normalizedQuery && frequentFormats.length}<h3>
						{m["formats.common"]()}
					</h3>{/if}
				{@render options(filtered)}
				{#if canExpand}
					<button
						type="button"
						class="format-expand"
						aria-expanded={expanded}
						aria-controls={`${id}-other`}
						onclick={() => (expanded = !expanded)}
					>
						<span
							>{expanded
								? m["formats.collapse"]()
								: m["formats.expand"]({
										count: categoryFormats.length,
									})}</span
						>
						<span class:rotated={expanded}
							><PixelIcon name="chevron" size={20} /></span
						>
					</button>
					<div id={`${id}-other`} hidden={!expanded}>
						{#if expanded}<h3>{m["formats.other"]()}</h3>
							{@render options(otherFormats)}{/if}
					</div>
				{/if}
			</div>
			{#if file?.isZip()}<button
					class="format-extract"
					type="button"
					disabled={extracting}
					onclick={extract}
					>{m["convert.archive_file.extract"]()}</button
				>{/if}
		{/if}
	</dialog>
</div>

<style>
	.pixel-format-selector {
		width: 100%;
		min-width: 0;
	}
	.pixel-format-selector > button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		font: 600 15px/1.3 var(--font-body);
	}
	.pixel-format-selector > button span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	dialog.pixel-format-menu {
		position: fixed;
		inset: auto;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: 16px;
		width: min(540px, calc(100vw - 24px));
		max-width: none;
		border: 2px solid var(--pixel-line);
		border-radius: 0;
		background: var(--bg-panel);
		color: var(--fg);
		overflow: hidden;
		text-align: left;
		font: 400 15px/1.5 var(--font-body);
	}
	dialog.pixel-format-menu[open] {
		display: flex;
		flex-direction: column;
	}
	dialog > :not(.format-results) {
		flex-shrink: 0;
	}
	dialog::backdrop {
		background: #0008;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}
	header button {
		display: grid;
		place-items: center;
		width: 44px;
		min-height: 44px;
		border: 1px solid currentColor;
	}
	input {
		width: 100%;
		min-height: 44px;
		font-size: 16px;
		background: var(--bg-panel);
		color: var(--fg);
		border: 1px solid currentColor;
		padding: 10px;
	}
	.format-categories {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}
	.format-categories button {
		padding: 8px;
		min-height: 44px;
	}
	.format-count {
		margin: 12px 0 8px;
		font-size: 13px;
	}
	.format-options {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.format-results {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 4px;
		margin: -4px;
	}
	h3 {
		font: 600 13px/1.4 var(--font-body);
		margin: 0 0 8px;
	}
	.format-options button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-height: 44px;
		padding: 10px;
		border: 1px solid var(--pixel-line);
		overflow-wrap: anywhere;
		text-align: left;
	}
	.format-options button > span {
		font-weight: 600;
	}
	.format-options small {
		font: 400 12px/1.45 var(--font-body);
	}
	.format-expand {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		margin: 12px 0;
		padding: 8px 0;
		border-block: 1px solid var(--pixel-line);
		text-align: left;
		font-weight: 600;
	}
	.rotated {
		transform: rotate(180deg);
	}
	@media (max-width: 520px) {
		.format-options {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.format-options > p {
		grid-column: 1 / -1;
	}
	button[aria-pressed="true"] {
		background: var(--pixel-peach);
		color: #171e20;
	}
	.format-extract {
		margin-top: 12px;
		min-height: 44px;
		width: 100%;
		border: 1px solid currentColor;
	}
	dialog button:focus-visible,
	dialog input:focus-visible {
		outline: 3px solid var(--fg-accent) !important;
		outline-offset: 2px;
	}
</style>
