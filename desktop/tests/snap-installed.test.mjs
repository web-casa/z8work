import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import {
	hostBlockers,
	validateInstalled,
	validateConnections,
	validateMount,
	probeScript,
	shellQuote,
	validateProbe,
	validateConversions,
	installedHashCommand,
	parseInstalledHash,
	snapdGet,
	runFinite,
} from "../../scripts/lib/desktop-snap-installed.mjs";
const host = () => ({
	platform: "linux",
	arch: "x64",
	machine: "x86_64",
	uid: 1000,
	snapd: {
		architecture: "amd64",
		confinement: "strict",
		"os-release": { id: "ubuntu", "version-id": "24.04" },
		"sandbox-features": {
			"confinement-options": ["strict", "devmode"],
			apparmor: ["kernel:domain"],
			seccomp: ["bpf-argument-filtering"],
		},
	},
});
const installed = () => ({
	name: "z8-work",
	status: "active",
	version: "0.1.0",
	base: "core24",
	revision: "x1",
	confinement: "strict",
	devmode: false,
	jailmode: false,
});
const connections = () => ({
	established: Object.entries({
		"gnome-46-2404": "gnome-46-2404",
		"gpu-2404": "mesa-2404",
		"gtk-3-themes": "gtk-common-themes",
		"icon-themes": "gtk-common-themes",
		"sound-themes": "gtk-common-themes",
		home: "snapd",
		desktop: "snapd",
		opengl: "snapd",
		x11: "snapd",
	}).map(([plug, provider]) => ({
		plug: { snap: "z8-work", plug },
		slot: { snap: provider, slot: plug },
		interface: provider === "snapd" ? plug : "content",
	})),
});
test("strict preflight rejects the real ARM/partial class of host, root and mismatched kernel", () => {
	assert.deepEqual(hostBlockers(host()), []);
	for (const patch of [
		{ arch: "arm64" },
		{ machine: "aarch64" },
		{ platform: "win32" },
		{ uid: 0 },
	])
		assert.ok(hostBlockers({ ...host(), ...patch }).length);
	for (const patch of [
		{ architecture: "arm64" },
		{ confinement: "partial" },
		{ "sandbox-features": {} },
		{ "os-release": { id: "debian", "version-id": "13" } },
	])
		assert.ok(
			hostBlockers({ ...host(), snapd: { ...host().snapd, ...patch } })
				.length,
		);
});
test("installed revision must be active strict, never devmode, try or an unsafe path", () => {
	assert.equal(validateInstalled(installed(), "0.1.0"), "/snap/z8-work/x1");
	for (const patch of [
		{ devmode: true },
		{ jailmode: true },
		{ trymode: true },
		{ status: "installed" },
		{ revision: "../x1" },
		{ revision: 1 },
		{ revision: "0" },
		{ base: "core22" },
		{ version: "9.0" },
		{ broken: "missing data" },
	])
		assert.throws(() =>
			validateInstalled({ ...installed(), ...patch }, "0.1.0"),
		);
});
test("connections require exact GNOME, GPU, theme providers and home/display access", () => {
	assert.equal(validateConnections(connections()).length, 9);
	for (const index of [0, 1, 2, 5, 8]) {
		const c = connections();
		c.established.splice(index, 1);
		assert.throws(() => validateConnections(c));
	}
	const wrong = connections();
	wrong.established[0].slot.snap = "other-provider";
	assert.throws(() => validateConnections(wrong));
	const wide = connections();
	wide.established.push({
		plug: { snap: "z8-work", plug: "network" },
		interface: "network",
		slot: { snap: "snapd", slot: "network" },
	});
	assert.throws(() => validateConnections(wide), /permission/);
});
test("installed mount rejects extracted directories, writable and duplicate mounts", () => {
	const line =
		"44 22 7:1 / /snap/z8-work/x1 ro,nodev,relatime shared:12 - squashfs /dev/loop1 ro";
	assert.equal(validateMount(line, "/snap/z8-work/x1").type, "squashfs");
	for (const body of [
		"",
		line.replace("squashfs", "ext4"),
		line.replace("ro,nodev", "rw,nodev"),
		line.replace("/dev/loop1 ro", "/dev/loop1 rw"),
		line + "\n" + line,
	])
		assert.throws(() => validateMount(body, "/snap/z8-work/x1"));
});
test("probe receipts require enforced app profile, seccomp and exact per-run nonce", () => {
	const token = "ab".repeat(16),
		out = `Z8_PROFILE=snap.z8-work.z8-work (enforce)\nZ8_SECCOMP=2\nZ8_PROBE=${token}\n`;
	assert.doesNotThrow(() => validateProbe(out, token));
	for (const body of [
		out.replace("(enforce)", "(complain)"),
		out.replace("=2", "=0"),
		out + "extra\n",
	])
		assert.throws(() => validateProbe(body, token));
	assert.throws(() => validateProbe(out, "cd".repeat(16)));
});
test("probe script quotes hostile-looking filenames without executing substitutions", async () => {
	const token = "ab".repeat(16),
		dangerous = "/home/test/hello' $(printf INJECTION) `id`\npath";
	const body = probeScript({
		revision: "x2",
		visible: dangerous,
		hidden: dangerous,
		token,
	});
	assert.ok(body.includes("'\\''"));
	assert.equal(
		(
			await runFinite("/bin/sh", [
				"-c",
				"printf %s " + shellQuote(dangerous),
			])
		).stdout,
		dangerous,
	);
	await runFinite("/bin/sh", ["-n"], { input: body });
	assert.equal(
		(await runFinite("/bin/sh", ["-c", body.trim().split("\n").at(-1)]))
			.stdout,
		`Z8_PROBE=${token}\n`,
	);
	assert.throws(() =>
		probeScript({ revision: "x1;id", visible: "a", hidden: "b", token }),
	);
});
async function server(t, handler) {
	const root = await mkdtemp(join(tmpdir(), "z8-snapd-test-"));
	const socketPath = join(root, "snapd.sock");
	const server = createServer(handler);
	server.listen(socketPath);
	await once(server, "listening");
	t.after(async () => {
		server.closeAllConnections();
		await new Promise((r) => server.close(r));
		await rm(root, { recursive: true, force: true });
	});
	return socketPath;
}
test("snapd uses bounded read-only Unix HTTP and validates the response envelope", async (t) => {
	const socketPath = await server(t, (req, res) => {
		assert.equal(req.method, "GET");
		res.end(
			JSON.stringify({
				type: "sync",
				"status-code": 200,
				result: { architecture: "amd64" },
			}),
		);
	});
	assert.deepEqual(await snapdGet("/v2/system-info", { socketPath }), {
		architecture: "amd64",
	});
	assert.throws(() => snapdGet("/v2/logout", { socketPath }), /endpoint/);
});
test("snapd rejects HTTP errors, malformed JSON, oversized and continuously trickling responses", async (t) => {
	for (const kind of ["status", "json", "size", "timeout"])
		await t.test(kind, async (t) => {
			const socketPath = await server(t, (_req, res) => {
				if (kind === "status") {
					res.statusCode = 403;
					res.end("{}");
				} else if (kind === "json") res.end("not-json");
				else if (kind === "size") res.end("x".repeat(4096));
				else {
					const timer = setInterval(() => res.write(" "), 10);
					res.on("close", () => clearInterval(timer));
				}
			});
			await assert.rejects(
				snapdGet("/v2/system-info", {
					socketPath,
					limit: 1024,
					timeout: 100,
				}),
			);
		});
});
test("finite runner preserves split UTF-8 and rejects errors, missing commands and output overflow", async () => {
	const result = await runFinite(process.execPath, [
		"-e",
		"process.stdout.write(Buffer.from([0xe4]));setTimeout(()=>process.stdout.write(Buffer.from([0xb8,0xad])),20)",
	]);
	assert.equal(result.stdout, "中");
	await assert.rejects(
		runFinite(process.execPath, ["-e", "process.exit(7)"]),
		/7/,
	);
	await assert.rejects(runFinite("/does-not-exist", []), /ENOENT/);
	await assert.rejects(
		runFinite(
			process.execPath,
			["-e", "process.stdout.write('x'.repeat(4096))"],
			{ limit: 1024 },
		),
		/limit/,
	);
});
test("deadline kills detached command descendants, not just the parent", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "z8-group-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const pidFile = join(root, "pid");
	await assert.rejects(
		runFinite(
			process.execPath,
			[
				"-e",
				`const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000);`,
			],
			{ timeout: 500 },
		),
		/deadline/,
	);
	const pid = Number(await readFile(pidFile, "utf8"));
	// Signal delivery and orphan reaping are asynchronous, especially under load.
	let state;
	const deadline = Date.now() + 2000;
	do {
		try {
			state = (await readFile(`/proc/${pid}/stat`, "utf8")).split(" ")[2];
		} catch (e) {
			assert.ok(["ENOENT", "ESRCH"].includes(e.code));
			state = undefined;
		}
		if (state === undefined || state === "Z") break;
		await new Promise((resolve) => setTimeout(resolve, 20));
	} while (Date.now() < deadline);
	assert.ok(
		state === undefined || state === "Z",
		`Descendant ${pid} remains alive in state ${state}`,
	);
});

