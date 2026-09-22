// Native Linux WebKit test with an isolated application profile and fixture-only preferences.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
	readdir,
	rename,
	rmdir,
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
const root = await mkdtemp(resolve(".desktop-local/phase15-gui-"));
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
async function until(fn, reason) {
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		if (await fn()) return;
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
async function findPreferenceFile(path) {
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const name = join(path, entry.name);
		if (entry.name === "preferences-v1.json") return name;
		if (entry.isDirectory()) {
			const found = await findPreferenceFile(name);
			if (found) return found;
		}
	}
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
	assert.equal((await invoke("read_preferences")).revision, 0);
	assert.equal((await invoke("desktop_info")).error, null);
	const lang = ".language select";
	await change(lang, "en");
	await until(
		() => js('return document.documentElement.lang === "en"'),
		"English not applied",
	);
	await js('document.querySelector(".batch-settings").open=true');
	await change(".batch-settings select", "avif");
	await change(".batch-settings .options-editor select", "high");
	// Select the PDF resolution by its numeric options, independent of translation.
	await js(
		'const e=[...document.querySelectorAll(".batch-settings select")].find(e=>[...e.options].some(o=>o.textContent==="96 DPI"));e.value="96";e.dispatchEvent(new Event("change",{bubbles:true}));',
	);
	await ready();
	const saved = await invoke("read_preferences");
	assert.equal(saved.preferences.batch_format, "avif");
	assert.equal(saved.preferences.batch_options.quality, "high");
	assert.equal(saved.preferences.batch_options.pdf_dpi, 96);
	const file = await findPreferenceFile(join(root, "data"));
	assert.ok(file);
	await request(`${prefix}/refresh`, {});
	await ready();
	assert.equal(
		await js('return document.querySelector(".language select").value'),
		"en",
	);
	assert.equal(
		await js(
			'return document.querySelector(".batch-settings select").value',
		),
		"avif",
	);
	await request(prefix, null, "DELETE");
	prefix = undefined;
	await open();
	assert.deepEqual(await invoke("read_preferences"), saved);
	// Deny the next preference write without touching a real user's profile.
	const backup = `${file}.test-backup`;
	await rename(file, backup);
	await mkdir(file);
	await change(lang, "zh_hans");
	await until(
		() => js('return !!document.querySelector("[data-preference-error]")'),
		"Save failure was hidden",
	);
	assert.deepEqual(JSON.parse(await readFile(backup, "utf8")), saved);
	await rmdir(file);
	await rename(backup, file);
	await js(
		'const b=[...document.querySelectorAll("[data-preference-error] button")].find(b=>b.textContent.includes("重试保存"));b.click();',
	);
	await until(
		() => js('return !document.querySelector("[data-preference-error]")'),
		"Save retry failed",
	);
	assert.equal(
		(await invoke("read_preferences")).preferences.language,
		"zh_hans",
	);
	const good = await readFile(file);
	await writeFile(file, '{"schema":99}');
	await request(`${prefix}/refresh`, {});
	await until(
		() => js('return !!document.querySelector("[data-preference-error]")'),
		"Invalid schema was hidden",
	);
	assert.equal(await readFile(file, "utf8"), '{"schema":99}');
	await until(
		() =>
			js(
				'return [...document.querySelectorAll("button")].some(b=>/选择文件|Choose files/.test(b.textContent)&&!b.disabled)',
			),
		"Preference error incorrectly blocked conversion workspace",
	);
	assert.equal((await invoke("queue_snapshot")).output_authorized, false);
	await writeFile(file, good);
	await js(
		'document.querySelector("[data-preference-error] button").click();',
	);
	await ready();
	assert.equal(await js("return document.documentElement.lang"), "zh-Hans");
	await assert.rejects(
		invoke("save_preferences", {
			expectedRevision: 0,
			preferences: saved.preferences,
		}),
		/changed/,
	);
	await assert.rejects(
		invoke("save_preferences", {
			expectedRevision: saved.revision,
			preferences: { ...saved.preferences, output_path: "/tmp" },
		}),
		/unknown field|invalid/i,
	);
	await writeFile(
		join(root, "desktop.png"),
		Buffer.from(
			await request(`${prefix}/screenshot`, null, "GET"),
			"base64",
		),
	);
	passed = true;
} finally {
	if (prefix) {
		try {
			await request(prefix, null, "DELETE");
		} catch (e) {
			logs += `\nSession cleanup: ${e.message}`;
			passed = false;
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
				scope: "linux-arm64-development-preferences-gui",
				checks: [
					"language",
					"batch-options",
					"reload",
					"application-restart",
					"write-failure-retry",
					"corrupt-record-preserved",
					"queue-not-blocked",
					"stale-and-unknown-field-rejected",
				],
				installation: "not-run",
			},
			null,
			2,
		) + "\n",
	);
	console.log(root);
}
if (!passed) process.exitCode = 1;
