import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	mkdir,
	copyFile,
	writeFile,
	readFile,
	readdir,
	lstat,
} from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { join } from "node:path";
const execute = promisify(execFile);

// Inspect only this harness's private cache. Lease markers can outlive payloads.
async function cachedWebp(root) {
	const found = [];
	for (const item of await readdir(root, { withFileTypes: true })) {
		const path = join(root, item.name);
		assert.ok(
			!item.isSymbolicLink(),
			"Unexpected symlink in isolated cache",
		);
		if (item.isDirectory()) found.push(...(await cachedWebp(path)));
		else if (item.isFile()) {
			const bytes = await readFile(path);
			if (
				bytes.toString("ascii", 0, 4) === "RIFF" &&
				bytes.toString("ascii", 8, 12) === "WEBP"
			)
				found.push(path);
		}
	}
	return found;
}
function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (error.code === "ESRCH") return false;
		throw error;
	}
}
export async function checkPackagedQuit({
	invoke,
	js,
	change,
	choose,
	until,
	screenshot,
	checks,
	xdotool,
	windows,
	root,
	open,
	close,
	saved,
	savedBytes,
}) {
	await change(".language select", "en");
	await until(
		async () =>
			(await invoke("desktop_info")).engines.every((e) => e.available),
		"Engines not ready after restart",
		120000,
	);
	const input = join(root, "quit-probe.png"),
		collisions = join(root, "quit-collisions");
	await copyFile(join(root, "sample.png"), input);
	const original = await readFile(input);
	await mkdir(collisions);
	for (let i = 1; i <= 1000; i++)
		await writeFile(
			join(collisions, `quit-probe-z8-${i}.webp`),
			"existing",
			{ flag: "wx" },
		);
	await choose("button-input", input, "^Z8.Work — Select input files$");
	const task = await until(
		async () => (await invoke("queue_snapshot")).tasks[0],
		"Quit sample missing",
	);
	await change(`[data-task-id="${task.id}"] select`, "webp");
	await choose(
		"button-output",
		collisions + "/",
		"^Z8.Work — Select output folder$",
	);
	await until(
		() =>
			js(
				'return !document.querySelector("[data-start-conversion]").disabled',
			),
		"Conversion not enabled",
	);
	await js('document.querySelector("[data-start-conversion]").click()');
	const pending = await until(
		async () => {
			const t = (await invoke("queue_snapshot")).tasks[0];
			if (t.phase === "failed") throw new Error(t.error);
			return t.phase === "awaiting_save" && t;
		},
		"Collisions did not retain converted output",
		120000,
	);
	assert.equal(pending.result, null);
	assert.match(pending.error, /Too many output filename collisions/);
	const cached = await cachedWebp(
		join(root, "cache/work.z8.desktop.m0/native-work-v1"),
	);
	assert.ok(cached.length > 0, "No retained WebP payload found");
	const cachedBytes = new Map();
	for (const path of cached) cachedBytes.set(path, await readFile(path));
	await screenshot(
		"quit-awaiting-save.png",
		`[data-task-id="${task.id}"] .saved-result-notice`,
	);
	const main = (await windows("^Z8.Work — Desktop$"))[0];
	const pid = Number(await xdotool("getwindowpid", main));
	assert.ok(Number.isInteger(pid) && pid > 0);
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
			assert.ok(ids.length <= 1, "Duplicate exit confirmations");
			return ids[0];
		}, "Unsaved output did not require confirmation");
	const stays = async () => {
		await until(
			async () => (await windows(title)).length === 0,
			"Confirmation did not dismiss",
		);
		const s = await invoke("queue_snapshot");
		assert.equal(s.closing, false);
		assert.equal(s.tasks[0].phase, "awaiting_save");
		assert.equal(s.tasks[0].attempt, 1);
		assert.equal(alive(pid), true);
		for (const path of cached)
			assert.deepEqual(await readFile(path), cachedBytes.get(path));
	};
	await requestClose();
	const first = await dialog();
	await requestClose();
	await requestClose();
	assert.equal((await windows(title)).length, 1);
	await xdotool("windowfocus", first);
	await xdotool("key", "Escape");
	await stays();
	checks.push("unsaved-close-single-confirmation-escape-retains-payload");
	await requestClose();
	await xdotool("windowfocus", await dialog());
	await xdotool("key", "Return");
	await stays();
	checks.push("unsaved-close-default-enter-stays-in-app");
	await requestClose();
	await dialog();
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
	await until(() => !alive(pid), "Confirmed native quit did not exit", 30000);
	for (const path of cached)
		await assert.rejects(lstat(path), { code: "ENOENT" });
	await close(); // Dispose the already exited WebDriver session; does not cause this exit.
	await open();
	const restored = await invoke("queue_snapshot");
	assert.equal(restored.tasks[0].phase, "interrupted");
	assert.equal(restored.tasks[0].attempt, 1);
	assert.equal(restored.tasks[0].authorized, false);
	assert.equal(restored.output_authorized, false);
	assert.equal(restored.processing, false);
	await writeFile(
		join(root, "quit-restored.json"),
		JSON.stringify(restored, null, 2) + "\n",
	);
	assert.deepEqual(await readFile(input), original);
	assert.deepEqual(await readFile(saved), savedBytes);
	assert.equal((await readdir(collisions)).length, 1000);
	for (let i = 1; i <= 1000; i++)
		assert.equal(
			await readFile(join(collisions, `quit-probe-z8-${i}.webp`), "utf8"),
			"existing",
		);
	checks.push(
		"confirmed-native-quit-discards-cache-restart-requires-manual-conversion",
	);
	await until(
		async () =>
			(await invoke("desktop_info")).engines.every((e) => e.available),
		"Engines not ready for idle close",
		120000,
	);
	const idle = (await windows("^Z8.Work — Desktop$"))[0];
	const idlePid = Number(await xdotool("getwindowpid", idle));
	assert.ok(Number.isInteger(idlePid) && idlePid > 0);
	await execute(
		"python3",
		["scripts/lib/desktop-quit-window.py", "close", idle],
		{ timeout: 5000 },
	);
	await until(() => !alive(idlePid), "Idle native close did not exit", 30000);
	assert.equal((await windows(title)).length, 0);
	await close();
	checks.push("idle-native-window-close-exits-without-confirmation");
	await writeFile(
		join(root, "quit-details.json"),
		JSON.stringify(
			{
				schema: 1,
				cachedPayloads: [...cachedBytes.values()].map((bytes) => ({
					bytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				})),
				cacheRemovedBeforeRestart: true,
				restoredPhase: restored.tasks[0].phase,
				restoredAttempt: restored.tasks[0].attempt,
				collisionsPreserved: 1000,
				nativeConfirmedExit: true,
				idleNativeExit: true,
			},
			null,
			2,
		) + "\n",
	);
}