test("installed conversion validation rejects borrowed architecture, duplicate routes and unchecked results", async () => {
	const real = JSON.parse(
		await readFile(
			"docs/desktop/evidence/phase8/final-conversions.json",
			"utf8",
		),
	);
	assert.doesNotThrow(() => validateConversions(real));
	for (const change of [
		(r) => (r.platform = "linux-aarch64"),
		(r) => (r.routes[1] = r.routes[0]),
		(r) => (r.checks.pdf_partial_cancel = false),
		(r) => delete r.checks.png_alpha_pixels,
		(r) => (r.routes[0].decoded = false),
		(r) => (r.routes.at(-1).text_checked = false),
	]) {
		const changed = structuredClone(real);
		change(changed);
		assert.throws(() => validateConversions(changed));
	}
});

test("SIGTERM stops an active finite process and releases signal listeners", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "z8-interrupt-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const pidFile = join(root, "pid");
	const moduleUrl = new URL(
		"../../scripts/lib/desktop-snap-installed.mjs",
		import.meta.url,
	).href;
	const code = `import {runFinite} from ${JSON.stringify(moduleUrl)};await runFinite(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`)}]).catch(e=>{if(e.message!=='Command interrupted')throw e;process.exitCode=17;});`;
	const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
		stdio: ["ignore", "ignore", "pipe"],
	});
	t.after(() => child.kill("SIGKILL"));
	const closed = once(child, "close");
	let pid;
	for (let i = 0; i < 100; i++) {
		try {
			pid = Number(await readFile(pidFile, "utf8"));
			break;
		} catch {
			await new Promise((r) => setTimeout(r, 10));
		}
	}
	assert.ok(pid);
	child.kill("SIGTERM");
	assert.equal((await closed)[0], 17);
	let state;
	try {
		state = (await readFile(`/proc/${pid}/stat`, "utf8")).split(" ")[2];
	} catch (e) {
		assert.ok(["ENOENT", "ESRCH"].includes(e.code));
	}
	assert.ok(state === undefined || state === "Z");
});

test("privileged cache digest can only read the fixed z8-work revision path", () => {
	const c = installedHashCommand("x7");
	assert.deepEqual(c.args, [
		"-n",
		"/usr/bin/sha256sum",
		"--",
		"/var/lib/snapd/snaps/z8-work_x7.snap",
	]);
	assert.equal(c.binary, "/usr/bin/sudo");
	for (const revision of ["../secret", "1;id", "x0", 0, "1\n"])
		assert.throws(() => installedHashCommand(revision));
	assert.equal(
		parseInstalledHash("a".repeat(64) + "  " + c.path + "\n", "x7"),
		"a".repeat(64),
	);
	assert.throws(() =>
		parseInstalledHash("a".repeat(64) + "  /etc/shadow\n", "x7"),
	);
	assert.throws(() =>
		parseInstalledHash("a".repeat(64) + "  " + c.path + "\nextra", "x7"),
	);
});
