import { readFile, readlink, readdir } from "node:fs/promises";

// Recheck PID + start time and ownership before signalling a test-owned child.
export async function processIdentity(pid) {
	try {
		const stat = await readFile(`/proc/${pid}/stat`, "utf8");
		const fields = stat
			.slice(stat.lastIndexOf(")") + 2)
			.trim()
			.split(/\s+/);
		return {
			pid,
			state: fields[0],
			parent: Number(fields[1]),
			start: fields[19],
		};
	} catch (e) {
		if (["ENOENT", "ESRCH"].includes(e.code)) return null;
		throw e;
	}
}
export async function sameProcess(identity) {
	const current = await processIdentity(identity.pid);
	return current?.start === identity.start ? current : null;
}
async function matchesCommand(pid, argument) {
	return (
		!argument ||
		(await readFile(`/proc/${pid}/cmdline`, "utf8"))
			.split("\0")
			.includes(argument)
	);
}
export async function encoderChildren(parent, executable, argument) {
	const result = [];
	for (const name of await readdir("/proc")) {
		if (!/^\d+$/.test(name)) continue;
		const identity = await processIdentity(Number(name));
		if (identity?.parent !== parent) continue;
		try {
			if (
				(await readlink(`/proc/${name}/exe`)) === executable &&
				(await sameProcess(identity)) &&
				(await matchesCommand(identity.pid, argument))
			)
				result.push(identity);
		} catch (e) {
			if (!["ENOENT", "ESRCH"].includes(e.code)) throw e;
		}
	}
	return result;
}
export async function signalEncoder(
	identity,
	parent,
	executable,
	signal,
	argument,
) {
	try {
		const current = await sameProcess(identity);
		if (!current) return false;
		if (
			current.parent !== parent ||
			(await readlink(`/proc/${identity.pid}/exe`)) !== executable ||
			!(await matchesCommand(identity.pid, argument))
		)
			throw new Error("Encoder ownership changed");
		process.kill(identity.pid, signal);
		return true;
	} catch (e) {
		if (["ENOENT", "ESRCH"].includes(e.code)) return false;
		throw e;
	}
}
