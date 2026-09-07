<script lang="ts" module>
	import type { VertFile } from "$lib/types";
	// Keep chosen targets when routes or locale changes remount the workspace.
	const initialized = new WeakSet<VertFile>();
</script>

<script lang="ts">
	import { tick } from "svelte";
	import { categories, converters } from "$lib/converters";
	import {
		files,
		vertdLoaded,
		dropdownStates,
		isMobile,
	} from "$lib/store/index.svelte";
	import { Settings } from "$lib/sections/settings/index.svelte";
	import { m } from "$lib/paraglide/messages";
	import { ToastManager } from "$lib/util/toast.svelte";
	import FormatDropdown from "$lib/components/functional/FormatDropdown.svelte";
	import PixelFile from "./PixelFile.svelte";
	import PixelIcon from "./PixelIcon.svelte";
	import AddFiles from "./AddFiles.svelte";
	import ProjectLinks from "./ProjectLinks.svelte";
	import PrivacyStatus from "./PrivacyStatus.svelte";
	import ImpactSummary from "./ImpactSummary.svelte";
	import ImageQuality from "./ImageQuality.svelte";
	import {
		fileIssue,
		formatLabel,
		formatSize,
		summarizeQueue,
		queueStatus,
	} from "./presentation";
	import {
		commonOutputFormats,
		outputFormats,
	} from "$lib/util/output-formats";

	let downloading = $state(false);
	let actionBar = $state<HTMLDivElement>();
	const summary = $derived(summarizeQueue(files.files, $vertdLoaded));
	const length = $derived(files.files.length);
	const size = $derived(
		files.files.reduce((total, file) => total + file.file.size, 0),
	);
	const processing = $derived(summary.running > 0);
	const completed = $derived(summary.groups.complete.length);
	const allCandidates = Object.values(categories).flatMap(
		(category) => category.formats,
	);
	const commonFormats = $derived(
		commonOutputFormats(files.files, allCandidates),
	);
	const sameConverters = $derived(
		length > 0 &&
			files.files.every(
				(file) =>
					file.converters.length > 0 &&
					file.converters.map((c) => c.name).join() ===
						files.files[0].converters.map((c) => c.name).join(),
			),
	);
	let selected = $derived(
		length > 0 && files.files.every((file) => file.to === files.files[0].to)
			? files.files[0].to
			: "",
	);
	const canSetAll = $derived(sameConverters && commonFormats.length > 0);
	const downloadLabel = $derived(
		completed === 1
			? m["workspace.download_one"]({
					format: formatLabel(summary.groups.complete[0].result!.to),
				})
			: m["workspace.download_many"]({ count: completed }),
	);
	const actionLabel = $derived(
		summary.action === "download"
			? downloadLabel
			: summary.action === "running"
				? m["pixel.processing"]()
				: summary.action === "failed"
					? m["workspace.retry"]({ count: summary.targets.length })
					: summary.action === "cancelled"
						? m["workspace.resume"]({
								count: summary.targets.length,
							})
						: summary.action === "pending"
							? m["pixel.convert"]({
									count: summary.targets.length,
								})
							: m["workspace.blocked_action"](),
	);
	$effect(() => {
		if (!actionBar || !$isMobile || !length) return;
		const root = document.documentElement;
		const measure = () =>
			root.style.setProperty(
				"--workspace-action-height",
				`${actionBar!.getBoundingClientRect().height}px`,
			);
		const observer = new ResizeObserver(measure);
		observer.observe(actionBar);
		measure();
		return () => {
			observer.disconnect();
			root.style.removeProperty("--workspace-action-height");
		};
	});
	const allImageOutputs = $derived(
		length > 0 &&
			files.files.every((file) =>
				["imagemagick", "pdf"].includes(
					file.findConverter()?.name ?? "",
				),
			),
	);
	const allImages = $derived(
		length > 0 &&
			files.files.every(
				(file) => file.findConverter()?.name === "imagemagick",
			),
	);
	const hasServer = $derived(
		files.files.some((file) => file.findConverter()?.name === "vertd"),
	);
	const hasUnknown = $derived(
		files.files.some((file) => !file.findConverter()),
	);
	const formatGroups = $derived([
		{
			name: m["upload.cards.images"](),
			icon: "picture" as const,
			converter: converters.find((c) => c.name === "imagemagick"),
		},
		{
			name: m["upload.cards.audio"](),
			icon: "music" as const,
			converter: converters.find((c) => c.name === "ffmpeg"),
		},
		{
			name: m["upload.cards.documents"](),
			icon: "file" as const,
			converter: converters.find((c) => c.name === "pandoc"),
		},
		{
			name: m["pdf_conversion.group"](),
			icon: "file" as const,
			converter: converters.find((c) => c.name === "pdf"),
		},
		...(converters.some(
			(converter) => converter.processingLocation === "remote",
		)
			? [
					{
						name: m["upload.cards.video"](),
						icon: "video" as const,
						converter: converters.find((c) => c.name === "vertd"),
					},
				]
			: []),
	]);

	$effect(() => {
		for (const file of files.files) {
			if (initialized.has(file)) continue;
			const converter =
				file.converters.find((c) =>
					c.supportedFormats.some(
						(f) => f.name === file.from && f.fromSupported,
					),
				) || (file.isZip() ? file.converters[0] : undefined);
			if (!converter) continue;
			const category = ["imagemagick", "pdf"].includes(converter.name)
				? "image"
				: converter.name === "ffmpeg"
					? "audio"
					: converter.name === "vertd"
						? "video"
						: "doc";
			const legal = outputFormats(file, categories[category].formats);
			const config = Settings.instance.settings;
			const saved = $dropdownStates[file.name];
			const preferred =
				config.defaultFormat[
					category === "doc" ? "document" : category
				];
			const target =
				saved && saved !== file.from && legal.includes(saved)
					? saved
					: config.useDefaultFormat &&
						  preferred !== file.from &&
						  legal.includes(preferred)
						? preferred
						: legal.find((format) => format !== file.from);
			if (target) file.to = target;
			initialized.add(file);
		}
	});

	function setAll(format: string) {
		if (processing || !canSetAll || !commonFormats.includes(format)) return;
		for (const file of files.files) file.setTarget(format);
	}
	async function clearQueue() {
		await files.clear();
		await tick();
		document
			.querySelector<HTMLButtonElement>(".pixel-empty-state .pixel-add")
			?.focus({ preventScroll: true });
	}
	async function runBatch(targets: readonly VertFile[] = summary.targets) {
		if (processing || downloading) return;
		try {
			await files.convertAll(
				targets.filter((file) => !fileIssue(file, $vertdLoaded)),
			);
		} catch (error) {
			ToastManager.add({
				type: "error",
				message: `${m["pixel.failed"]()} ${String(error)}`,
			});
		}
	}
	async function downloadBatch() {
		if (downloading || files.downloading) return;
		const available = summary.groups.complete;
		if (!available.length) return;
		downloading = true;
		try {
			if (available.length === 1) await available[0].download();
			else await files.downloadAll();
		} catch (error) {
			ToastManager.add({
				type: "error",
				message: m["workspace.download_error"]({
					error: String(error),
				}),
			});
		} finally {
			downloading = false;
		}
	}

	function saveSettings() {
		try {
			Settings.instance.save();
		} catch {
			ToastManager.add({
				type: "error",
				message: m["pixel.save_failed"](),
			});
		}
	}
