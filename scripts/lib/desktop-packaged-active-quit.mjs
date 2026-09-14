import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	readFile,
	copyFile,
	writeFile,
	mkdir,
	readdir,
	realpath,
	readlink,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import {
	processIdentity,
	sameProcess,
	encoderChildren,
	signalEncoder,
} from "./desktop-linux-process.mjs";
const execute = promisify(execFile);
export async function checkPackagedActiveQuit({
	root,
	invoke,
	js,
	change,
	choose,
	until,
	screenshot,
	checks,
	xdotool,
	windows,
	open,
	close,
}) {
	await change(".language select", "en");
	await until(
		async () =>
			(await invoke("desktop_info")).engines.every((e) => e.available),
		"Engines not ready",
		120000,
	);
	const config = JSON.parse(
		await readFile("src-tauri/tauri.conf.json", "utf8"),
	);
	const engineRoot = resolve(
		dirname(process.env.Z8_GUI_BINARY),
		"../lib",
		config.productName,
		"engines",
	);
	const manifest = JSON.parse(
		await readFile(join(engineRoot, "engines.json"), "utf8"),
	);
	const entry = manifest.engines.magick;
	const magick = await realpath(join(engineRoot, entry.path));
	const executable = manifest.loader
		? await realpath(join(engineRoot, manifest.loader))
		: magick;
	const library = join(engineRoot, entry.library_dir);
	const prefix = manifest.loader
		? ["--inhibit-cache", "--library-path", library, magick]
		: [];
	const env = {
		...process.env,
		LD_LIBRARY_PATH: library,
		MAGICK_CONFIGURE_PATH: join(engineRoot, manifest.magick_config),
		MAGICK_CODER_MODULE_PATH: join(engineRoot, manifest.magick_modules),
		LIBHEIF_PLUGIN_PATH: join(engineRoot, manifest.heif_plugins),
	};
	const input = join(root, "active-fixture", "active.png"),
		output = join(root, "active-output");
	await mkdir(output);
	await mkdir(dirname(input));
	await execute(
		executable,
		[...prefix, "-size", "2048x2048", "plasma:fractal", input],
		{ timeout: 30000, env },
	);
	const original = await readFile(input);
	await choose("button-input", input, "^Z8.Work — Select input files$");
	const task = await until(
		async () => (await invoke("queue_snapshot")).tasks[0],
		"Active fixture missing",
	);
	await change(`[data-task-id="${task.id}"] select`, "avif");
	const queuedInput = join(dirname(input), "queued.png");
	await copyFile(join(root, "sample.png"), queuedInput);
	const queuedOriginal = await readFile(queuedInput);
	await choose("button-input", queuedInput, "^Z8.Work — Select input files$");
	const queued = await until(
		async () =>
			(await invoke("queue_snapshot")).tasks.find(
				(t) => t.name === "queued.png",
			),
		"Queued fixture missing",
	);
	await change(`[data-task-id="${queued.id}"] select`, "webp");
	const assertQueued = (state, phase) => {
		assert.equal(state.tasks.length, 2);
		const pending = state.tasks.find((t) => t.id === queued.id);
		assert.ok(pending);
		assert.equal(pending.phase, phase);
		assert.equal(pending.attempt, 1);
		assert.equal(pending.result, null);
	};

	await choose(
		"button-output",
		output + "/",
		"^Z8.Work — Select output folder$",
	);
	const main = (await windows("^Z8.Work — Desktop$"))[0];
	const pid = Number(await xdotool("getwindowpid", main));
	assert.ok(Number.isInteger(pid) && pid > 0);
	const app = await processIdentity(pid);
	assert.ok(app);
	let held = [];
	try {
		await until(
			() =>
				js(
					'return !document.querySelector("[data-start-conversion]").disabled',
				),
			"Conversion disabled",
		);
		await js('document.querySelector("[data-start-conversion]").click()');
		held = await until(
			async () => {
				const found = await encoderChildren(pid, executable, magick);
				const encoding = [];
				for (const child of found) {
					try {
						const command = (
							await readFile(`/proc/${child.pid}/cmdline`, "utf8")
						)
							.split("\0")
							.filter(Boolean);
						const cwd = await readlink(`/proc/${child.pid}/cwd`);
						if (
							command.includes("-auto-orient") &&
							command.includes("heic:speed=6") &&
							/^AVIF:.*output\.avif$/.test(command.at(-1)) &&
							cwd.startsWith(join(root, "cache") + "/")
						)
							encoding.push({ ...child, command, cwd });
					} catch (e) {
						if (!["ENOENT", "ESRCH"].includes(e.code)) throw e;
					}
				}
				return encoding.length && encoding;
			},
			"Real encoder not observed",
			10000,
		);
		for (const child of held)
			assert.equal(
				await signalEncoder(child, pid, executable, "SIGSTOP", magick),
				true,
			);
		await until(async () => {
			for (const child of held)
				if ((await sameProcess(child))?.state !== "T") return false;
			return true;
		}, "Encoder did not enter injected stopped state");
		const running = await invoke("queue_snapshot");
		assert.equal(running.processing, true);
		assert.equal(running.tasks[0].phase, "running");
		assert.equal(running.tasks[0].attempt, 1);
		assert.equal(running.tasks[0].id, task.id);
		assertQueued(running, "queued");
		await screenshot("active-running.png", `[data-task-id="${task.id}"]`);
		const requestClose = () =>
			execute(
				"python3",
				["scripts/lib/desktop-quit-window.py", "close", main],
				{ timeout: 5000 },
			);
		const title = "^Z8.Work — Confirm exit$";
		const dialog = () =>
			until(async () => {
				const ids = await windows(title);
				assert.ok(ids.length <= 1);
				return ids[0];
			}, "Active close confirmation missing");
		await requestClose();
		const first = await dialog();
		await requestClose();
		await requestClose();
		assert.equal((await windows(title)).length, 1);
		await xdotool("windowfocus", first);
		await xdotool("key", "Escape");
		await until(
			async () => (await windows(title)).length === 0,
			"Active confirmation did not dismiss",
		);
		const stays = await invoke("queue_snapshot");
		assert.equal(stays.closing, false);
		assert.equal(stays.processing, true);
		assert.equal(stays.tasks[0].phase, "running");
		assert.equal(stays.tasks[0].attempt, 1);
		assertQueued(stays, "queued");
		await screenshot("active-queued.png", `[data-task-id="${queued.id}"]`);
		for (const child of held)
			assert.equal((await sameProcess(child))?.state, "T");
		checks.push(
			"active-encoder-injected-stop-escape-preserves-running-task",
		);
		await requestClose();
		await dialog();
		const started = performance.now();
		await execute(
			"python3",
			[
				"scripts/lib/desktop-quit-window.py",
				"click",
				String(pid),
				"Stop and quit",
			],
			{ timeout: 10000 },
		);
		await until(
			async () => !(await sameProcess(app)),
			"Confirmed active quit did not exit",
			30000,
		);
		for (const child of held)
			await until(
				async () => !(await sameProcess(child)),
				"Observed encoder survived native exit",
				10000,
			);
		const elapsedMs = performance.now() - started;
		assert.deepEqual(
			await readdir(output),
			[],
			"Cancelled conversion published output",
		);
		assert.deepEqual(await readFile(input), original);
		checks.push(
			"active-confirmed-native-quit-reaps-observed-encoder-without-output",
		);
		await close(); // Dispose only after the native app and observed encoder exited.
		await open();
		const restored = await invoke("queue_snapshot");
		assert.equal(restored.processing, false);
		assert.equal(restored.output_authorized, false);
		assertQueued(restored, "cancelled");
		assert.equal(
			restored.tasks.find((t) => t.id === queued.id).authorized,
			false,
		);
		assert.equal(restored.tasks[0].phase, "cancelled");
		assert.equal(restored.tasks[0].attempt, 1);
		assert.equal(restored.tasks[0].authorized, false);
		await writeFile(
			join(root, "active-restored.json"),
			JSON.stringify(restored, null, 2) + "\n",
		);
		await until(
			async () =>
				(await invoke("desktop_info")).engines.every(
					(e) => e.available,
				),
			"Restart engines not ready",
			120000,
		);
		assert.deepEqual(await readdir(output), []);
		assert.deepEqual(await readFile(input), original);
		const settled = await invoke("queue_snapshot");
		assertQueued(settled, "cancelled");
		assert.equal(
			settled.tasks.find((t) => t.id === task.id).phase,
			"cancelled",
		);
		assert.equal(settled.processing, false);
		assert.equal(settled.output_authorized, false);
		assert.ok(settled.tasks.every((t) => !t.authorized));
		assert.deepEqual(await readFile(queuedInput), queuedOriginal);
		await writeFile(
			join(root, "queued-details.json"),
			JSON.stringify(
				{
					schema: 1,
					runningTaskId: task.id,
					queuedTaskId: queued.id,
					beforeClose: running,
					afterEscape: stays,
					afterRestartReady: settled,
					outputFiles: 0,
					queuedOriginal: {
						bytes: queuedOriginal.length,
						sha256: createHash("sha256")
							.update(queuedOriginal)
							.digest("hex"),
					},
				},
				null,
				2,
			) + "\n",
		);
		checks.push(
			"queued-task-survives-escape-cancels-on-quit-and-never-auto-resumes",
		);

		await js('document.querySelector(".toolbar .danger").click()');
		await until(
			async () => (await invoke("queue_snapshot")).tasks.length === 0,
			"Active history clear failed",
		);
		checks.push(
			"active-quit-restart-cancelled-no-auto-resume-or-authorization",
		);
		await writeFile(
			join(root, "active-details.json"),
			JSON.stringify(
				{
					schema: 1,
					faultInjection:
						"SIGSTOP on observed app-owned ImageMagick process",
					observedEncoders: held,
					encoderExecutable: magick,
					elapsedMs,
					appExited: true,
					observedEncodersExited: true,
					outputFiles: 0,
					restoredPhase: "cancelled",
					original: {
						bytes: original.length,
						sha256: createHash("sha256")
							.update(original)
							.digest("hex"),
					},
				},
				null,
				2,
			) + "\n",
		);
	} finally {
		// Failure recovery never counts as successful app cancellation.
		for (const child of held)
			if (await sameProcess(child))
				await signalEncoder(child, pid, executable, "SIGCONT", magick);
	}
}
