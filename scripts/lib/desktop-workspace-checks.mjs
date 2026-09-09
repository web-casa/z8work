// Linux-only fixture setup in the GUI harness's isolated XDG cache.
import assert from "node:assert/strict";
import {
	mkdir,
	writeFile,
	readFile,
	readdir,
	symlink,
	access,
	chmod,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";

export async function workspaceFixtures(root) {
	const cache = join(root, "cache", "work.z8.desktop.m0", "native-work-v1");
	await mkdir(cache, { recursive: true, mode: 0o700 });
	const sentinel = join(root, "external-sentinel");
	await writeFile(sentinel, "original file: preserve");
	async function session(name, observed) {
		const dir = join(cache, name);
		await mkdir(dir, { mode: 0o700 });
		await writeFile(
			join(dir, "lease.json"),
			JSON.stringify({
				schema: 1,
				kind: "z8-native-workspace",
				session: name,
				orphaned_at_ms: observed,
			}),
		);
		await mkdir(join(dir, "job-fixture"));
		await writeFile(join(dir, "job-fixture", "input.png"), "owned scratch");
		return dir;
	}
	const mature = await session("session-Mature", Date.now() - 120000);
	await symlink(sentinel, join(mature, "job-fixture", "outside"));
	const fresh = await session("session-Fresh1", null);
	const active = await session("session-Active", 0);
	await symlink(root, join(cache, "session-Linked"));
	const locker = spawn(
		"python3",
		[
			"-u",
			"-c",
			"import fcntl,sys; f=open(sys.argv[1],'r+'); fcntl.flock(f,fcntl.LOCK_EX); print('locked',flush=True); sys.stdin.read()",
			join(active, "lease.json"),
		],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	try {
		const [bytes] = await once(locker.stdout, "data", {
			signal: AbortSignal.timeout(5000),
		});
		assert.match(String(bytes), /locked/);
	} catch (e) {
		locker.kill();
		throw e;
	}
	return {
		async startup({ invoke, js, checks, screenshot }) {
			const info = await invoke("desktop_info");
			assert.equal(info.workspace_error, null);
			assert.equal(info.temporary_cleanup.removed, 1);
			assert.equal(info.temporary_cleanup.deferred, 1);
			assert.equal(info.temporary_cleanup.active, 1);
			assert.equal(info.temporary_cleanup.unrecognized, 1);
			await assert.rejects(access(mature));
			await access(fresh);
			await access(active);
			assert.equal(
				await readFile(sentinel, "utf8"),
				"original file: preserve",
			);
			assert.match(
				await js(
					'return document.querySelector("[data-workspace-cleanup]").textContent',
				),
				/removed at last check:\s*1/,
			);
			await screenshot(
				"temporary-cleanup.png",
				"[data-workspace-cleanup]",
			);
			checks.push(
				"startup-cleans-only-confirmed-orphan",
				"startup-preserves-active-and-fresh-sessions",
				"cleanup-does-not-follow-external-link",
				"cleanup-status-visible",
			);
		},
		async duringJob({ checks, until }) {
			await until(
				async () => {
					for (const name of await readdir(cache)) {
						if (
							[
								"session-Active",
								"session-Linked",
								"session-Fresh1",
							].includes(name)
						)
							continue;
						try {
							for (const job of await readdir(
								join(cache, name),
							)) {
								if (
									job.startsWith("job-") &&
									(
										await readdir(join(cache, name, job))
									).includes("input.png")
								)
									return true;
							}
						} catch (error) {
							if (error.code !== "ENOENT") throw error;
						}
					}
					return false;
				},
				"Conversion did not stage its input in the private cache",
				5000,
			);
			checks.push("running-conversion-uses-private-cache");
		},
		async makeUnavailable() {
			await chmod(cache, 0o755);
		},
		async checkUnavailable({ invoke, js, checks, until }) {
			assert.match(
				(await invoke("desktop_info")).workspace_error,
				/private/,
			);
			await until(
				() =>
					js(
						'return !!document.querySelector("[data-workspace-error]")',
					),
				"Workspace failure missing from UI",
			);
			await assert.rejects(
				invoke("preview_input", { id: "any-id" }),
				/private/,
			);
			checks.push("unsafe-workspace-visible-and-preview-refused");
		},
		async afterJobs({ checks, output }) {
			for (const name of await readdir(cache)) {
				if (
					[
						"session-Active",
						"session-Linked",
						"session-Fresh1",
					].includes(name)
				)
					continue;
				assert.deepEqual(await readdir(join(cache, name)), [
					"lease.json",
				]);
			}
			assert.ok((await readdir(output)).length > 0);
			assert.equal(
				(await readdir(output)).some((name) => name.startsWith(".tmp")),
				false,
			);
			assert.equal(
				await readFile(sentinel, "utf8"),
				"original file: preserve",
			);
			await access(active);
			checks.push(
				"successful-and-failed-jobs-release-managed-scratch",
				"saved-output-folder-has-no-conversion-scratch",
			);
		},
		async close() {
			await chmod(cache, 0o700);
			const exited = once(locker, "exit");
			locker.stdin.end();
			await exited;
		},
	};
}
