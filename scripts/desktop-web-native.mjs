import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pdfFixture } from "../tests/helpers-pdf-fixture.mjs";
const execute = promisify(execFile);
const root = await mkdtemp("/tmp/z8-web-native-");
const application = resolve(
	process.env.Z8_GUI_BINARY || "src-tauri/target/debug/z8-desktop",
);
const driver = spawn(
	"tauri-driver",
	["--port", "4468", "--native-port", "4469"],
	{
		env: {
			...process.env,
			XDG_DATA_HOME: join(root, "data"),
			XDG_CONFIG_HOME: join(root, "config"),
			XDG_CACHE_HOME: join(root, "cache"),
		},
		stdio: ["ignore", "pipe", "pipe"],
	},
);
let logs = "";
driver.stdout.on("data", (d) => {
	logs += d;
});
driver.stderr.on("data", (d) => {
	logs += d;
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(path, data, method = "POST") {
	const response = await fetch("http://127.0.0.1:4468" + path, {
		method,
		headers: { "Content-Type": "application/json" },
		...(data ? { body: JSON.stringify(data) } : {}),
		signal: AbortSignal.timeout(180000),
	});
	const result = await response.json();
	if (!response.ok || result.value?.error)
		throw new Error(JSON.stringify(result));
	return result.value;
}
let prefix;
async function until(fn, reason, timeout = 30000) {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		const value = await fn();
		if (value) return value;
		await pause(100);
	}
	throw new Error(reason);
}
const js = (script, args = []) =>
	req(prefix + "/execute/sync", { script, args });
try {
	await until(async () => {
		try {
			await req("/status", null, "GET");
			return true;
		} catch {
			return false;
		}
	}, "Driver not ready");
	const session = await req("/session", {
		capabilities: { alwaysMatch: { "tauri:options": { application } } },
	});
	prefix = `/session/${session.sessionId}`;
	await req(prefix + "/timeouts", { script: 150000 });
	await until(
		() => js('return !!document.querySelector("input[type=file]:enabled")'),
		"App not ready",
	);
	console.log("Native WebView loaded", await js("return location.href"));
	const wave = Buffer.alloc(16044);
	wave.write("RIFF");
	wave.writeUInt32LE(16036, 4);
	wave.write("WAVEfmt ", 8);
	wave.writeUInt32LE(16, 16);
	wave.writeUInt16LE(1, 20);
	wave.writeUInt16LE(1, 22);
	wave.writeUInt32LE(8000, 24);
	wave.writeUInt32LE(16000, 28);
	wave.writeUInt16LE(2, 32);
	wave.writeUInt16LE(16, 34);
	wave.write("data", 36);
	wave.writeUInt32LE(16000, 40);
	const fixtures = [
		[
			"image.svg",
			Buffer.from(
				'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>',
			),
			"image/svg+xml",
			".png",
		],
		["audio.wav", wave, "audio/wav", ".flac"],
		[
			"document.md",
			Buffer.from("# Desktop native web\n\nDocument test."),
			"text/markdown",
			".html",
		],
		["page.pdf", Buffer.from(pdfFixture()), "application/pdf", ".png"],
	];
	for (const [name, bytes, type, format] of fixtures) {
		if (name !== fixtures[0][0]) {
			await req(prefix + "/refresh", {});
			await until(
				() =>
					js(
						'return !!document.querySelector("input[type=file]:enabled")',
					),
				"App not ready after refresh",
			);
		}
		await js(
			`const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(arguments[1]),c=>c.charCodeAt(0))],arguments[0],{type:arguments[2]}));const input=document.querySelector('input[type=file]:enabled');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));`,
			[name, bytes.toString("base64"), type],
		);
		await until(
			() => js('return !!document.querySelector(".compact-file")'),
			"File not imported",
		);
		await js('document.querySelector(".pixel-file-format button").click()');
		await until(
			() => js('return !!document.querySelector("dialog[open] input")'),
			"Format picker not ready",
		);
		await js(
			'const input=document.querySelector("dialog[open] input");input.value=arguments[0];input.dispatchEvent(new Event("input",{bubbles:true}));',
			[format],
		);
		await until(
			() =>
				js(
					'return [...document.querySelectorAll("dialog[open] button")].some(b=>b.getAttribute("aria-label")===arguments[0])',
					[format],
				),
			"Format missing",
		);
		await js(
			'[...document.querySelectorAll("dialog[open] button")].find(b=>b.getAttribute("aria-label")===arguments[0]).click()',
			[format],
		);
		await js(
			'document.querySelector(".compact-file .pixel-square").click()',
		);
		await until(
			() =>
				js(
					'return ["complete","failed"].includes(document.querySelector(".compact-file")?.dataset.state)',
				),
			"Conversion timeout",
			150000,
		);
		assert.equal(
			await js(
				'return document.querySelector(".compact-file").dataset.state',
			),
			"complete",
			await js(
				'return document.querySelector(".compact-file").innerText',
			),
		);
		const destination = join(root, name + format);
		await js(
			'document.querySelector(".compact-file .pixel-square").click()',
		);
		await until(async () => {
			try {
				await execute("xdotool", [
					"search",
					"--onlyvisible",
					"--name",
					"Save",
					"windowfocus",
				]);
				return true;
			} catch {
				return false;
			}
		}, "Save dialog not found");
		if (name === "image.svg") {
			await execute("xdotool", ["key", "Escape"]);
			await pause(300);
			assert.equal(
				await js(
					'return document.querySelector(".compact-file").dataset.state',
				),
				"complete",
			);
			await js(
				'document.querySelector(".compact-file .pixel-square").click()',
			);
			await until(async () => {
				try {
					await execute("xdotool", [
						"search",
						"--onlyvisible",
						"--name",
						"Save",
						"windowfocus",
					]);
					return true;
				} catch {
					return false;
				}
			}, "Retry save dialog not found");
			console.log(
				"Cancelled native save retains converted output for retry",
			);
		}
		await execute("xdotool", ["key", "ctrl+l"]);
		await pause(200);
		await execute("xdotool", ["key", "ctrl+a"]);
		await execute("xdotool", [
			"type",
			"--clearmodifiers",
			"--delay",
			"5",
			destination,
		]);
		await execute("xdotool", ["key", "Return"]);
		await until(async () => {
			try {
				return (await readFile(destination)).length > 0;
			} catch {
				return false;
			}
		}, "Saved file not found");
		const output = await readFile(destination);
		if (format === ".png")
			assert.equal(output.subarray(1, 4).toString(), "PNG");
		if (format === ".flac")
			assert.equal(output.subarray(0, 4).toString(), "fLaC");
		if (format === ".html")
			assert.match(
				output.toString(),
				/<h1[^>]*>Desktop native web<\/h1>/,
			);
		console.log(
			`Native ${name} -> ${format}: saved ${output.length} validated bytes`,
		);
	}
	const denied = await req(prefix + "/execute/async", {
		script: 'const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke("queue_snapshot").then(()=>done("unexpected"),e=>done(String(e)));',
		args: [],
	});
	assert.match(denied, /not found|not allowed/i);
	await mkdir(".desktop-local/web-conversion", { recursive: true });
	await writeFile(
		".desktop-local/web-conversion/native.png",
		Buffer.from(await req(prefix + "/screenshot", null, "GET"), "base64"),
	);
	console.log(
		"Native four-engine conversion and system save passed; legacy command denied.",
		root,
	);
} catch (error) {
	if (prefix) {
		console.error(await js("return document.body.innerText").catch(String));
		await writeFile(
			join(root, "failure.png"),
			Buffer.from(
				await req(prefix + "/screenshot", null, "GET").catch(() => ""),
				"base64",
			),
		);
	}
	console.error(logs);
	throw error;
} finally {
	if (prefix) await req(prefix, null, "DELETE").catch(() => {});
	driver.kill();
	await writeFile(join(root, "driver.log"), logs);
}
