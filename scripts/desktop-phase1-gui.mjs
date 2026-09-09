import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { once } from "node:events";
import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
	copyFile,
	readdir,
} from "node:fs/promises";
import { resolve, join } from "node:path";
const execute = promisify(execFile);
const phase2 = process.argv.includes("--phase2");
const packaged = process.argv.includes("--packaged");
if (packaged && !process.env.Z8_GUI_BINARY)
	throw new Error("Packaged test requires explicit Z8_GUI_BINARY");
const application = resolve(
	process.env.Z8_GUI_BINARY || "src-tauri/target/debug/z8-desktop",
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function port() {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const value = server.address().port;
	await new Promise((r) => server.close(r));
	return value;
}
const xd = process.env.Z8_XDOTOOL;
if (
	!process.env.DISPLAY ||
	!process.env.DBUS_SESSION_BUS_ADDRESS ||
	!xd ||
	!process.env.Z8_DEV_ENGINE_MANIFEST
)
	throw new Error(
		"Run under xvfb-run + dbus-run-session and set Z8_XDOTOOL and Z8_DEV_ENGINE_MANIFEST; see Phase 1 documentation.",
	);
await mkdir(".desktop-local", { recursive: true });
const root = await mkdtemp(resolve(".desktop-local/phase1-gui-"));
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
	["-size", "1024x1024", "plasma:fractal", big],
	{ timeout: 15000 },
);
const proxy = await port();
const native = await port();
const env = {
	...process.env,
	XDG_DATA_HOME: join(root, "data"),
	XDG_CACHE_HOME: join(root, "cache"),
	XDG_CONFIG_HOME: join(root, "config"),
};
if (packaged)
	env.Z8_DEV_ENGINE_MANIFEST =
		"/deliberately-invalid-development-manifest.json";
