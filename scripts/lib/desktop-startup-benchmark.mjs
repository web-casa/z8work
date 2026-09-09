import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

// Development fixtures only. Time includes WebDriver session setup; not a
// compositor first-paint or OS cold-cache benchmark. Run with an empty queue.
export async function benchmarkStartup({
	root,
	manifestPath,
	open,
	close,
	invoke,
	js,
	until,
	checks,
}) {
	const original = await readFile(manifestPath, "utf8");
	const release = join(root, "release-probe");
	const measurements = [];
	let failure = null;
	let stage = "before start";
	let lastStates = null;
	await close();
	try {
		for (const mode of ["ready", "blocked-magick", "missing-magick"]) {
			for (let repeat = 1; repeat <= 20; repeat++) {
				stage = `${mode} ${repeat}`;
				console.error(`[startup benchmark] ${stage}`);
				const manifest = JSON.parse(original);
				if (mode === "missing-magick") delete manifest.engines.magick;
				await writeFile(manifestPath, JSON.stringify(manifest));
				await writeFile(release, "release");
				if (mode === "blocked-magick") await unlink(release);
				const started = performance.now();
				await open();
				await until(
					() =>
						js(
							'return !document.querySelector("[data-choose-files]").disabled',
						),
					"Startup controls blocked",
				);
				const interactiveMs = performance.now() - started;
				const atInteractive = await invoke("desktop_info");
				if (mode === "blocked-magick")
					assert.equal(
						atInteractive.startup.find((s) => s.id === "magick")
							.phase,
						"preparing",
					);
				const info = await until(
					async () => {
						const info = await invoke("desktop_info");
						lastStates = info.startup;
						return (
							info.startup
								.filter(
									(s) =>
										mode !== "blocked-magick" ||
										s.id !== "magick",
								)
								.every((s) => s.phase !== "preparing") && info
						);
					},
					"Independent engines did not settle",
					40000,
				);
				const independentEnginesMs = performance.now() - started;
				const magickPhase = info.startup.find(
					(s) => s.id === "magick",
				).phase;
				if (mode === "blocked-magick")
					assert.ok(["preparing", "failed"].includes(magickPhase));
				else
					assert.equal(
						magickPhase,
						mode === "ready" ? "ready" : "failed",
					);
				assert.ok(
					info.startup
						.filter((s) => s.id !== "magick")
						.every((s) => s.phase === "ready"),
				);
				measurements.push({
					mode,
					repeat,
					profile:
						"existing configuration; process restart; OS cache not flushed",
					interactiveMs,
					independentEnginesMs,
					engineStates: info.startup,
					interactiveEngineStates: atInteractive.startup,
				});
				await close();
			}
		}
	} catch (error) {
		failure = `${stage}: ${String(error)}`;
		throw error;
	} finally {
		await writeFile(manifestPath, original);
		await writeFile(release, "release");
		await writeFile(
			join(root, "startup-benchmark.json"),
			JSON.stringify(
				{
					schema: 1,
					status: failure ? "failed" : "passed",
					failure,
					lastStates,
					platform: process.platform + "-" + process.arch,
					method: "WebDriver session request to interactive language/choose-file controls; independent engines exclude deliberately blocked magick",
					measurements,
				},
				null,
				2,
			) + "\n",
		);
	}
	await open();
	checks.push("startup-normal-blocked-missing-20-process-restarts-each");
}
