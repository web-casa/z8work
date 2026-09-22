import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, copyFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
export async function startupFixture(root, manifestPath) {
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const release = join(root, "release-probe"),
		wrapper = join(root, "slow-magick"),
		path = join(root, "startup-engines.json");
	const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
	const script = `#!/bin/sh\nif [ "$1" = "-version" ]; then\n while [ ! -f ${quote(release)} ]; do sleep 0.05; done\nfi\nexec ${quote(manifest.engines.magick.path)} "$@"\n`;
	await writeFile(wrapper, script, { mode: 0o700 });
	manifest.engines.magick.path = wrapper;
	manifest.engines.magick.sha256 = createHash("sha256")
		.update(script)
		.digest("hex");
	const slowAudio = join(root, "slow-audio"),
		ffmpeg = manifest.engines.ffmpeg.path,
		audioWrapper = join(root, "paced-ffmpeg");
	const audioScript = `#!/bin/sh\nfor arg in "$@"; do\n if [ "$arg" = "-progress" ] && [ -f ${quote(slowAudio)} ]; then exec ${quote(ffmpeg)} -re "$@"; fi\ndone\nexec ${quote(ffmpeg)} "$@"\n`;
	await writeFile(audioWrapper, audioScript, { mode: 0o700 });
	manifest.engines.ffmpeg.path = audioWrapper;
	manifest.engines.ffmpeg.sha256 = createHash("sha256")
		.update(audioScript)
		.digest("hex");
	await writeFile(path, JSON.stringify(manifest));
	return {
		path,
		async blockAgain() {
			await unlink(release);
		},
		async checkExit({ invoke, windows, execute, until, checks }) {
			try {
				assert.equal(
					(await invoke("desktop_info")).startup.find(
						(s) => s.id === "magick",
					).phase,
					"preparing",
				);
				const win = (await windows("^Z8.Work — Desktop$"))[0];
				const started = performance.now();
				await execute(
					"python3",
					["scripts/lib/desktop-quit-window.py", "close", win],
					{ timeout: 5000 },
				);
				await until(
					async () => !(await windows("^Z8.Work — Desktop$")).length,
					"Quit did not stop blocked startup probe",
				);
				const elapsed = performance.now() - started;
				assert.ok(elapsed < 4000, `Startup quit took ${elapsed}ms`);
				await writeFile(
					join(root, "startup-exit.json"),
					JSON.stringify(
						{ elapsedMs: elapsed, limitMs: 4000 },
						null,
						2,
					),
				);
				checks.push(
					"native-quit-cancels-blocked-probe-without-waiting-for-timeout",
				);
			} finally {
				await writeFile(release, "release");
			}
		},
		async check({ invoke, js, change, choose, until, screenshot, checks }) {
			try {
				const info = await invoke("desktop_info");
				assert.equal(
					info.startup.find((s) => s.id === "magick").phase,
					"preparing",
				);
				await change(".language select", "zh_hans");
				await until(
					async () =>
						(await invoke("desktop_info")).startup.find(
							(s) => s.id === "ffmpeg",
						).phase === "ready",
					"Other engine blocked behind magick",
				);
				await screenshot(
					"startup-interactive-zh.png",
					"[data-startup]",
				);
				const input = join(root, "early.png");
				await copyFile("tests/fixtures/cover.png", input);
				await choose(
					"pick_inputs",
					input,
					"^Z8.Work — (Select input files|选择输入文件|Select input files / 选择输入文件)$",
				);
				const s = await until(async () => {
					const s = await invoke("queue_snapshot");
					return s.tasks.length && s;
				}, "Early picker input lost");
				assert.equal(s.tasks[0].name, "early.png");
				assert.equal(s.tasks[0].attempt, 0);
				assert.equal(s.tasks[0].phase, "ready");
				assert.equal(
					(await invoke("desktop_info")).startup.find(
						(s) => s.id === "magick",
					).phase,
					"preparing",
				);
				assert.ok(
					await js(
						'return document.querySelector("h1").textContent.includes("本地")',
					),
				);
				await invoke("remove_tasks", { ids: [] });
				checks.push(
					"first-screen-and-language-interactive-during-blocked-probe",
					"ready-engines-independent-of-blocked-probe",
					"native-early-input-retained-without-auto-conversion",
				);
			} finally {
				await writeFile(release, "release");
			}
			await until(
				async () =>
					(await invoke("desktop_info")).startup.every(
						(s) => s.phase === "ready",
					),
				"Engine failed after release",
			);
		},
		async checkProgress({
			invoke,
			js,
			change,
			choose,
			until,
			screenshot,
			checks,
			output,
			submit,
		}) {
			await change(".language select", "zh_hans");
			const audio = join(root, "progress.wav");
			await promisify(execFile)(
				ffmpeg,
				[
					"-v",
					"error",
					"-f",
					"lavfi",
					"-i",
					"sine=frequency=440:duration=4",
					audio,
				],
				{ timeout: 10000 },
			);
			await choose(
				"pick_output",
				output,
				"^Z8.Work — (Select output folder|选择保存目录|Select output folder / 选择保存目录)$",
			);
			await choose(
				"pick_inputs",
				audio,
				"^Z8.Work — (Select input files|选择输入文件|Select input files / 选择输入文件)$",
			);
			const task = (await invoke("queue_snapshot")).tasks.find(
				(t) => t.name === "progress.wav",
			);
			await invoke("set_task_format", { id: task.id, format: "mp3" });
			await writeFile(slowAudio, "pace");
			const samples = [];
			try {
				await submit(task.id);
				await until(async () => {
					const s = await invoke("queue_snapshot");
					if (s.progress) {
						samples.push(s.progress);
						assert.ok(
							s.progress.value.percent === null ||
								s.progress.value.percent < 100,
						);
					}
					return samples.some((p) => p.value.percent !== null);
				}, "Real FFmpeg progress missing");
				await until(
					() =>
						js(
							'return !!document.querySelector("[data-task-progress]")',
						),
					"Progress not rendered",
				);
				await screenshot(
					"audio-progress-zh.png",
					"[data-task-progress]",
				);
				const saved = await until(async () => {
					const s = await invoke("queue_snapshot");
					if (s.progress) samples.push(s.progress);
					return !s.processing && s;
				}, "Paced conversion did not finish");
				assert.equal(
					saved.tasks.find((t) => t.id === task.id).phase,
					"saved",
				);
				assert.equal(saved.progress, undefined);
				await writeFile(
					join(root, "progress-samples.json"),
					JSON.stringify(samples, null, 2),
				);
				checks.push(
					"real-ffmpeg-progress-before-publication",
					"progress-cleared-after-save-without-false-100-percent",
				);
			} finally {
				await unlink(slowAudio);
			}
			await invoke("remove_tasks", { ids: [task.id] });
		},
	};
}