const driver = spawn(
	"tauri-driver",
	["--port", String(proxy), "--native-port", String(native)],
	{ env, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
for (const pipe of [driver.stdout, driver.stderr])
	pipe.on("data", (d) => {
		logs = (logs + d.toString()).slice(-8000);
	});
let prefix;
let succeeded = false;
let driverError;
driver.on("error", (e) => {
	driverError = e;
});
const base = `http://127.0.0.1:${proxy}`;
async function req(path, data, method = "POST") {
	const response = await fetch(base + path, {
		method,
		headers: { "Content-Type": "application/json" },
		...(data ? { body: JSON.stringify(data) } : {}),
		signal: AbortSignal.timeout(30000),
	});
	const value = await response.json();
	if (!response.ok || value.value?.error)
		throw new Error(JSON.stringify(value));
	return value.value;
}
const js = (script, args = []) =>
	req(prefix + "/execute/sync", { script, args });
const invoke = (command, args = {}) =>
	req(prefix + "/execute/async", {
		script: "const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(v=>done({ok:true,value:v}),e=>done({ok:false,error:String(e)}));",
		args: [command, args],
	}).then((v) => {
		if (!v.ok) throw new Error(v.error);
		return v.value;
	});
async function until(fn, reason, timeout = 15000) {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		const value = await fn();
		if (value) return value;
		await pause(50);
	}
	throw new Error(reason);
}
async function xdotool(...args) {
	await execute(xd, args, {
		timeout: 5000,
		env: {
			...env,
			...(process.env.Z8_XDOTOOL_LIBRARY_DIR
				? { LD_LIBRARY_PATH: process.env.Z8_XDOTOOL_LIBRARY_DIR }
				: {}),
		},
	});
}
async function choose(label, title, path) {
	await js(
		'const button=[...document.querySelectorAll("button")].find(b=>b.textContent.includes(arguments[0]));if(!button || button.disabled)throw new Error("Picker button unavailable");button.click();',
		[label],
	);
	await until(async () => {
		try {
			await xdotool(
				"search",
				"--onlyvisible",
				"--name",
				title,
				"windowfocus",
			);
			return true;
		} catch {
			return false;
		}
	}, "Native dialog did not open");
	await pause(200);
	await xdotool("key", "ctrl+l");
	await pause(200);
	await xdotool("key", "ctrl+a");
	await xdotool("type", "--clearmodifiers", "--delay", "15", path);
	await pause(200);
	await xdotool("key", "Return");
	await pause(400);
}
try {
	await until(async () => {
		if (driverError) throw driverError;
		try {
			await req("/status", null, "GET");
			return true;
		} catch {
			return false;
		}
	}, "WebDriver unavailable");
	const session = await req("/session", {
		capabilities: {
			alwaysMatch: {
				"tauri:options": {
					application,
				},
			},
		},
	});
	prefix = `/session/${session.sessionId}`;
	await req(prefix + "/timeouts", { script: 20000 });
	await until(
		() => js('return !!document.querySelector("h1")'),
		"Desktop did not render",
	);
	const info = await invoke("desktop_info");
	assert.equal(info.error, null);
	assert.equal(info.queue_error, null);
	if (packaged)
		assert.ok(
			info.engines.length === 5 &&
				info.engines.every((e) => e.available && !e.development),
		);
	await assert.rejects(
		invoke("convert_file", { id: "invented", format: "png" }),
		/not allowed|not found/i,
	);
	await assert.rejects(
		invoke("plugin:fs|read_text_file", { path: "/etc/hostname" }),
		/not allowed|not found/i,
	);
	await assert.rejects(
		invoke("plugin:event|emit", {
			event: "queue-changed",
			payload: { revision: 999 },
		}),
		/not allowed|not found/i,
	);
	await until(
		() => js('return !document.querySelector(".language select").disabled'),
		"Preferences did not load",
	);
	await js(
		'const e=document.querySelector(".language select");e.value="zh_hans";e.dispatchEvent(new Event("change",{bubbles:true}));',
	);
	await until(
		() =>
			js(
				'return document.documentElement.lang === "zh-Hans" && !document.querySelector(".language select").disabled',
			),
		"Chinese preference was not saved",
	);
	await choose("选择文件", "^Z8.Work — Select input files$", big);
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 1,
		"Input selection failed",
	);
	await choose("选择文件", "^Z8.Work — Select input files$", fixture);
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 2,
		"Second input selection failed",
	);
	await choose(
		"选择保存目录",
		"^Z8.Work — Select output folder$",
		output + "/",
	);
	// GTK folder selection may navigate first, then require explicit confirmation.
	if (!(await invoke("queue_snapshot")).output_authorized) {
		await xdotool("key", "alt+o");
		await pause(300);
	}
	let ready = await until(async () => {
		const s = await invoke("queue_snapshot");
		return s.output_authorized ? s : false;
	}, "Output selection failed");
	assert.equal(
		ready.output,
		output,
		"Native picker must authorize the intended directory",
	);
	if (phase2) {
		await js(
			'const d=document.querySelector(".batch-settings");d.open=true;const selects=d.querySelectorAll("select");selects[0].value="avif";selects[0].dispatchEvent(new Event("change",{bubbles:true}));',
		);
		await until(
			() =>
				js(
					'return !document.querySelector(".language select").disabled',
				),
			"Preference write did not finish",
		);
		await js(
			'const d=document.querySelector(".batch-settings");const q=d.querySelector(".options-editor select");q.value="small";q.dispatchEvent(new Event("change",{bubbles:true}));',
		);
		await until(
			() =>
				js(
					'return !document.querySelector(".language select").disabled',
				),
			"Preference write did not finish",
		);
		await js('document.querySelector(".batch-settings button").click();');
		ready = await until(async () => {
			const s = await invoke("queue_snapshot");
			return s.tasks.every(
				(t) => t.format === "avif" && t.options.quality === "small",
			)
				? s
				: false;
		}, "Batch controls did not persist native settings");
	}
	const request = {
		epoch: ready.epoch,
		request_id: crypto.randomUUID(),
		items: ready.tasks.map((t) => ({
			id: t.id,
			format: "avif",
			expected_attempt: t.attempt,
			options: t.options,
		})),
	};
	const queued = await invoke("submit_batch", { request });
	assert.equal(queued.processing, true);
	await req(prefix + "/refresh", {});
	await until(
		() => js('return !!document.querySelector("h1")'),
		"Reload failed",
	);
	const completed = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing ? s : false;
		},
		"Native queue did not finish",
		60000,
	);
	assert.ok(
		completed.tasks.every((t) => t.phase === "saved"),
		JSON.stringify(completed),
	);
	await until(
		() =>
			js(
				'return document.querySelectorAll("[data-phase=saved]").length===2',
			),
		"Events/snapshot did not restore rows",
	);
	const names = await readdir(output);
	assert.equal(names.length, 2);
	await invoke("submit_batch", { request });
	assert.deepEqual(await readdir(output), names);
	// The same D-Bus session must reject a second process before another queue is created.
	const second = await execute(application, [], { env, timeout: 10000 });
	assert.equal(second.stderr.includes("panicked"), false);
	const afterSecond = await invoke("queue_snapshot");
	assert.equal(afterSecond.epoch, completed.epoch);
	await writeFile(
		join(root, "window.png"),
		Buffer.from(await req(prefix + "/screenshot", null, "GET"), "base64"),
	);
	// Start a second attempt, then clear while it is queued/running.
	const retry = {
		epoch: completed.epoch,
		request_id: crypto.randomUUID(),
		items: completed.tasks.map((t) => ({
			id: t.id,
			format: "avif",
			expected_attempt: t.attempt,
			options: t.options,
		})),
	};
	await invoke("submit_batch", { request: retry });
	await invoke("remove_tasks", { ids: [] });
	const cleared = await invoke("queue_snapshot");
	assert.equal(cleared.tasks.length, 0);
	assert.equal(cleared.processing, false);
	for (const name of names)
		assert.ok((await readFile(join(output, name))).length > 0);
	let pdfChecks = {};
	if (phase2) {
		const pdfPath = join(root, "multipage.pdf");
		const objects = [
			"<< /Type /Catalog /Pages 2 0 R >>",
			"<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R 11 0 R] /Count 5 >>",
		];
		for (let i = 0; i < 5; i++) {
			const stream = `${i % 2} ${1 - (i % 2)} 0 rg 0 0 720 480 re f\n`;
			objects.push(
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 480] /Resources << >> /Contents ${4 + i * 2} 0 R >>`,
			);
			objects.push(
				`<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
			);
		}
		let pdf = "%PDF-1.4\n";
		const offsets = [0];
		objects.forEach((o, i) => {
			offsets.push(pdf.length);
			pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
		});
		const start = pdf.length;
		pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
		offsets.slice(1).forEach((o) => {
			pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
		});
		pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
		await writeFile(pdfPath, pdf);
		await choose("选择文件", "^Z8.Work — Select input files$", pdfPath);
		const imported = await until(async () => {
			const s = await invoke("queue_snapshot");
			return s.tasks.length === 1 ? s : false;
		}, "PDF import failed");
		const configured = await invoke("configure_tasks", {
			ids: [imported.tasks[0].id],
			format: "avif",
			options: {
				quality: "balanced",
				keep_metadata: false,
				pdf_dpi: 144,
			},
		});
		await invoke("submit_batch", {
			request: {
				epoch: configured.epoch,
				request_id: crypto.randomUUID(),
				items: configured.tasks.map((t) => ({
					id: t.id,
					format: t.format,
					expected_attempt: t.attempt,
					options: t.options,
				})),
			},
		});
		await until(
			async () => {
				const s = await invoke("queue_snapshot");
				return s.processing && s.tasks[0].result?.files.length > 0;
			},
			"PDF never reported a saved page",
			60000,
		);
		await invoke("cancel_tasks", { ids: [] });
		const partial = await until(async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing ? s : false;
		}, "PDF cancellation did not finish");
		assert.equal(partial.tasks[0].phase, "partial");
		const savedPages = partial.tasks[0].result.files;
		assert.ok(savedPages.length > 0 && savedPages.length < 5);
		const savedBytes = await Promise.all(
			savedPages.map((f) => readFile(f.path)),
		);
		await req(prefix + "/refresh", {});
		await until(
			() => js('return !!document.querySelector("[data-phase=partial]")'),
			"Partial PDF not restored after reload",
		);
		await js(
			'const button=[...document.querySelectorAll("button")].find(b=>b.textContent.includes("重试未完成页"));if(!button || button.disabled)throw new Error("Retry UI unavailable");button.click();',
		);
		const final = await until(
			async () => {
				const s = await invoke("queue_snapshot");
				return !s.processing && s.tasks[0].phase === "saved"
					? s
					: false;
			},
			"PDF retry did not complete",
			60000,
		);
		assert.equal(final.tasks[0].result.files.length, 5);
		for (let i = 0; i < savedPages.length; i++)
			assert.deepEqual(await readFile(savedPages[i].path), savedBytes[i]);
		assert.equal(
			(await readdir(output)).filter((n) =>
				n.startsWith("multipage-page-"),
			).length,
			5,
		);
		await assert.rejects(
			invoke("reveal_result", { id: "invented", page: 1 }),
			/Unknown saved output/,
		);
		await assert.rejects(
			invoke("plugin:opener|open_path", { path: "/etc/hostname" }),
			/not allowed|not found/i,
		);
		await until(
			() => js('return !!document.querySelector(".size-comparison")'),
			"Result comparison not rendered",
		);
		await writeFile(
			join(root, "window.png"),
			Buffer.from(
				await req(prefix + "/screenshot", null, "GET"),
				"base64",
			),
		);
		pdfChecks = {
			batchSettingsPersisted: true,
			pdfSavedPages: 5,
			pdfPartialCancellation: true,
			pdfRetryAfterReload: true,
			pdfResumePreservedOutputs: true,
			arbitraryRevealRejected: true,
			sizeComparisonRendered: true,
		};
	}
	const report = {
		platform: info.architecture,
		...pdfChecks,
		nativeInputPicker: true,
		nativeOutputPicker: true,
		queueContinuedAcrossReload: true,
		savedTasks: 2,
		duplicateRequestNoExtraOutput: true,
		singleInstanceSecondProcessExited: true,
		packagedEngines: packaged,
		application,
		unauthorizedCommandsRejected: true,
		clearWaitedForCancellation: true,
		clearPreservedSavedOutputs: true,
	};
	await writeFile(
		join(root, "report.json"),
		JSON.stringify(report, null, 2) + "\n",
	);
	await writeFile(
		packaged
			? ".desktop-local/phase3-gui-report-path"
			: phase2
				? ".desktop-local/phase2-gui-report-path"
				: ".desktop-local/phase1-gui-report-path",
		root,
	);
	console.log(JSON.stringify(report));
	console.log(`Evidence: ${root}`);
	succeeded = true;
} finally {
	const cleanupErrors = [];
	if (!succeeded && prefix) {
		try {
			await execute(
				manifest.engines.magick.path,
				["import", "-window", "root", join(root, "failure.png")],
				{ env, timeout: 5000 },
			);
		} catch (e) {
			console.error("Could not capture failed dialog:", String(e));
		}
	}
	if (prefix) {
		try {
			await invoke("cancel_tasks", { ids: [] });
			await until(
				async () => !(await invoke("queue_snapshot")).processing,
				"Queue did not cancel",
				15000,
			);
		} catch (error) {
			cleanupErrors.push(`Cancellation cleanup failed: ${String(error)}`);
		}
		try {
			await req(prefix, null, "DELETE");
		} catch (error) {
			cleanupErrors.push(`Session cleanup failed: ${String(error)}`);
		}
	}
	driver.kill("SIGTERM");
	await pause(300);
	if (driver.exitCode === null) driver.kill("SIGKILL");
	await writeFile(join(root, "driver.log"), logs);
	if (cleanupErrors.length) {
		console.error(cleanupErrors.join("\n"));
		if (succeeded) process.exitCode = 1;
	}
}
