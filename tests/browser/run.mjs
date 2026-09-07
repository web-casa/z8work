import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";

const base = process.env.IIPE_TEST_BASE || "http://127.0.0.1:5186";
const env = { ...process.env, IIPE_TEST_BASE: base };
if (!env.CHROMIUM_PATH && existsSync("/usr/bin/chromium"))
	env.CHROMIUM_PATH = "/usr/bin/chromium";
let server;
try {
	if (!process.env.IIPE_TEST_BASE) {
		server = spawn(
			process.execPath,
			[
				"node_modules/vite/bin/vite.js",
				"preview",
				"--host",
				"127.0.0.1",
				"--port",
				"5186",
				"--strictPort",
			],
			{ stdio: "inherit", env },
		);
		let ready = false;
		for (let attempt = 0; attempt < 60; attempt++) {
			if (server.exitCode !== null)
				throw new Error("Preview server exited before it was ready");
			try {
				if (
					(await fetch(base, { signal: AbortSignal.timeout(1000) }))
						.ok
				) {
					ready = true;
					break;
				}
			} catch {
				/* Startup is bounded by the loop and per-request timeout. */
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		if (!ready) throw new Error("Preview server did not become ready");
	}
	for (const [script, extra = {}] of [
		["resource-lifecycle"],
		["local-audio"],
		["workspace"],
		["input-support"],
		["pdf-images"],
		["pdf-format-matrix"],
		["pdf-load-retry"],
		["pdf-load-retry", { IIPE_PDF_ENGINE: "magick" }],
		["format-dialog-focus"],
		["format-choices"],
		["image-fidelity"],
	]) {
		console.log(`Browser regression: ${script} ${JSON.stringify(extra)}`);
		const child = spawn(process.execPath, [`tests/browser/${script}.mjs`], {
			stdio: "inherit",
			env: { ...env, ...extra },
		});
		const [code] = await once(child, "exit");
		if (code !== 0)
			throw new Error(`${script} failed with exit code ${code}`);
	}
} finally {
	if (server && server.exitCode === null) {
		const exited = once(server, "exit");
		server.kill("SIGTERM");
		const force = setTimeout(() => server.kill("SIGKILL"), 5000);
		await exited;
		clearTimeout(force);
	}
}
