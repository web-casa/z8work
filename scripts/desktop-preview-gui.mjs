import { startupFixture } from "./lib/desktop-startup-checks.mjs";
import { checkSaveRetry } from "./lib/desktop-save-retry-checks.mjs";
import { checkDiagnostics } from "./lib/desktop-diagnostics-checks.mjs";
import { checkStorage } from "./lib/desktop-storage-checks.mjs";
import { workspaceFixtures } from "./lib/desktop-workspace-checks.mjs";
import { checkImports } from "./lib/desktop-import-checks.mjs";
import {
	checkMediaPreviews,
	checkMediaExport,
} from "./lib/desktop-media-preview-checks.mjs";
// Native Linux WebKit preview checks with isolated application data and generated inputs.
import {
	checkPdfPreviews,
	checkPdfExport,
} from "./lib/desktop-pdf-preview-checks.mjs";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
	copyFile,
	truncate,
} from "node:fs/promises";
import { join, resolve } from "node:path";
if (
	!process.env.DISPLAY ||
	!process.env.DBUS_SESSION_BUS_ADDRESS ||
	!process.env.Z8_DEV_ENGINE_MANIFEST
)
	throw new Error(
		"Run under xvfb-run + dbus-run-session with Z8_DEV_ENGINE_MANIFEST",
	);
const execute = promisify(execFile);
const xd = process.env.Z8_XDOTOOL;
if (!xd) throw new Error("Set Z8_XDOTOOL");
const checks = [];
const routes = [];
const startupMode = process.argv.includes("--startup");
const saveRetryMode = startupMode || process.argv.includes("--save-retry");
const diagnosticsMode = saveRetryMode || process.argv.includes("--diagnostics");
const storageMode = diagnosticsMode || process.argv.includes("--storage");
const workspaceMode = storageMode || process.argv.includes("--workspaces");
const importMode = workspaceMode || process.argv.includes("--imports");
const mediaMode = importMode || process.argv.includes("--media");
const pdfMode = mediaMode || process.argv.includes("--pdf");
const root = await mkdtemp(
	resolve(
		startupMode
			? ".desktop-local/phase26-gui-"
			: saveRetryMode
				? ".desktop-local/phase25-gui-"
				: diagnosticsMode
					? ".desktop-local/phase23-gui-"
					: storageMode
						? ".desktop-local/phase22-gui-"
						: workspaceMode
							? ".desktop-local/phase21-gui-"
							: importMode
								? ".desktop-local/phase20-gui-"
								: mediaMode
									? ".desktop-local/phase19-gui-"
									: pdfMode
										? ".desktop-local/phase18-gui-"
										: ".desktop-local/phase17-gui-",
	),
);
const startup = startupMode
	? await startupFixture(root, process.env.Z8_DEV_ENGINE_MANIFEST)
	: undefined;
const workspaces = workspaceMode ? await workspaceFixtures(root) : undefined;
async function port() {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const value = server.address().port;
	await new Promise((r) => server.close(r));
	return value;
}
const proxy = await port(),
	native = await port();
const driver = spawn(
	"tauri-driver",
	["--port", String(proxy), "--native-port", String(native)],
	{
		env: {
			...process.env,
			...(startup ? { Z8_DEV_ENGINE_MANIFEST: startup.path } : {}),
			XDG_DATA_HOME: join(root, "data"),
			XDG_CACHE_HOME: join(root, "cache"),
			XDG_CONFIG_HOME: join(root, "config"),
		},
		stdio: ["ignore", "pipe", "pipe"],
	},
);
let logs = "",
	startupError,
	prefix,
	passed = false;
for (const pipe of [driver.stdout, driver.stderr])
	pipe.on("data", (b) => (logs = (logs + b).slice(-16000)));
