<script lang="ts">
	import {
		failureMessage,
		commandError,
		taskReadiness,
		type EngineStatus,
		type Failure,
	} from "./platform/runtime";
	import { submissionItems } from "./platform/queue-contract";
	import { onMount, tick } from "svelte";
	import { listen } from "@tauri-apps/api/event";
	import OptionsEditor from "./OptionsEditor.svelte";
	import ImportNotice from "./ImportNotice.svelte";
	import Diagnostics from "./Diagnostics.svelte";
	import Impact from "./Impact.svelte";
	import Licenses from "./Licenses.svelte";
	import { localProcessing, resultNote } from "./platform/impact";
	import {
		createPreview,
		emptyPreview,
		previewable,
		previewPresentation,
	} from "./platform/preview";
	import { invoke, isTauri } from "@tauri-apps/api/core";
	import PixelIcon from "../../src/lib/components/pixel/PixelIcon.svelte";
	import type {
		Snapshot,
		Task,
		Format,
		Phase,
		Submission,
		Options,
	} from "./platform/queue-contract";
	import {
		queueCommand,
		queueTransport,
		preferenceTransport,
	} from "./platform/tauri";
	import { connectQueue } from "./platform/queue-sync";
	import {
		createPreferences,
		initialPreferences,
		preferenceLanguage,
		type Preferences,
		type Language,
	} from "./platform/preferences";
	type Info = {
		processing_location?: string;
		preparing: boolean;
		startup: EngineStatus[];
		pending_imports: number;
		import_failure: Failure | null;
		workspace_error: string | null;
		temporary_cleanup: {
			removed: number;
			deferred: number;
			failed: number;
			limited: boolean;
		} | null;
		architecture: string;
		engines: {
			id: string;
			version: string;
			development: boolean;
			available: boolean;
			error: string | null;
		}[];
		error: string | null;
		queue_error: string | null;
	};
	let info = $state<Info | null>(null);
	let queueState = $state<Snapshot | null>(null);
	let preview = $state(emptyPreview());
	const previews = createPreview(
		(id) => invoke("preview_input", { id }),
		(value) => {
			preview = value;
		},
	);
	async function closePreview() {
		const id = preview.id;
		const rendering = preview.busy;
		previews.clear();
		if (rendering && queueState?.processing && id)
			await action("cancel_tasks", { ids: [id] });
	}

	let busy = $state(false);
	let error = $state("");
	let connectionError = $state("");
	let preferences = $state(initialPreferences());
	let systemLanguages = $state<string[]>([]);
	const english = $derived(
		preferenceLanguage(preferences.draft.language, systemLanguages) ===
			"en",
	);
	let preferenceConnection: ReturnType<typeof createPreferences> | undefined;
	function savePreferences(patch: Partial<Preferences>) {
		void preferenceConnection?.save({ ...preferences.draft, ...patch });
	}
	$effect(() => {
		document.documentElement.lang = english ? "en" : "zh-Hans";
	});
	let connection: ReturnType<typeof connectQueue> | undefined;
	let pending: Submission | undefined;
	const batchFormat = $derived(preferences.draft.batch_format);
	const batchOptions = $derived(preferences.draft.batch_options);
	const batchTasks = $derived(
		queueState?.tasks.filter((t) => t.formats.includes(batchFormat)) ?? [],
	);
	const allFormats: Format[] = [
		"png",
		"jpeg",
		"webp",
		"avif",
		"wav",
		"mp3",
		"flac",
		"opus",
		"m4a",
		"txt",
	];
	async function configure(ids: string[], options: Options, format?: Format) {
		pending = undefined;
		await action("configure_tasks", {
			ids,
			options,
			format: format ?? null,
		});
	}
	async function reveal(id: string, page: number) {
		busy = true;
		error = "";
		try {
			await invoke("reveal_result", { id, page });
		} catch (e) {
			error = String(e);
		} finally {
			busy = false;
		}
	}
	function comparison(task: Task) {
		if (!task.result?.complete || task.phase !== "saved") return "";
		const delta = task.result.bytes - task.bytes;
		const percent = task.bytes
			? ` (${((Math.abs(delta) / task.bytes) * 100).toFixed(1)}%)`
			: "";
		return delta === 0
			? t("体积相同", "Same size")
			: `${delta < 0 ? t("减少", "Smaller by") : t("增加", "Larger by")} ${size(Math.abs(delta))}${percent}`;
	}
	const t = (zh: string, en: string) => (english ? en : zh);
	const working = $derived(
		busy ||
			preview.busy ||
			!!queueState?.processing ||
			!!queueState?.clearing ||
			!!queueState?.closing,
	);
	const blocked = $derived(
		!queueState ||
			!!info?.error ||
			!!info?.queue_error ||
			!!queueState?.persistence_error ||
			!!connectionError,
	);
	const eligible = $derived(
		queueState?.tasks.filter(
			(task) =>
				(task.authorized || task.phase === "awaiting_save") &&
				!["queued", "running", "saving", "saved"].includes(
					task.phase,
				) &&
				taskReadiness(task, info?.startup ?? []) === "ready",
		) ?? [],
	);
	function size(bytes: number) {
		return bytes < 1024
			? `${bytes} B`
			: bytes < 1048576
				? `${(bytes / 1024).toFixed(1)} KB`
				: `${(bytes / 1048576).toFixed(1)} MB`;
	}
	function label(phase: Phase) {
		const labels: Record<Phase, [string, string]> = {
			ready: ["待转换", "Ready"],
			queued: ["排队中", "Queued"],
			running: [
				"转换、验证并保存中…",
				"Converting, validating and saving…",
			],
			saving: ["正在保存已有结果…", "Saving converted result…"],
			awaiting_save: ["转换完成 · 等待保存", "Converted · awaiting save"],
			saved: ["已保存", "Saved"],
			failed: ["失败", "Failed"],
			cancelled: ["已取消", "Cancelled"],
			interrupted: ["上次运行已中断", "Interrupted"],
			partial: [
				"部分完成 · 成功页已保留",
				"Partially complete · saved pages retained",
			],
		};
		return labels[phase][english ? 1 : 0];
	}
	function apply(next: Snapshot) {
		if (
			preview.id &&
			(next.epoch !== queueState?.epoch ||
				!next.tasks.some(
					(task) => task.id === preview.id && task.authorized,
				))
		)
			previews.clear();
		if (!queueState || next.revision >= queueState.revision)
			queueState = next;
		connectionError = "";
		if (pending && pending.epoch !== next.epoch) pending = undefined;
	}
	async function action(command: string, args?: Record<string, unknown>) {
		const focused = document.activeElement;
		if (command === "pick_inputs" || command === "remove_tasks")
			previews.clear();
		busy = true;
		error = "";
		try {
			apply(await queueCommand(command, args));
		} catch (e) {
			error = String(e);
		} finally {
			busy = false;
			await tick();
			if (
				command === "remove_tasks" &&
				focused instanceof HTMLButtonElement &&
				(!focused.isConnected || focused.disabled)
			) {
				document
					.querySelector<HTMLButtonElement>("[data-choose-files]")
					?.focus();
			}
		}
	}
	async function startConversion() {
		if (working || blocked || !eligible.length) return;
		if (!queueState?.output_authorized) {
			pending = undefined;
			busy = true;
			error = "";
			try {
				apply(await queueCommand("pick_output"));
			} catch (e) {
				error = String(e);
				return;
			} finally {
				busy = false;
			}
		}
		// Cancellation grants no permission. Recheck live state after the dialog:
		// imports, shutdown or queue events may have changed the available tasks.
		if (working || blocked || !queueState?.output_authorized) return;
		await submit(eligible);
	}
	async function submit(tasks: Task[]) {
		if (!queueState || !tasks.length) return;
		// Keep an ambiguous request's ID for a transport retry. It cannot start a second run.
		const items = submissionItems(tasks);
		if (
			!pending ||
			pending.epoch !== queueState.epoch ||
			JSON.stringify(pending.items) !== JSON.stringify(items)
		)
			pending = {
				epoch: queueState.epoch,
				request_id: crypto.randomUUID(),
				items,
			};
		busy = true;
		error = "";
		try {
			apply(await queueCommand("submit_batch", { request: pending }));
			pending = undefined;
		} catch (e) {
			error = String(e);
			await reconnect();
		} finally {
			busy = false;
		}
	}
	async function reconnect() {
		try {
			await connection?.refresh();
		} catch (e) {
			connectionError = String(e);
		}
	}
	function formatChanged(id: string, format: string) {
		pending = undefined;
		void action("set_task_format", { id, format: format as Format });
	}
	let refreshingInfo: Promise<void> | undefined;
	let refreshAgain = false;
	let mounted = true;
	function refreshInfo(): Promise<void> {
		refreshAgain = true;
		if (refreshingInfo) return refreshingInfo;
		refreshingInfo = (async () => {
			while (mounted && refreshAgain) {
				refreshAgain = false;
				const value = await invoke<Info>("desktop_info");
				if (mounted) info = value;
			}
		})().finally(() => {
			refreshingInfo = undefined;
		});
		return refreshingInfo;
	}
	onMount(() => {
		systemLanguages = [...navigator.languages];
		if (!isTauri()) {
			error =
				"此页面需要在桌面程序中打开 / Open this page in the desktop application.";
			return;
		}
		preferenceConnection = createPreferences(
			preferenceTransport,
			(state) => {
				preferences = state;
			},
		);
		void preferenceConnection.load();
		let disposed = false;
		let unlistenImport: (() => void) | undefined;
		let unlistenStartup: (() => void) | undefined;
		void listen("desktop-startup-changed", () => {
			void refreshInfo()
				.then(() => reconnect())
				.catch(() => {});
		}).then((f) => {
			if (disposed) f();
			else unlistenStartup = f;
		});
		void listen<string>("desktop-import-error", (event) => {
			if (!disposed) error = event.payload;
		})
			.then((unlisten) => {
				if (disposed) unlisten();
				else unlistenImport = unlisten;
			})
			.catch((e) => {
				if (!disposed) error = String(e);
			});
		connection = connectQueue(queueTransport, apply, (e) => {
			connectionError = String(e);
		});
		void connection.ready.catch((e) => {
			if (!disposed) connectionError = String(e);
		});
		void refreshInfo().catch((e) => {
			if (!disposed) error = String(e);
		});
		const timer = setInterval(() => {
			void refreshInfo()
				.then(() => reconnect())
				.catch(() => {});
		}, 1000);
		window.addEventListener("focus", reconnect);
		return () => {
			disposed = true;
			mounted = false;
			unlistenStartup?.();
			preferenceConnection?.dispose();
			previews.dispose();
			connection?.dispose();
			unlistenImport?.();
			clearInterval(timer);
			window.removeEventListener("focus", reconnect);
		};
	});
	$effect(() => {
		document.documentElement.lang = english ? "en" : "zh-Hans";
	});
