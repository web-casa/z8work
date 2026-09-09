// Native Linux WebKit test with an isolated application profile and fixture-only preferences.
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
	readdir,
	copyFile,
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
const root = await mkdtemp(resolve(".desktop-local/phase16-gui-"));
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
		'const e=document.querySelector(arguments[0]);if(!e||e.disabled)throw new Error("Control unavailable");e.value=arguments[1];e.dispatchEvent(new Event("change",{bubbles:true}));',
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
	["-size", "2048x2048", "plasma:fractal", big],
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
const mainTitle = "^Z8.Work — Desktop$";
const dialogTitle = "^Z8.Work — (Confirm exit|退出确认)";
let main, pid;
let heldEncoders = [];
async function identify() {
	[main] = await windows(mainTitle);
	assert.ok(main, "Main native window missing");
	pid = Number(await xdotool("getwindowpid", main));
	assert.ok(pid > 0);
}
async function close(window = main) {
	await execute(
		"python3",
		["scripts/lib/desktop-quit-window.py", "close", window],
		{ timeout: 5000 },
	);
}
async function clickDialog(label) {
	await execute(
		"python3",
		["scripts/lib/desktop-quit-window.py", "click", String(pid), label],
		{ timeout: 10000 },
	);
}
async function waitDialog() {
	return until(async () => {
		const values = await windows(dialogTitle);
		assert.ok(values.length <= 1, "Duplicate exit dialogs");
		return values[0];
	}, "Exit confirmation did not open");
}
async function dismissed() {
	await until(
		async () => (await windows(dialogTitle)).length === 0,
		"Confirmation did not close",
	);
	assert.equal((await invoke("queue_snapshot")).closing, false);
}
async function choose(command, path, title) {
	// Start the picker without waiting for the promise; drive the native UI.
	await js(
		"window.__TAURI_INTERNALS__.invoke(arguments[0]).catch(e=>{window.pickerError=String(e)});",
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
	if (command === "pick_output") {
		await new Promise((r) => setTimeout(r, 300));
		if (!(await invoke("queue_snapshot")).output_authorized)
			await xdotool("key", "alt+o");
	}
	await until(
		async () => (await windows(title)).length === 0,
		"Picker did not close",
	);
}
async function submit(ids) {
	const state = await invoke("queue_snapshot");
	return invoke("submit_batch", {
		request: {
			epoch: state.epoch,
			request_id: crypto.randomUUID(),
			items: state.tasks
				.filter((t) => ids.includes(t.id))
				.map((t) => ({
					id: t.id,
					format: t.format,
					options: t.options,
					expected_attempt: t.attempt,
				})),
		},
	});
}
async function processExists(testPid) {
	try {
		process.kill(testPid, 0);
		return true;
	} catch (e) {
		if (e.code === "ESRCH") return false;
		throw e;
	}
}
async function engineChildren() {
	const result = [];
	for (const name of await readdir("/proc")) {
		if (!/^\d+$/.test(name)) continue;
		try {
			const [status, command] = await Promise.all([
				readFile(`/proc/${name}/status`, "utf8"),
				readFile(`/proc/${name}/cmdline`, "utf8"),
			]);
			if (
				Number(status.match(/^PPid:\s*(\d+)/m)?.[1]) === pid &&
				command.startsWith(manifest.engines.magick.path + "\0")
			)
				result.push(Number(name));
		} catch (e) {
			if (e.code !== "ENOENT" && e.code !== "ESRCH") throw e;
		}
	}
	return result;
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
	}, "WebDriver unavailable");
	await open();
	await identify();
	const info = await invoke("desktop_info");
	assert.equal(info.error, null);
	await change(".language select", "en");
	// Closing while a file picker is open must leave that modal and its queue intact.
	await js('window.__TAURI_INTERNALS__.invoke("pick_inputs").catch(()=>{});');
	const picker = await until(
		async () => (await windows("^Z8.Work — Select input files$"))[0],
		"Picker missing",
	);
	await close();
	assert.equal((await windows(dialogTitle)).length, 0);
	await xdotool("windowfocus", picker);
	await xdotool("key", "Escape");
	await until(
		async () =>
			(await windows("^Z8.Work — Select input files$")).length === 0,
		"Picker stuck",
	);
	assert.equal((await invoke("queue_snapshot")).closing, false);
	checks.push("close-with-picker-preserves-app");
	await choose("pick_inputs", fixture, "^Z8.Work — Select input files$");
	await choose(
		"pick_output",
		output + "/",
		"^Z8.Work — Select output folder$",
	);
	const smallId = (await invoke("queue_snapshot")).tasks[0].id;
	await submit([smallId]);
	const saved = await until(async () => {
		const s = await invoke("queue_snapshot");
		return !s.processing && s;
	}, "Small image did not finish");
	assert.equal(saved.tasks[0].phase, "saved");
	const originals = await Promise.all([readFile(fixture), readFile(big)]);
	const savedPath = saved.tasks[0].result.files[0].path;
	const savedBytes = await readFile(savedPath);
	await choose("pick_inputs", big, "^Z8.Work — Select input files$");
	const bigId = (await invoke("queue_snapshot")).tasks.find(
		(t) => t.name === "large.png",
	).id;
	await invoke("set_task_format", { id: bigId, format: "avif" });
	await submit([bigId]);
	assert.equal((await invoke("queue_snapshot")).processing, true);
	heldEncoders = await until(async () => {
		const ids = await engineChildren();
		return ids.length && ids;
	}, "No encoder to hold for dialog interaction");
	// Keep the real encoder active at a deterministic boundary while checking
	// multiple dialogs. Resume it before asserting real conversion completion.
	for (const child of heldEncoders) process.kill(child, "SIGSTOP");
	await close();
	const dialog = await waitDialog();
	await close();
	await close();
	assert.equal((await windows(dialogTitle)).length, 1);
	await execute(
		"import",
		["-window", "root", join(root, "confirmation-en.png")],
		{ timeout: 10000 },
	);
	await xdotool("windowfocus", dialog);
	await xdotool("key", "Escape");
	await dismissed();
	assert.equal((await invoke("queue_snapshot")).processing, true);
	checks.push("repeated-close-one-dialog", "escape-continues-conversion");
	await close();
	await waitDialog();
	await clickDialog("Stay in app");
	await dismissed();
	checks.push("stay-button-continues-conversion");
	await close();
	const defaultDialog = await waitDialog();
	await xdotool("windowfocus", defaultDialog);
	await xdotool("key", "Return");
	await dismissed();
	checks.push("default-enter-stays-in-app");
	await close();
	const secondDialog = await waitDialog();
	await close(secondDialog);
	await dismissed();
	checks.push("dialog-window-dismissal-continues");
	await close();
	await waitDialog();
	for (const child of heldEncoders) process.kill(child, "SIGCONT");
	heldEncoders = [];
	const done = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing && s;
		},
		"Dismissed conversion failed to complete",
		90000,
	);
	assert.ok(
		done.tasks.every((t) => t.phase === "saved"),
		JSON.stringify(done),
	);
	await clickDialog("Stay in app");
	await dismissed();
	checks.push("batch-can-finish-while-confirmation-open");
	checks.push("conversion-saves-after-dismissal");
	await change(".language select", "zh_hans");
	const pending = join(root, "queued.png");
	await copyFile(fixture, pending);
	await choose("pick_inputs", pending, "^Z8.Work — Select input files$");
	const queuedId = (await invoke("queue_snapshot")).tasks.find(
		(t) => t.name === "queued.png",
	).id;
	await submit([bigId, queuedId]);
	const children = await until(async () => {
		const ids = await engineChildren();
		return ids.length > 0 && ids;
	}, "No active native encoder found");
	await close();
	await waitDialog();
	assert.equal(
		(await invoke("queue_snapshot")).tasks.find((t) => t.id === queuedId)
			.phase,
		"queued",
	);
	await execute(
		"import",
		["-window", "root", join(root, "confirmation-zh.png")],
		{ timeout: 10000 },
	);
	await clickDialog("停止并退出");
	await until(
		async () => !(await processExists(pid)),
		"Confirmed quit did not terminate app",
	);
	for (const child of children)
		await until(
			async () => !(await processExists(child)),
			"Encoder survived exit",
		);
	checks.push("confirmed-quit-reaps-encoder");
	await request(prefix, null, "DELETE");
	prefix = undefined;
	await open();
	await identify();
	const restored = await invoke("queue_snapshot");
	assert.equal(restored.processing, false);
	assert.equal(restored.output_authorized, false);
	assert.ok(restored.tasks.every((t) => !t.authorized));
	assert.equal(restored.tasks.find((t) => t.id === bigId).phase, "cancelled");
	assert.equal(
		restored.tasks.find((t) => t.id === queuedId).phase,
		"cancelled",
	);
	assert.equal(restored.tasks.find((t) => t.id === smallId).phase, "saved");
	assert.deepEqual(await readFile(savedPath), savedBytes);
	assert.deepEqual(
		await Promise.all([readFile(fixture), readFile(big)]),
		originals,
	);
	assert.ok(
		(await readdir(output)).every((n) => !n.startsWith(".")),
		"Temporary output leaked",
	);
	await writeFile(
		join(root, "restored-queue.json"),
		JSON.stringify(restored, null, 2) + "\n",
	);
	checks.push(
		"restart-cancelled-no-auto-resume",
		"original-and-saved-files-preserved",
		"temporary-output-cleaned",
	);
	await close();
	await until(
		async () => !(await processExists(pid)),
		"Idle close did not exit",
	);
	assert.equal((await windows(dialogTitle)).length, 0);
	checks.push("idle-close-without-confirmation");
	passed = true;
} finally {
	for (const child of heldEncoders) {
		try {
			process.kill(child, "SIGCONT");
		} catch (e) {
			if (e.code !== "ESRCH") logs += `\nEncoder resume: ${e.message}`;
		}
	}
	if (!passed) {
		try {
			await execute(
				"import",
				["-window", "root", join(root, "failure.png")],
				{ timeout: 10000 },
			);
		} catch {
			/* Display may have closed with the app. */
		}
	}
	if (prefix) {
		try {
			await request(prefix, null, "DELETE");
		} catch (e) {
			logs += `\nSession cleanup: ${e.message}`;
		}
	}
	driver.kill("SIGTERM");
	await writeFile(join(root, "driver.txt"), logs);
	await writeFile(
		join(root, "report.json"),
		JSON.stringify(
			{
				schema: 1,
				status: passed ? "passed" : "failed",
				platform: `${process.platform}/${process.arch}`,
				checks,
				installation: "not-run",
				menuQuit: "not-run-on-linux",
			},
			null,
			2,
		) + "\n",
	);
	console.log(root);
}
