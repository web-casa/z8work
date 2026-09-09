import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Start tauri-driver inside a graphical session first; see docs/desktop/PHASE1_IMPLEMENTATION.md.
const base = process.env.Z8_WEBDRIVER_URL ?? "http://127.0.0.1:4456";
const application =
	process.env.Z8_DESKTOP_BINARY ??
	resolve("src-tauri/target/debug/z8-desktop");
async function request(path, data, method = "POST") {
	const response = await fetch(base + path, {
		method,
		headers: { "Content-Type": "application/json" },
		...(data ? { body: JSON.stringify(data) } : {}),
		signal: AbortSignal.timeout(30000),
	});
	const result = await response.json();
	if (!response.ok || result.value?.error)
		throw new Error(JSON.stringify(result));
	return result.value;
}
const session = await request("/session", {
	capabilities: { alwaysMatch: { "tauri:options": { application } } },
});
const prefix = `/session/${session.sessionId}`;
try {
	await request(`${prefix}/timeouts`, { script: 15000 });
	const exec = (script, args = []) =>
		request(`${prefix}/execute/sync`, { script, args });
	const asyncExec = (script) =>
		request(`${prefix}/execute/async`, { script, args: [] });
	const deadline = Date.now() + 15000;
	while (!(await exec('return !!document.querySelector("h1")'))) {
		if (Date.now() > deadline) throw new Error("Desktop did not render");
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	const preferencesReady = async () => {
		const end = Date.now() + 15000;
		while (
			await exec(
				'return document.querySelector(".language select").disabled',
			)
		) {
			if (Date.now() > end) throw new Error("Preferences did not settle");
			await new Promise((r) => setTimeout(r, 50));
		}
	};
	await preferencesReady();
	const info = await asyncExec(
		'const done = arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke("desktop_info").then(done, e=>done({error:String(e)}));',
	);
	assert.equal(info.error, null);
	assert.equal(info.engines.length, 5);
	assert.equal(info.queue_error, null);
	const denied = await asyncExec(
		'const done = arguments[arguments.length-1]; Promise.all([window.__TAURI_INTERNALS__.invoke("convert_file", {id:"invented",format:"png"}).then(()=>"unexpected success",String), window.__TAURI_INTERNALS__.invoke("plugin:fs|read_text_file", {path:"/etc/hostname"}).then(()=>"unexpected success",String)]).then(done);',
	);
	assert.match(denied[0], /not allowed|not found/i);
	assert.match(denied[1], /not allowed|not found/i);
	await exec(
		'const select = document.querySelector(".language select"); select.value="en"; select.dispatchEvent(new Event("change",{bubbles:true}));',
	);
	await preferencesReady();
	assert.equal(await exec("return document.documentElement.lang"), "en");
	assert.match(
		await exec('return document.querySelector("h1").textContent'),
		/local file workspace/,
	);
	await exec(
		'const select = document.querySelector(".language select"); select.value="zh_hans"; select.dispatchEvent(new Event("change",{bubbles:true}));',
	);
	await preferencesReady();
	const snapshot = await asyncExec(
		'const done = arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke("queue_snapshot").then(done,e=>done({error:String(e)}));',
	);
	assert.equal(snapshot.schema, 3);
	await request(`${prefix}/refresh`, {});
	const restored = await asyncExec(
		'const done = arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke("queue_snapshot").then(done,e=>done({error:String(e)}));',
	);
	assert.equal(restored.epoch, snapshot.epoch);
	assert.equal(restored.tasks.length, snapshot.tasks.length);
	const screenshot = await request(`${prefix}/screenshot`, null, "GET");
	await mkdir(".desktop-local", { recursive: true });
	await writeFile(
		".desktop-local/desktop.png",
		Buffer.from(screenshot, "base64"),
	);
	await writeFile(
		".desktop-local/gui-smoke.json",
		`${JSON.stringify({ architecture: info.architecture, engineCount: info.engines.length, rendered: true, localeSwitch: true, reloadSnapshot: true, denied, scope: "native WebKit window and IPC; file picker IO is a separate interactive check" }, null, 2)}\n`,
	);
	console.log(
		"Native window, engine status, locale switch and IPC rejection checks passed.",
	);
} finally {
	await request(prefix, null, "DELETE");
}