driver.on("error", (error) => (startupError = error));
async function request(path, data, method = "POST") {
	const response = await fetch(`http://127.0.0.1:${proxy}${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		...(data ? { body: JSON.stringify(data) } : {}),
		signal: AbortSignal.timeout(30000),
	});
	const body = await response.json();
	if (!response.ok || body.value?.error)
		throw new Error(JSON.stringify(body));
	return body.value;
}
const js = (script, args = []) =>
	request(`${prefix}/execute/sync`, { script, args });
async function until(fn, reason, timeout = 20000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const value = await fn();
		if (value) return value;
		await new Promise((r) => setTimeout(r, 80));
	}
	throw new Error(reason);
}
const invoke = (command, args = {}) =>
	request(`${prefix}/execute/async`, {
		script: "const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(v=>done({ok:true,value:v}),e=>done({ok:false,error:String(e)}));",
		args: [command, args],
	}).then((v) => {
		if (!v.ok) throw new Error(v.error);
		return v.value;
	});
async function ready() {
	await until(
		() =>
			js(
				'return !!document.querySelector(".language select") && !document.querySelector(".language select").disabled',
			),
		"Preferences failed to initialize",
	);
}
async function open() {
	const session = await request("/session", {
		capabilities: {
			alwaysMatch: {
				"tauri:options": {
					application: resolve(
						process.env.Z8_GUI_BINARY ||
							"src-tauri/target/debug/z8-desktop",
					),
				},
			},
		},
	});
	prefix = `/session/${session.sessionId}`;
	await request(`${prefix}/timeouts`, { script: 20000 });
	await ready();
}
async function change(selector, value) {
	await js(
		'const e=document.querySelector(arguments[0]);if(!e||e.disabled)throw new Error("Control unavailable");e.value=arguments[1];if(e.value!==arguments[1])throw new Error("Unsupported select value");e.dispatchEvent(new Event("change",{bubbles:true}));',
		[selector, value],
	);
	await until(
		() => js('return !document.querySelector(".language select").disabled'),
		"Preference save did not settle",
	);
}
const output = join(root, "results");
await mkdir(output);
const fixture = join(root, "sample.png");
await copyFile("tests/fixtures/cover.png", fixture);
const big = join(root, "large.png");
const manifest = JSON.parse(
	await readFile(process.env.Z8_DEV_ENGINE_MANIFEST, "utf8"),
);
await execute(
	manifest.engines.magick.path,
	["-size", "1024x768", "plasma:fractal", big],
	{ timeout: 30000 },
);
async function xdotool(...args) {
	return (
		await execute(xd, args, {
			timeout: 5000,
			env: {
				...process.env,
				...(process.env.Z8_XDOTOOL_LIBRARY_DIR
					? { LD_LIBRARY_PATH: process.env.Z8_XDOTOOL_LIBRARY_DIR }
					: {}),
			},
		})
	).stdout.trim();
}
async function windows(title) {
	try {
		return (await xdotool("search", "--onlyvisible", "--name", title))
			.split("\n")
			.filter(Boolean);
	} catch (e) {
		if (e.code === 1) return [];
		throw e;
	}
}
async function choose(command, path, title, selectAll = false) {
	// Start the picker without waiting for the promise; drive the native UI.
	await js(
		"window.pickerDone=false;window.pickerError=null;window.__TAURI_INTERNALS__.invoke(arguments[0]).then(()=>{window.pickerDone=true},e=>{window.pickerError=String(e);window.pickerDone=true});",
		[command],
	);
	const win = await until(
		async () => (await windows(title))[0],
		"Picker did not open",
	);
	await xdotool("windowfocus", win);
	await new Promise((r) => setTimeout(r, 200));
	await xdotool("key", "ctrl+l");
	await new Promise((r) => setTimeout(r, 200));
	await xdotool("key", "ctrl+a");
	await xdotool("type", "--clearmodifiers", "--delay", "5", path);
	await new Promise((r) => setTimeout(r, 200));
	await xdotool("key", "Return");
	if (selectAll) {
		// Navigate to a generated fixture folder, focus the native file list,
		// then use the file picker's own multi-selection.
		await new Promise((r) => setTimeout(r, 400));
		await xdotool("mousemove", "--window", win, "260", "90");
		await xdotool("click", "1");
		await xdotool("key", "ctrl+a");
		await xdotool("key", "Return");
	}
	if (command === "pick_output") {
		await new Promise((r) => setTimeout(r, 300));
		if ((await windows(title)).includes(win)) {
			// GTK Recent view may complete the typed folder on the first Enter.
			await xdotool("key", "Return");
			await new Promise((r) => setTimeout(r, 400));
			if ((await windows(title)).includes(win))
				await xdotool("key", "alt+o");
		}
	}
	await until(
		async () => (await windows(title)).length === 0,
		"Picker did not close",
	);
	await until(
		() =>
			js(
				"if(window.pickerError)throw new Error(window.pickerError);return window.pickerDone",
			),
		"Picker registration did not finish",
	);
}
async function preview(id) {
	// Native completion can arrive before the queue event updates the WebView.
	// HTMLElement.click() silently ignores disabled buttons.
	await until(
		() =>
			js(
				'const e=document.querySelector(`[data-task-id="${arguments[0]}"] [data-preview-open]`);return !!e&&!e.disabled',
				[id],
			),
		"Preview button is not ready",
	);
	await js(
		'document.querySelector(`[data-task-id="${arguments[0]}"] [data-preview-open]`).click()',
		[id],
	);
	return until(async () => {
		const state = await js(
			'const row=document.querySelector(`[data-task-id="${arguments[0]}"]`); const err=row.querySelector(".input-preview .error"); const image=row.querySelector(".input-preview img"); return {error:err?.textContent,loaded:!!image?.complete&&image.naturalWidth>0,width:image?.naturalWidth,height:image?.naturalHeight,url:image?.src}',
			[id],
		);
		if (state.error) throw new Error(state.error);
		return state.loaded && state;
	}, "Preview failed to display");
}
async function submit(id) {
	const s = await invoke("queue_snapshot"),
		t = s.tasks.find((t) => t.id === id);
	await invoke("submit_batch", {
		request: {
			epoch: s.epoch,
			request_id: crypto.randomUUID(),
			items: [
				{
					id,
					format: t.format,
					options: t.options,
					expected_attempt: t.attempt,
				},
			],
		},
	});
}
async function screenshot(name, selector = ".input-preview img") {
	await js(
		'document.querySelector(arguments[0]).scrollIntoView({block:"center",behavior:"instant"})',
		[selector],
	);
	await until(
		() =>
			js(
				"const r=document.querySelector(arguments[0]).getBoundingClientRect();return r.top >= 0 && r.bottom <= innerHeight",
				[selector],
			),
		"Preview was outside screenshot viewport",
	);
	await new Promise((r) => setTimeout(r, 200));
	await writeFile(
		join(root, name),
		Buffer.from(
			await request(`${prefix}/screenshot`, null, "GET"),
			"base64",
		),
	);
}
try {
	await until(async () => {
		if (startupError) throw startupError;
		try {
			await request("/status", null, "GET");
			return true;
		} catch {
			return false;
		}
	}, "Driver unavailable");
	await open();
	await change(".language select", "en");
	await workspaces?.startup({ invoke, js, checks, screenshot });
	await startup?.check({
		output,
		submit,
		invoke,
		js,
		change,
		choose,
		until,
		screenshot,
		checks,
	});
	await change(".language select", "en");
	if (importMode)
		await checkImports({
			root,
			choose,
			invoke,
			js,
			until,
			change,
			screenshot,
			preview,
			checks,
			reload: async () => {
				await request(`${prefix}/refresh`, {});
				await ready();
			},
		});
	await assert.rejects(
		invoke("preview_input", { id: "/etc/passwd" }),
		/Choose|input/i,
	);
	// Track actual WebView Blob URL ownership, without changing production IPC.
	await js(
		"window.previewUrls={created:[],revoked:[]};const c=URL.createObjectURL.bind(URL),r=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{const u=c(b);window.previewUrls.created.push(u);return u};URL.revokeObjectURL=u=>{window.previewUrls.revoked.push(u);r(u)};",
	);
	for (const ext of ["png", "jpg", "webp", "avif", "heic"]) {
		const file = join(root, `input.${ext}`);
		if (ext === "png") await copyFile(big, file);
		else
			await execute(
				manifest.engines.magick.path,
				[big, "-quality", "70", file],
				{ timeout: 30000 },
			);
		await choose("pick_inputs", file, "^Z8.Work — Select input files$");
		const s = await invoke("queue_snapshot");
		const t = s.tasks.find((t) => t.name === `input.${ext}`);
		const img = await preview(t.id);
		assert.ok(img.width <= 256 && img.height <= 256);
		assert.equal(img.width, 256);
		assert.equal((await invoke("queue_snapshot")).output_authorized, false);
		routes.push({ input: ext, width: img.width, height: img.height });
	}
	checks.push(
		"five-native-image-routes",
		"preview-without-output-authorization",
	);
	let urls = await js("return window.previewUrls");
	assert.equal(urls.created.length, 5);
	assert.equal(urls.revoked.length, 4);
	await screenshot("preview.png");
	const pdfHarness = {
		root,
		choose,
		change,
		invoke,
		preview,
		js,
		checks,
		routes,
		execute,
		manifest,
		screenshot,
		submit,
		until,
	};
	const pdfId = pdfMode ? await checkPdfPreviews(pdfHarness) : undefined;
	const mediaIds = mediaMode
		? await checkMediaPreviews(pdfHarness)
		: undefined;

	const state = await invoke("queue_snapshot"),
		png = state.tasks.find((t) => t.name === "input.png");
	await preview(png.id);
	await choose(
		"pick_output",
		output + "/",
		"^Z8.Work — Select output folder$",
	);
	await invoke("set_task_format", { id: png.id, format: "avif" });
	await submit(png.id);
	await workspaces?.duringJob({ checks, until });
	await js('document.querySelector("[data-preview-close]").click()');
	const done = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing && s;
		},
		"Conversion stalled",
		60000,
	);
	assert.equal(done.tasks.find((t) => t.id === png.id).phase, "saved");
	const result = done.tasks.find((t) => t.id === png.id).result.files[0].path;
	const dimensions = (
		await execute(
			manifest.engines.magick.path,
			["identify", "-format", "%w %h", result],
			{ timeout: 10000 },
		)
	).stdout;
	assert.equal(dimensions, "1024 768");
	checks.push(
		"closing-preview-does-not-cancel-conversion",
		"conversion-retains-original-dimensions",
	);
	await preview(png.id);
	await invoke("remove_tasks", { ids: [png.id] });
	await until(
		() =>
			js(
				'return document.querySelectorAll(".input-preview img").length===0',
			),
		"Removed preview survived",
	);
	urls = await js("return window.previewUrls");
	assert.deepEqual([...urls.created].sort(), [...urls.revoked].sort());
	checks.push("blob-urls-released-on-replace-close-remove");
	if (pdfId) await checkPdfExport(pdfHarness, pdfId);
	if (mediaIds) await checkMediaExport(pdfHarness, mediaIds);
	if (storageMode) await checkStorage({ ...pdfHarness, output });
	if (saveRetryMode)
		await checkSaveRetry({ ...pdfHarness, output, xdotool, windows });
	if (diagnosticsMode)
		await checkDiagnostics({ ...pdfHarness, xdotool, windows });
	const bad = join(root, "broken.png");
	await writeFile(bad, "not an image");
	await choose("pick_inputs", bad, "^Z8.Work — Select input files$");
	const broken = (await invoke("queue_snapshot")).tasks.find(
		(t) => t.name === "broken.png",
	);
	await js(
		'document.querySelector(`[data-task-id="${arguments[0]}"] [data-preview-open]`).click()',
		[broken.id],
	);
	await until(
		() => js('return !!document.querySelector(".input-preview .error")'),
		"Preview error missing",
	);
	assert.equal((await invoke("queue_snapshot")).processing, false);
	assert.equal(
		(await invoke("queue_snapshot")).tasks.find((t) => t.id === broken.id)
			.phase,
		"ready",
	);
	checks.push("bad-preview-does-not-change-task-state");
	const huge = join(root, "over-budget.png");
	await copyFile(big, huge);
	await truncate(huge, 33554433);
	await choose("pick_inputs", huge, "^Z8.Work — Select input files$");
	const oversized = (await invoke("queue_snapshot")).tasks.find(
		(t) => t.name === "over-budget.png",
	);
	await assert.rejects(
		invoke("preview_input", { id: oversized.id }),
		/32 MiB/,
	);
	assert.equal(
		await js(
			'return !!document.querySelector(`[data-task-id="${arguments[0]}"] [data-preview-open]`)',
			[oversized.id],
		),
		false,
	);
	// Valid PNG plus trailing bytes: preview limit is narrower than conversion.
	await invoke("set_task_format", { id: oversized.id, format: "webp" });
	await submit(oversized.id);
	const afterLimit = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing && s;
		},
		"Over-budget original did not convert",
		60000,
	);
	assert.equal(
		afterLimit.tasks.find((t) => t.id === oversized.id).phase,
		"saved",
	);
	checks.push("preview-budget-does-not-block-conversion");
	const target = state.tasks.find((t) => t.name === "input.jpg");
	await writeFile(join(root, "input.jpg"), "changed bytes");
	await assert.rejects(
		invoke("preview_input", { id: target.id }),
		/changed/i,
	);
	assert.equal(
		(await invoke("queue_snapshot")).tasks.find((t) => t.id === target.id)
			.authorized,
		false,
	);
	checks.push("changed-file-refused");
	const good = (await invoke("queue_snapshot")).tasks.find(
		(t) => t.name === "input.webp",
	);
	await preview(good.id);
	await request(`${prefix}/refresh`, {});
	await ready();
	assert.equal(
		await js(
			'return document.querySelectorAll(".input-preview img").length',
		),
		0,
	);
	checks.push("reload-does-not-reuse-preview");
	await workspaces?.afterJobs({ checks, output });
	await startup?.checkProgress({
		invoke,
		js,
		change,
		choose,
		until,
		screenshot,
		checks,
		output,
		submit,
	});
	await change(".language select", "en");
	await request(prefix, null, "DELETE");
	prefix = undefined;
	await open();
	await assert.rejects(invoke("preview_input", { id: good.id }), /again/);
	checks.push("restart-requires-input-authorization");
	if (workspaces) {
		await request(prefix, null, "DELETE");
		prefix = undefined;
		await workspaces.makeUnavailable();
		await open();
		await workspaces.checkUnavailable({ invoke, js, checks, until });
		if (diagnosticsMode) {
			await request(prefix, null, "DELETE");
			prefix = undefined;
			const history = join(
				root,
				"data",
				"work.z8.desktop.m0",
				"queue-v1.json",
			);
			const savedHistory = await readFile(history);
			try {
				await writeFile(history, "PRIVATE_BROKEN_HISTORY");
				await open();
				const preview = await invoke("preview_diagnostics");
				const report = JSON.parse(preview.text);
				assert.equal(report.queue, null);
				assert.equal(report.workspace_initialized, false);
				assert.equal(
					preview.text.includes("PRIVATE_BROKEN_HISTORY"),
					false,
				);
				await js(
					'document.querySelector("[data-diagnostics]").open=true;document.querySelector("[data-diagnostics-preview]").click()',
				);
				await until(
					() =>
						js(
							'return !!document.querySelector("#diagnostic-report")',
						),
					"Diagnostic UI unavailable with broken history",
				);
				await js(
					'document.querySelector("[data-diagnostics-save]").click()',
				);
				const win = await until(
					async () =>
						(
							await windows("^Z8.Work — Save diagnostic report$")
						)[0],
					"Broken queue blocked diagnostic save",
				);
				await xdotool("windowfocus", win);
				await xdotool("key", "Escape");
				await until(
					() =>
						js(
							'return document.querySelector("[data-diagnostics-outcome]")?.textContent.includes("cancelled")',
						),
					"Diagnostic cancellation did not settle",
				);
				checks.push(
					"diagnostics-remain-available-with-broken-queue-and-cache",
				);
			} finally {
				if (prefix) {
					await request(prefix, null, "DELETE");
					prefix = undefined;
				}
				await writeFile(history, savedHistory);
			}
		}
	}
	if (startup) {
		if (prefix) {
			await request(prefix, null, "DELETE");
			prefix = undefined;
		}
		await startup.blockAgain();
		await open();
		await startup.checkExit({ invoke, windows, execute, until, checks });
	}
	passed = true;
} finally {
	if (!passed) {
		try {
			await execute(
				"import",
				["-window", "root", join(root, "failure.png")],
				{ timeout: 10000 },
			);
		} catch {
			/* Display may be gone. */
		}
	}
	if (prefix) {
		try {
			await request(prefix, null, "DELETE");
		} catch (e) {
			logs += `\nCleanup: ${e.message}`;
		}
	}
	driver.kill("SIGTERM");
	await workspaces?.close();
	await writeFile(join(root, "driver.txt"), logs);
	await writeFile(
		join(root, "report.json"),
		JSON.stringify(
			{
				schema: 1,
				status: passed ? "passed" : "failed",
				platform: `${process.platform}/${process.arch}`,
				routes,
				checks,
				installation: "not-run",
			},
			null,
			2,
		) + "\n",
	);
	console.log(root);
}