</script>

<div class="pixel-app desktop-shell">
	<a class="skip-link" href="#conversion-workspace"
		>{t("跳到转换工作区", "Skip to conversion workspace")}</a
	>
	<header class="desktop-header">
		<div class="brand">
			<PixelIcon name="box" size={30} /><strong>Z8.Work</strong><span
				>{t("桌面版", "DESKTOP")}</span
			>
		</div>
		<label class="language"
			><PixelIcon name="globe" size={20} /><select
				aria-label="Language / 语言"
				value={preferences.draft.language}
				disabled={preferences.busy || !preferences.record}
				onchange={(e) =>
					savePreferences({
						language: e.currentTarget.value as Language,
					})}
				><option value="system"
					>{t("跟随系统", "System language")}</option
				>
				<option value="zh_hans">简体中文</option><option value="en"
					>English</option
				></select
			></label
		>
	</header>
	<main>
		<div class="intro">
			<p class="eyebrow">
				{t("在此设备处理", "PROCESSED ON THIS DEVICE")}
			</p>
			<h1>{t("本地多文件转换处理工具", "Your local file workspace")}</h1>
			<p>
				{t(
					"由本机原生引擎处理，刷新界面也不会丢失正在执行的队列。",
					"Native conversion on your computer. Your queue continues when the interface reloads.",
				)}
			</p>
		</div>
		<details class="privacy" data-privacy>
			<summary
				><PixelIcon name="shield" size={18} />{localProcessing(
					info?.processing_location,
					queueState?.tasks ?? [],
				)
					? t(
							"在此设备处理 · 文件上传 0 B",
							"Processed on this device · File uploads 0 B",
						)
					: t(
							"正在确认本地处理能力",
							"Confirming local processing capability",
						)}<PixelIcon
					name="chevron"
					size={18}
					class="privacy-chevron"
				/></summary
			>
			<p>
				{t(
					"文件由本机原生引擎读取和转换，不上传进行处理。0 B 是已确认本地转换路线的能力声明，不是实时网络流量表，也不包含操作系统、云同步文件夹或其他应用的网络活动。",
					"Native engines read and convert files on this device without uploading them for processing. 0 B describes confirmed local conversion routes; it is not a live network meter and excludes the operating system, cloud-synced folders and other applications.",
				)}
			</p>
			<p>
				{t(
					"转换和此处说明可离线使用。仅在你打开来源链接时，系统浏览器会访问外部网站；网站可获知 IP 地址。此开发版没有应用内自动更新；商店或系统的更新流量单独发生，不属于文件转换上传。",
					"Conversion and these explanations work offline. Opening a source link sends your system browser to an external website, which can see your IP address. This development build has no in-app automatic updater; store or system update traffic is separate from file conversion uploads.",
				)}
			</p>
		</details>
		<aside class="prototype">
			<PixelIcon name="info" size={22} />
			<div>
				<strong
					>{t(
						"开发原型 · 尚未达到发行条件",
						"Development prototype · not release ready",
					)}</strong
				>
				<p>
					{t(
						"图片只转换首帧，PNG 保持无损、JPEG 使用白色背景。PDF 逐页导出，最多 200 页、每页 4000 × 4000 像素；音频支持 5 种输出。文档仅提取纯文本。输出可能变大。引擎加载状态见下方。",
						"Images: first frame, lossless PNG, white JPEG background. PDF: all pages, up to 200 pages and 4000 × 4000 pixels per page. Five audio outputs. Documents: text only. Output may grow. See engine status below.",
					)}
				</p>
			</div>
		</aside>
		{#if !info || info.preparing || info.startup.some((s) => s.phase === "preparing")}
			<p role="status" data-startup>
				{t(
					"正在准备本机引擎，已就绪格式可先使用。可以选择文件或拖放到窗口。",
					"Preparing native engines. Ready formats can be used now; choose files or drop them into the window.",
				)}
			</p>
		{/if}
		{#if info?.pending_imports}<p role="status" data-pending-imports>
				{t("等待导入：", "Waiting to import: ")}{info.pending_imports}
			</p>{/if}
		{#if info?.import_failure}<p role="alert">
				{failureMessage(info.import_failure, english)}
			</p>{/if}
		{#if queueState?.import_report}
			<ImportNotice
				report={queueState.import_report}
				{english}
				ondismiss={(id) => action("dismiss_import_report", { id })}
			/>
		{/if}
		{#if preferences.error}<div
				class="error"
				role="alert"
				data-preference-error
			>
				<p>
					{preferences.pending
						? t(
								"偏好尚未保存，本次选择仅在当前窗口有效。",
								"Preferences were not saved. This choice only applies to this window.",
							)
						: t(
								"无法读取桌面偏好，原记录已保留。转换仍可继续。",
								"Desktop preferences could not be read. The original record is preserved; conversion can continue.",
							)}
				</p>

				{#if preferences.pending}<button
						disabled={preferences.busy}
						onclick={() =>
							preferenceConnection?.save(preferences.draft)}
						>{t("重试保存偏好", "Retry saving preferences")}</button
					>{/if}
				<button
					disabled={preferences.busy}
					onclick={() => preferenceConnection?.load()}
					>{t(
						"重新读取已保存偏好",
						"Reload saved preferences",
					)}</button
				>
			</div>{/if}
		{#if queueState?.recovery_notice}<p class="recovery" role="status">
				{t(
					"已恢复本地任务记录。重试前请重新选择输入文件与保存目录；中断任务不会自动运行，请先检查目录是否已有结果。",
					"Local history restored. Choose files and a save folder again before retrying. Interrupted tasks never restart automatically; check the folder for existing results first.",
				)}
			</p>{/if}
		{#if info?.workspace_error}
			<div class="error" role="alert" data-workspace-error>
				<p>
					{t(
						"临时工作目录不可用，暂时无法预览或转换。请检查缓存目录的权限和磁盘空间后重启。",
						"The temporary workspace is unavailable. Check cache permissions and free disk space, then restart to preview or convert.",
					)}
				</p>
			</div>
		{/if}
		{#if info?.temporary_cleanup && (info.temporary_cleanup.removed || info.temporary_cleanup.deferred || info.temporary_cleanup.failed || info.temporary_cleanup.limited)}
			<p class="recovery" role="status" data-workspace-cleanup>
				{t(
					"上次检查已清理的临时会话：",
					"Temporary sessions removed at last check: ",
				)}{info.temporary_cleanup.removed}.
				{#if info.temporary_cleanup.deferred}
					{t(
						"部分残留仍在等待，至少一分钟后的下次启动或任务会再次检查。",
						"Some leftovers are waiting. They will be checked at the next launch or task after at least one minute.",
					)}
				{/if}
				{#if info.temporary_cleanup.failed || info.temporary_cleanup.limited}
					{t(
						"部分临时目录尚未清理，将在下次启动或任务时重试。",
						"Some temporary folders remain; cleanup will retry at the next launch or task.",
					)}
				{/if}
			</p>
		{/if}
		{#if error || info?.error || info?.queue_error}<p
				class="error"
				role="alert"
			>
				{commandError(
					error || info?.error || info?.queue_error,
					english,
				)}
			</p>{/if}
		{#if connectionError && connectionError !== "Z8:preparing"}<p
				class="error"
				role="alert"
			>
				{commandError(connectionError, english)}
			</p>
			<button onclick={reconnect}
				>{t("重新同步队列", "Reconnect queue")}</button
			>{/if}
		{#if queueState?.persistence_error}<p class="error" role="alert">
				{t(
					"任务记录保存失败，后续转换已暂停。已生成的文件会保留。",
					"History could not be saved. Further conversions are paused; generated files are preserved.",
				)}
			</p>
			<button
				disabled={busy}
				onclick={() => action("retry_queue_history")}
				>{t("重试保存记录", "Retry saving history")}</button
			>{/if}
		<section
			id="conversion-workspace"
			tabindex="-1"
			class="workspace"
			aria-label={t("转换工作区", "Conversion workspace")}
		>
			<div class="toolbar">
				<button
					data-choose-files
					class="primary"
					onclick={() => {
						pending = undefined;
						void action("pick_inputs", { restoreId: null });
					}}
					disabled={working || !!info?.queue_error}
					><PixelIcon name="plus" />{t(
						"选择文件",
						"Choose files",
					)}</button
				>
				<button
					onclick={() => {
						pending = undefined;
						void action("pick_output");
					}}
					disabled={working || blocked}
					><PixelIcon name="folder" />{t(
						"选择保存目录",
						"Save folder",
					)}</button
				>
				<button
					class="danger"
					onclick={() => {
						pending = undefined;
						void action("remove_tasks", { ids: [] });
					}}
					disabled={busy ||
						!queueState?.tasks.length ||
						!!queueState?.clearing ||
						!!queueState?.closing}
					><PixelIcon name="trash" />{queueState?.clearing
						? t("正在取消并清理…", "Cancelling and clearing…")
						: t("清空文件列表", "Clear file list")}</button
				>
			</div>
			<p class="output">
				{t("保存到：", "Save to: ")}{queueState?.output ??
					t(
						"尚未选择",
						"Choose a folder",
					)}{#if queueState?.output && !queueState.output_authorized}
					· {t(
						"需要重新选择目录授权",
						"Choose the folder again to authorize",
					)}{/if}
			</p>
			<details class="batch-settings">
				<summary>{t("批量设置", "Batch settings")}</summary>
				<label
					>{t("目标格式", "Output format")}<select
						value={batchFormat}
						onchange={(e) =>
							savePreferences({
								batch_format: e.currentTarget.value as Format,
							})}
						disabled={working ||
							blocked ||
							preferences.busy ||
							!preferences.record}
						>{#each allFormats as format}<option value={format}
								>{format.toUpperCase()}</option
							>{/each}</select
					></label
				>
				{#if ["png", "jpeg", "webp", "avif"].includes(batchFormat)}<OptionsEditor
						options={batchOptions}
						{english}
						pdf={true}
						disabled={working ||
							blocked ||
							preferences.busy ||
							!preferences.record}
						onchange={(value) =>
							savePreferences({ batch_options: value })}
					/>{/if}
				<button
					disabled={working ||
						blocked ||
						preferences.busy ||
						!batchTasks.length}
					onclick={() =>
						configure(
							batchTasks.map((t) => t.id),
							batchOptions,
							batchFormat,
						)}
					>{t("应用到", "Apply to")}
					{batchTasks.length}
					{t("个兼容文件", "compatible files")}</button
				>
			</details>
			{#if !queueState?.tasks.length}<div class="empty">
					<PixelIcon name="file" size={44} />
					<h2>
						{t("从几个小文件开始", "Start with a few small files")}
					</h2>
					<p>
						PNG / JPEG / WebP / AVIF / HEIC · PDF · MP3 / WAV / FLAC
						/ OGG / M4A / OPUS · MP4 / MOV / MKV / WebM → Audio ·
						Markdown / DOCX
					</p>
					<p>
						{t(
							"支持拖入文件 · 每个文件最多 512 MiB（PDF 100 MiB）· 不覆盖已有文件",
							"Drop files here · Up to 512 MiB per file (PDF: 100 MiB) · Existing files are preserved",
						)}
					</p>
				</div>
			{:else}
				<ul class="file-list">
					{#each queueState.tasks as task (task.id)}
						{@const previewDetails = previewPresentation(
							task.name,
							english,
						)}
						<li data-task-id={task.id} data-phase={task.phase}>
							<div class="file-heading">
								<PixelIcon name="file" /><strong
									>{task.name}</strong
								><span>{size(task.bytes)}</span><select
									aria-label={`${task.name} ${t("输出格式", "output format")}`}
									value={task.format}
									onchange={(e) =>
										formatChanged(
											task.id,
											e.currentTarget.value,
										)}
									disabled={working || blocked}
									>{#each task.formats as format}<option
											value={format}
											>{format.toUpperCase()}</option
										>{/each}</select
								>
							</div>
							{#if previewDetails && previewable(task.name, task.bytes)}
								<div class="input-preview">
									<button
										disabled={working ||
											blocked ||
											!task.authorized ||
											taskReadiness(
												task,
												info?.startup ?? [],
											) !== "ready"}
										onclick={() => previews.open(task.id)}
										data-preview-open
										>{previewDetails.button}</button
									>
									{#if preview.id === task.id}
										<button
											disabled={preview.busy &&
												!queueState.processing}
											onclick={closePreview}
											data-preview-close
											>{preview.busy
												? t(
														"取消预览",
														"Cancel preview",
													)
												: t(
														"关闭预览",
														"Close preview",
													)}</button
										>
										{#if preview.busy}<p role="status">
												{t(
													"正在生成预览…",
													"Generating preview…",
												)}
											</p>{/if}
										{#if preview.url}<figure>
												<img
													src={preview.url}
													alt={`${task.name} ${previewDetails.alt}`}
													onerror={() => {
														previews.clear();
														error = t(
															"无法显示预览，仍可尝试转换原文件。",
															"Preview could not be displayed; you can still try converting the original.",
														);
													}}
												/>
												<figcaption>
													{previewDetails.caption}
												</figcaption>
											</figure>{/if}
										{#if preview.error}<p
												class="error"
												role="alert"
											>
												{t(
													"预览不可用；你仍可尝试转换原文件。",
													"Preview unavailable; you can still try converting the original.",
												)}
												{preview.error ===
												"No embedded cover image found"
													? t(
															"此音频没有可读取的内嵌封面。",
															"No readable embedded cover image found.",
														)
													: preview.error ===
														  "No video frame stream found"
														? t(
																"此文件没有可读取的视频画面。",
																"No readable video frame stream found.",
															)
														: commandError(
																preview.error,
																english,
															)}
											</p>{/if}
									{/if}
								</div>
							{:else if previewDetails}
								<p>
									{t(
										"静态预览限 32 MiB 以内的图片、PDF 或媒体；转换限制独立适用。",
										"Static preview supports images, PDFs or media up to 32 MiB; conversion has separate limits.",
									)}
								</p>
							{/if}
							{#if task.formats.includes("png")}<OptionsEditor
									options={task.options}
									{english}
									pdf={task.name
										.toLowerCase()
										.endsWith(".pdf")}
									disabled={working || blocked}
									onchange={(value) =>
										configure([task.id], value)}
								/>{/if}
							<p
								class:success={task.phase === "saved"}
								role="status"
							>
								{label(task.phase)}{#if task.attempt > 0}
									· {t("第", "Attempt ")}
									{task.attempt}
									{t(
										"次",
										"",
									)}{/if}{#if !task.authorized && task.phase !== "awaiting_save"}
									· {t(
										"需要重新选择文件授权",
										"Choose file again to authorize",
									)}{/if}
							</p>
							{#if task.result?.path}<p class="saved-path">
									{task.phase === "saved"
										? t("已保存", "Saved")
										: t(
												"上次保存的结果",
												"Previously saved result",
											)} · {size(task.result.bytes)} · {task
										.result.path}
								</p>{/if}
							{#if task.result}
								{#if task.result.total > 1}<p
										class="page-progress"
										role="status"
									>
										{task.result.files.length} / {task
											.result.total}
										{t("页已保存", "pages saved")}
									</p>{/if}
								{#if comparison(task)}<p
										class:success={task.result.bytes <
											task.bytes}
										class="size-comparison"
									>
										{comparison(task)}
									</p>{/if}
								{#if task.result.files.length}<details
										class="outputs"
									>
										<summary
											>{t(
												"查看已保存文件",
												"Saved files",
											)} ({task.result.files
												.length})</summary
										>
										<ul>
											{#each task.result.files as file}<li
												>
													<span
														>{task.result.total > 1
															? `${t("第", "Page ")} ${file.page} ${t("页", "")}: `
															: ""}{file.path} · {size(
															file.bytes,
														)}</span
													><button
														disabled={busy ||
															!queueState.output_authorized}
														onclick={() =>
															reveal(
																task.id,
																file.page,
															)}
														>{t(
															"打开所在位置",
															"Show in folder",
														)}</button
													>
												</li>{/each}
										</ul>
									</details>{/if}
								{#if task.result.note}<p class="result-note">
										{resultNote(task.result.note, english)}
									</p>{/if}
							{/if}
							{#if !["saved", "running", "saving", "queued"].includes(task.phase) && taskReadiness(task, info?.startup ?? []) !== "ready"}
								<p role="status">
									{failureMessage(
										taskReadiness(
											task,
											info?.startup ?? [],
										) === "failed"
											? "engine_unavailable"
											: "preparing",
										english,
									)}
								</p>
							{/if}
							{#if queueState.progress?.id === task.id && queueState.progress.attempt === task.attempt}
								<p role="status" data-task-progress>
									{queueState.progress.value.stage ===
									"encoding"
										? t("音频编码中", "Encoding audio")
										: queueState.progress.value.stage ===
											  "validating"
											? t(
													"验证输出中",
													"Validating output",
												)
											: t(
													"正在保存",
													"Saving output",
												)}{#if queueState.progress.value.percent !== null}
										· {queueState.progress.value
											.percent}%{/if}
								</p>
							{/if}
							{#if task.error}<p class="error" role="alert">
									{queueState.failures?.[task.id]
										? failureMessage(
												queueState.failures[task.id],
												english,
											)
										: commandError(task.error, english)}
								</p>{/if}
							{#if task.phase === "awaiting_save"}<p
									class="saved-result-notice"
								>
									{t(
										"已验证的结果暂存在本机，空闲 30 分钟内可直接重试保存。可先更换保存目录；退出、清空或修改设置后需重新转换。",
										"The verified result is kept on this device for 30 idle minutes. Retry saving directly, or choose another output folder first. Quitting, clearing or changing settings requires conversion again.",
									)}
								</p>{/if}
							<div class="task-actions">
								{#if task.phase === "awaiting_save"}<button
										data-save-result
										disabled={working ||
											blocked ||
											!queueState.output_authorized ||
											taskReadiness(
												task,
												info?.startup ?? [],
											) !== "ready"}
										onclick={() => submit([task])}
										>{t(
											"仅重试保存",
											"Retry saving only",
										)}</button
									>{/if}
								{#if !task.authorized && task.phase !== "awaiting_save"}<button
										disabled={working || blocked}
										onclick={() => {
											pending = undefined;
											void action("pick_inputs", {
												restoreId: task.id,
											});
										}}
										>{t(
											"重新选择文件",
											"Choose file again",
										)}</button
									>{/if}
								{#if ["failed", "cancelled", "interrupted", "partial", "saved"].includes(task.phase)}<button
										disabled={working ||
											blocked ||
											!task.authorized ||
											!queueState.output_authorized ||
											taskReadiness(
												task,
												info?.startup ?? [],
											) !== "ready"}
										onclick={() => submit([task])}
										>{task.phase === "saved"
											? t("重新转换", "Convert again")
											: task.phase === "partial"
												? t(
														"重试未完成页",
														"Retry remaining pages",
													)
												: t("重试", "Retry")}</button
									>{/if}
								{#if ["queued", "running", "saving"].includes(task.phase)}<button
										disabled={busy || queueState.clearing}
										onclick={() =>
											action("cancel_tasks", {
												ids: [task.id],
											})}
										>{t("取消此项", "Cancel task")}</button
									>{/if}
								<button
									disabled={busy ||
										queueState.clearing ||
										queueState.closing}
									onclick={() => {
										pending = undefined;
										void action("remove_tasks", {
											ids: [task.id],
										});
									}}>{t("移除任务", "Remove task")}</button
								>
							</div>
						</li>{/each}
				</ul>{/if}
			<div class="workspace-footer">
				<p>
					{#if eligible.length && !queueState?.output_authorized}
						<strong id="conversion-folder-hint" role="status">
							{t(
								"转换前需要选择保存目录。点击转换按钮选择目录，确认后自动开始；取消选择不会转换。",
								"Choose a save folder before converting. Use the conversion button to select a folder and start; cancelling will not start conversion.",
							)}
						</strong><br />
					{/if}
					{t(
						"清空会取消任务并删除尚未保存的暂存结果，保留原文件和已保存结果。存在任务或待保存结果时，关闭窗口会先询问。",
						"Clearing cancels tasks and discards unsaved cached results. Originals and saved files are kept. Closing with active tasks or unsaved results asks for confirmation.",
					)}
				</p>
				{#if queueState?.processing}<button
						class="danger"
						disabled={busy || queueState.clearing}
						onclick={() => action("cancel_tasks", { ids: [] })}
						><PixelIcon name="cancel" />{t(
							"取消全部",
							"Cancel all",
						)}</button
					>{:else}<button
						data-start-conversion
						class="primary"
						onclick={startConversion}
						aria-describedby={eligible.length &&
						!queueState?.output_authorized
							? "conversion-folder-hint"
							: undefined}
						disabled={working || blocked || !eligible.length}
						><PixelIcon
							name="arrow"
						/>{queueState?.output_authorized
							? t("转换未完成文件", "Convert unfinished files")
							: t(
									"选择保存目录并转换",
									"Choose save folder and convert",
								)}</button
					>{/if}
			</div>
		</section>
		<details class="engines">
			<summary
				>{t("原生引擎状态", "Native engine status")} · {info?.architecture ??
					"—"}</summary
			>
			<ul>
				{#each info?.engines ?? [] as engine}<li>
						<strong>{engine.id}</strong> — {engine.available
							? engine.version
							: info?.startup.find((s) => s.id === engine.id)
										?.phase === "preparing"
								? t("准备中…", "Preparing…")
								: t("不可用", "Unavailable")}
						{#if engine.error}<span class="error"
								>{failureMessage(
									"engine_unavailable",
									english,
								)}</span
							>{/if}
					</li>{/each}
			</ul>
		</details>
		<Impact
			{english}
			tasks={queueState?.tasks ?? []}
			location={info?.processing_location}
		/>
		<Diagnostics {english} />
		<Licenses {english} />
		<footer>
			<PixelIcon name="lock" size={18} /><span
				>{t(
					"文件在本机处理。清空会删除当前队列记录；升级时保留的旧版本历史备份需自行清理。",
					"Conversion runs on this device. Clearing removes current queue records; history backups retained during upgrades require separate cleanup.",
				)}</span
			><span>contact@web.casa</span>
		</footer>
	</main>
</div>
