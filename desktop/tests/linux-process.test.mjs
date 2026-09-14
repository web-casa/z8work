import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { realpath } from "node:fs/promises";
import {
	processIdentity,
	sameProcess,
	encoderChildren,
	signalEncoder,
} from "../../scripts/lib/desktop-linux-process.mjs";

test(
	"Linux signal helper rejects stale identity and wrong parent or executable",
	{ skip: process.platform !== "linux" },
	async () => {
		const child = spawn(
			process.execPath,
			["-e", "setInterval(()=>{},1000)"],
			{ stdio: "ignore" },
		);
		await once(child, "spawn");
		const exited = once(child, "exit");
		try {
			const identity = await processIdentity(child.pid),
				executable = await realpath(process.execPath);
			assert.equal(identity.parent, process.pid);
			assert.match(identity.start, /^\d+$/);
			assert.ok(
				(await encoderChildren(process.pid, executable)).some(
					(p) => p.pid === child.pid && p.start === identity.start,
				),
			);
			assert.equal(await sameProcess({ ...identity, start: "-1" }), null);
			assert.equal(
				await signalEncoder(
					{ ...identity, start: "-1" },
					process.pid,
					executable,
					"SIGSTOP",
				),
				false,
			);
			await assert.rejects(
				signalEncoder(identity, process.pid + 1, executable, "SIGSTOP"),
				/ownership changed/,
			);
			await assert.rejects(
				signalEncoder(
					identity,
					process.pid,
					executable + "-wrong",
					"SIGSTOP",
				),
				/ownership changed/,
			);
			await assert.rejects(
				signalEncoder(
					identity,
					process.pid,
					executable,
					"SIGSTOP",
					"/wrong-engine",
				),
				/ownership changed/,
			);
			assert.equal(
				await signalEncoder(
					identity,
					process.pid,
					executable,
					"SIGSTOP",
				),
				true,
			);
			const deadline = Date.now() + 2000;
			while (
				(await sameProcess(identity))?.state !== "T" &&
				Date.now() < deadline
			)
				await new Promise((r) => setTimeout(r, 10));
			assert.equal((await sameProcess(identity)).state, "T");
			assert.equal(
				await signalEncoder(
					identity,
					process.pid,
					executable,
					"SIGCONT",
				),
				true,
			);
		} finally {
			child.kill("SIGKILL");
			await exited;
		}
		assert.equal(await processIdentity(child.pid), null);
	},
);