</script>

<div class="pixel-workspace workspace-compact" class:empty={length === 0}>
	<section class="pixel-files-area" aria-label={m["pixel.queue"]()}>
		<div class="pixel-workspace-heading" class:has-files={length > 0}>
			<h1>{length ? m["pixel.queue"]() : m["pixel.workspace"]()}</h1>
			<span
				>{m["pixel.count"]({ count: length })}{#if length}
					<span aria-hidden="true">·</span>
					{formatSize(size)}{/if}</span
			>
			{#if length > 0}
				<button
					class="pixel-clear"
					disabled={processing}
					onclick={clearQueue}
				>
					<PixelIcon name="trash" size={22} />
					<span>{m["convert.panel.remove_all"]()}</span>
					<span class="pixel-clear-count" aria-hidden="true"
						>{length}</span
					>
				</button>
			{/if}
		</div>
		<PrivacyStatus />
		{#if length}
			<div class="pixel-files-grid">
				{#each files.files as file (file.id)}<PixelFile {file} />{/each}
			</div>
			<div class="pixel-add-row">
				<AddFiles />
				<p>{m["pixel.drop"]()}</p>
			</div>
		{:else}
			<div class="pixel-empty-state">
				<div class="pixel-empty-files" aria-hidden="true">
					{#each ["PNG", "MP3", "DOC"] as format}<div
							class="pixel-empty-document"
						>
							<img src="/pixel-file-frame.png" alt="" /><span
								>{format}</span
							>
						</div>{/each}
				</div>
				<h2>{m["pixel.empty_title"]()}</h2>
				<p>{m["pixel.empty_body"]()}</p>
				<AddFiles /><span class="pixel-empty-drop"
					>{m["pixel.drop"]()}</span
				>
			</div>
			<details class="pixel-formats">
				<summary
					><PixelIcon name="folder" />{m[
						"pixel.supported"
					]()}<PixelIcon name="chevron" /></summary
				>
				<div class="pixel-format-groups">
					{#each formatGroups as group}<section>
							<h3><PixelIcon name={group.icon} />{group.name}</h3>
							<p>
								{group.converter?.supportedFormats
									.map(
										(format) =>
											`${format.name}${format.fromSupported && format.toSupported ? "" : "*"}`,
									)
									.join(", ")}
							</p>
						</section>{/each}
				</div>
				<p class="pixel-format-hint">{m["pixel.partial_formats"]()}</p>
			</details>
			<ProjectLinks />
		{/if}
	</section>
	<aside class="pixel-output" aria-label={m["pixel.output"]()}>
		<div class="pixel-output-heading">
			<span class="pixel-type">OUTPUT</span><span aria-hidden="true"
				>/</span
			>
			<h2>{m["pixel.output"]()}</h2>
		</div>
		{#if length}
			<div class="workspace-actions" bind:this={actionBar}>
				<div class="action-format">
					<span class="action-label">{m["pixel.output"]()}</span>
					{#if canSetAll}<div class="pixel-batch-format">
							<FormatDropdown
								{categories}
								{selected}
								allowedFormats={commonFormats}
								dropdownSize="small"
								disabled={processing}
								onselect={setAll}
							/>
						</div>
					{:else}<span class="action-mixed"
							>{m["workspace.separate"]()}</span
						>{/if}
				</div>
				<button
					class="pixel-button pixel-convert"
					disabled={processing ||
						downloading ||
						files.downloading ||
						summary.action === "blocked"}
					onclick={() =>
						summary.action === "download"
							? downloadBatch()
							: runBatch()}
				>
					<span
						>{downloading || files.downloading
							? m["workspace.preparing"]()
							: actionLabel}</span
					><PixelIcon
						name={processing
							? "loader"
							: summary.action === "download"
								? "download"
								: "arrow"}
						size={24}
					/>
				</button>
				{#if completed && summary.action !== "download"}<button
						class="workspace-partial"
						disabled={downloading || files.downloading}
						onclick={downloadBatch}
						><PixelIcon
							name="download"
							size={18}
						/>{downloadLabel}</button
					>{/if}
				<a class="bar-settings" href="#workspace-settings"
					>{m["pixel.settings"]()}
					<PixelIcon name="sliders" size={16} /></a
				>
			</div>
			<p class="workspace-summary">{queueStatus(summary)}</p>
		{:else}<p class="pixel-output-applies">
				{m["pixel.empty_output"]()}
			</p>{/if}
		<div id="workspace-settings" class="workspace-settings-anchor"></div>

		{#if allImageOutputs}
			<ImageQuality
				bind:settings={Settings.instance.settings}
				pdfImages={files.files.some((file) => file.from === ".pdf")}
				disabled={processing}
				onchange={saveSettings}
			/>
		{/if}
		<details class="pixel-output-settings">
			<summary
				><PixelIcon name="sliders" />{m["pixel.settings"]()}<PixelIcon
					name="chevron"
				/></summary
			>
			<div>
				<label class="pixel-metadata"
					><input
						type="checkbox"
						checked={Settings.instance.settings.metadata}
						disabled={processing}
						onchange={(e) => {
							Settings.instance.settings.metadata =
								e.currentTarget.checked;
							saveSettings();
						}}
					/><span>{m["pixel.metadata"]()}</span></label
				>
				<a href="/settings/"
					>{m["pixel.details"]()}<PixelIcon
						name="arrow"
						size={18}
					/></a
				>
			</div>
		</details>
		<p class="workspace-settings-note">
			{m["workspace.next_conversion"]()}
		</p>
		{#if completed && !processing}
			<details class="workspace-reconvert">
				<summary>{m["pixel.reconvert"]()}</summary>
				<p>{m["workspace.replace_results"]()}</p>
				<button
					class="pixel-reconvert"
					disabled={downloading || files.downloading}
					onclick={() => runBatch(files.files)}
					>{m["workspace.reconvert_all"]()}</button
				>
			</details>
		{/if}
		{#if summary.blocked.length}<p class="pixel-output-notice">
				{fileIssue(summary.blocked[0], $vertdLoaded)}
			</p>{/if}

		<p class="pixel-privacy">
			<PixelIcon name={hasServer ? "server" : "monitor"} size={30} /><span
				>{hasServer
					? m["pixel.server_task"]()
					: allImages
						? m["pixel.local_images"]({ count: length })
						: length && !hasUnknown
							? m["pixel.local"]()
							: m["pixel.local_types"]()}</span
			>
		</p>
		<ImpactSummary />
	</aside>
</div>
