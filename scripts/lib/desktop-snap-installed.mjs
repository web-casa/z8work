// Read-only snapd transport and validation for an already installed candidate.
import { request } from "node:http";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const endpoints = new Set([
	"/v2/system-info",
	"/v2/connections?snap=z8-work",
	...[
		"z8-work",
		"core24",
		"gnome-46-2404",
		"mesa-2404",
		"gtk-common-themes",
	].map((n) => `/v2/snaps/${n}`),
]);
export function snapdGet(
	path,
	{
		socketPath = "/run/snapd.socket",
		timeout = 10000,
		limit = 1024 ** 2,
	} = {},
) {
	if (!endpoints.has(path)) throw new Error("Unreviewed snapd endpoint");
	return new Promise((resolve, reject) => {
		let size = 0,
			chunks = [];
		const req = request(
			{ socketPath, path, method: "GET", agent: false },
			(res) => {
				res.on("data", (chunk) => {
					size += chunk.length;
					if (size > limit) {
						reject(new Error("snapd response exceeds limit"));
						req.destroy();
					} else chunks.push(chunk);
				});
				res.on("error", reject);
				res.on("end", () => {
					try {
						const body = JSON.parse(
							Buffer.concat(chunks).toString("utf8"),
						);
						if (
							res.statusCode !== 200 ||
							body.type !== "sync" ||
							body["status-code"] !== 200
						)
							throw new Error(
								`snapd request failed: ${res.statusCode}`,
							);
						resolve(body.result);
					} catch (error) {
						reject(error);
					}
				});
			},
		);
		const timer = setTimeout(() => {
			reject(new Error("snapd request deadline exceeded"));
			req.destroy();
		}, timeout);
		req.on("error", reject);
		req.on("close", () => clearTimeout(timer));
		req.end();
	});
}
export function hostBlockers(host) {
	const reasons = [];
	if (
		host.platform !== "linux" ||
		host.arch !== "x64" ||
		host.machine !== "x86_64" ||
		host.snapd?.architecture !== "amd64"
	)
		reasons.push("Requires matching Linux AMD64 process, kernel and snapd");
	if (host.uid === 0 || !Number.isInteger(host.uid))
		reasons.push("Run as an ordinary desktop user, not root");
	if (
		host.snapd?.["os-release"]?.id !== "ubuntu" ||
		host.snapd?.["os-release"]?.["version-id"] !== "24.04"
	)
		reasons.push("This acceptance profile requires Ubuntu 24.04");
	const features = host.snapd?.["sandbox-features"];
	if (
		host.snapd?.confinement !== "strict" ||
		!features?.["confinement-options"]?.includes("strict") ||
		!features?.apparmor?.length ||
		!features?.seccomp?.length
	)
		reasons.push("Full strict AppArmor and seccomp support required");
	return reasons;
}
export function validateInstalled(info, version) {
	if (
		info?.name !== "z8-work" ||
		info.status !== "active" ||
		info.version !== version ||
		info.base !== "core24" ||
		info.confinement !== "strict" ||
		info.devmode !== false ||
		info.jailmode !== false ||
		info.trymode === true ||
		info.broken
	)
		throw new Error(
			"Installed snap is not the active strict candidate (devmode/trymode/revision mismatch)",
		);
	if (
		typeof info.revision !== "string" ||
		!/^(?:x)?[1-9][0-9]*$/.test(info.revision)
	)
		throw new Error("Unsafe or missing installed revision");
	return `/snap/z8-work/${info.revision}`;
}
export function validateConnections(result) {
	const established = result?.established;
	if (!Array.isArray(established))
		throw new Error("Missing snapd connections");
	const own = established.filter((c) => c.plug?.snap === "z8-work");
	const allowed = new Set([
		"gnome-46-2404",
		"gpu-2404",
		"gtk-3-themes",
		"icon-themes",
		"sound-themes",
		"home",
		"desktop",
		"desktop-legacy",
		"gsettings",
		"opengl",
		"wayland",
		"x11",
		"removable-media",
	]);
	if (own.some((c) => !allowed.has(c.plug.plug)))
		throw new Error("Unreviewed connected permission");
	for (const [plug, provider] of Object.entries({
		"gnome-46-2404": "gnome-46-2404",
		"gpu-2404": "mesa-2404",
		"gtk-3-themes": "gtk-common-themes",
		"icon-themes": "gtk-common-themes",
		"sound-themes": "gtk-common-themes",
	})) {
		if (
			!own.some(
				(c) =>
					c.plug.plug === plug &&
					c.interface === "content" &&
					c.slot?.snap === provider,
			)
		)
			throw new Error(`Missing reviewed content provider: ${plug}`);
	}
	for (const plug of ["home", "desktop", "opengl"])
		if (
			!own.some(
				(c) =>
					c.plug.plug === plug &&
					c.interface === plug &&
					c.slot?.snap,
			)
		)
			throw new Error(`Missing interface: ${plug}`);
	if (
		!own.some(
			(c) =>
				["wayland", "x11"].includes(c.interface) &&
				c.plug.plug === c.interface &&
				c.slot?.snap,
		)
	)
		throw new Error("Missing desktop display interface");
	return own;
}
const unescapeMount = (text) =>
	text.replace(/\\([0-7]{3})/g, (_, octal) =>
		String.fromCharCode(parseInt(octal, 8)),
	);
export function validateMount(text, root) {
	const rows = text
		.trim()
		.split("\n")
		.map((line) => {
			const [head, tail] = line.split(" - ");
			const fields = head.split(" "),
				fs = tail?.split(" ");
			return {
				point: unescapeMount(fields[4] ?? ""),
				root: fields[3],
				options: fields[5]?.split(","),
				type: fs?.[0],
				superOptions: fs?.[2]?.split(","),
			};
		});
	const matching = rows.filter((row) => row.point === root);
	if (
		matching.length !== 1 ||
		matching[0].type !== "squashfs" ||
		matching[0].root !== "/" ||
		!matching[0].options?.includes("ro") ||
		!matching[0].superOptions?.includes("ro")
	)
		throw new Error(
			"Installed revision must be a read-only SquashFS mount",
		);
	return matching[0];
}
export function shellQuote(text) {
	return "'" + text.replaceAll("'", "'\\''") + "'";
}
export function probeScript({ revision, visible, hidden, token }) {
	if (!/^(?:x)?[1-9][0-9]*$/.test(revision) || !/^[a-f0-9]{32}$/.test(token))
		throw new Error("Invalid probe identity");
	return `set -eu
[ "$SNAP" = /snap/z8-work/${revision} ]
[ "$SNAP_REVISION" = ${shellQuote(revision)} ]
printf 'Z8_PROFILE='
cat /proc/self/attr/current
printf 'Z8_SECCOMP='
sed -n 's/^Seccomp:[[:space:]]*//p' /proc/self/status
cat ${shellQuote(visible + "/input.txt")} > /dev/null
if cat ${shellQuote(hidden + "/input.txt")} > /dev/null 2>&1; then exit 41; fi
if (printf x > ${shellQuote(visible + "/readonly/denied.txt")}) 2>/dev/null; then exit 42; fi
printf '%s' ${shellQuote(token)} > ${shellQuote(visible + "/output.txt")}
printf 'Z8_PROBE=%s\\n' ${shellQuote(token)}
`;
}
export function validateProbe(stdout, token) {
	const expected = [
		"Z8_PROFILE=snap.z8-work.z8-work (enforce)",
		"Z8_SECCOMP=2",
		`Z8_PROBE=${token}`,
	];
	if (stdout.trim().split(/\r?\n/).join("\n") !== expected.join("\n"))
		throw new Error(
			"Missing enforced profile, seccomp or permission probe receipt",
		);
}
// Finite subprocess with bounded output; kill the whole process group on failure.
// This is a local Linux test runner, never registered as application IPC.
export function runFinite(
	binary,
	args,
	{
		input = "",
		timeout = 30000,
		limit = 2 * 1024 ** 2,
		env = process.env,
		cwd,
	} = {},
) {
	return new Promise((resolve, reject) => {
		const child = spawn(binary, args, {
			detached: true,
			env,
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "",
			stderr = "",
			size = 0,
			failure;
		const stop = (error) => {
			failure ??= error;
			if (child.pid) {
				try {
					process.kill(-child.pid, "SIGKILL");
				} catch (e) {
					if (e.code !== "ESRCH") failure = e;
				}
			}
		};
		const interrupted = () => stop(new Error("Command interrupted"));
		process.on("SIGINT", interrupted);
		process.on("SIGTERM", interrupted);
		const timer = setTimeout(
			() => stop(new Error("Command deadline exceeded")),
			timeout,
		);
		const decoders = {
			stdout: new StringDecoder("utf8"),
			stderr: new StringDecoder("utf8"),
		};
		for (const [pipe, key] of [
			[child.stdout, "stdout"],
			[child.stderr, "stderr"],
		])
			pipe.on("data", (chunk) => {
				size += chunk.length;
				if (size > limit)
					return stop(new Error("Command output exceeds limit"));
				if (key === "stdout") stdout += decoders.stdout.write(chunk);
				else stderr += decoders.stderr.write(chunk);
			});
		child.on("error", (error) => {
			failure = error;
		});
		child.stdin.on("error", (error) => {
			if (error.code !== "EPIPE") stop(error);
		});
		child.on("exit", (code, signal) => {
			if (code !== 0) stop(new Error(`Command exited ${code ?? signal}`));
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			process.off("SIGINT", interrupted);
			process.off("SIGTERM", interrupted);
			stdout += decoders.stdout.end();
			stderr += decoders.stderr.end();
			if (failure || code !== 0) {
				const error = failure ?? new Error(`Command exited ${code}`);
				error.stderr = stderr;
				reject(error);
			} else resolve({ stdout, stderr, exitCode: code });
		});
		child.stdin.end(input);
	});
}

export function validateConversions(report, expectedPlatform = "linux-x86_64") {
	if (
		![
			"linux-x86_64",
			"linux-aarch64",
			"windows-x86_64",
			"macos-aarch64",
		].includes(expectedPlatform)
	)
		throw new Error("Unsupported conversion platform");
	const checks = [
		"audio_duration_channels",
		"disguised_playlist_rejected",
		"pdf_200_page_limit",
		"pdf_changed_input_no_reuse",
		"pdf_changed_settings_no_reuse",
		"pdf_missing_page_regenerated",
		"pdf_page_order_dimensions",
		"pdf_partial_cancel",
		"pdf_resume_no_duplicate",
		"png_16bit_pixels",
		"png_alpha_pixels",
		"unicode_filename_budget",
		"xmp_metadata_toggle",
	];
	if (
		report?.platform !== expectedPlatform ||
		report.routes?.length !== 84 ||
		checks.some((key) => report.checks?.[key] !== true)
	)
		throw new Error("Incomplete installed conversion matrix");
	// The fixed 0.1.0 acceptance suite; extending the suite requires review here.
	const pairs = new Set();
	for (const input of [
		"png",
		"jpg",
		"jpeg",
		"webp",
		"avif",
		"heic",
		"heif",
		"pdf",
	])
		for (const output of ["png", "jpeg", "webp", "avif"])
			pairs.add(`${input}:${output}`);
	for (const input of [
		"mp3",
		"wav",
		"flac",
		"opus",
		"m4a",
		"ogg",
		"mp4",
		"mov",
		"mkv",
		"webm",
	])
		for (const output of ["wav", "mp3", "flac", "opus", "m4a"])
			pairs.add(`${input}:${output}`);
	for (const input of ["md", "docx"]) pairs.add(`${input}:txt`);
	const seen = new Set();
	for (const route of report.routes) {
		const key = `${route.input}:${route.output}`;
		if (seen.has(key)) throw new Error("Duplicate conversion route");
		if (!pairs.has(key)) throw new Error("Unexpected conversion route");
		seen.add(key);
		if (route.output === "txt") {
			if (
				!["md", "docx"].includes(route.input) ||
				route.text_checked !== true
			)
				throw new Error("Document output was not checked");
		} else if (
			route.decoded !== true ||
			!Number.isSafeInteger(route.bytes) ||
			route.bytes <= 0
		)
			throw new Error("Output was not decoded");
		if (route.input === "pdf" && route.pages !== 3)
			throw new Error("PDF page check incomplete");
	}
}

export function validateQuality(report, expectedPlatform) {
	validateConversions(report, expectedPlatform);
	if (
		report.phase !== 27 ||
		report.qualityChecks?.length !== 20 ||
		report.imageCalibration?.length !== 240
	)
		throw new Error("Missing frozen Phase 27 quality evidence");
	const finite = (value, max) =>
		Number.isFinite(value) && value >= 0 && value <= max;
	const pixels = (s) =>
		s &&
		finite(s.premultipliedRgbRmse, 0.15) &&
		finite(s.maxAlphaError, 0.02) &&
		/^\d+ \d+$/.test(s.dimensions);
	const required = new Set();
	for (const format of ["png", "jpeg", "webp", "avif"]) {
		for (const keep of [false, true])
			for (const check of ["ICC byte preservation", "EXIF orientation 6"])
				required.add(`${check}:${format}:${keep}`);
		required.add(`embedded Host Grotesk font:${format}:undefined`);
	}
	for (const row of report.qualityChecks) {
		if (
			!required.delete(
				`${row.check}:${row.format}:${row.keep_metadata}`,
			) ||
			(row.check === "ICC byte preservation"
				? row.passed !== true
				: !pixels(row.semantic))
		)
			throw new Error("Unchecked or duplicate quality sample");
	}
	const samples = new Set();
	for (const fixture of [
		"ImageMagick rose:",
		"alpha 128x96",
		"16-bit gradient 256x64",
		"10-bit HEIC seed",
	])
		for (const format of ["png", "jpeg", "webp", "avif"])
			for (const preset of ["small", "balanced", "high"])
				for (let repeat = 1; repeat <= 5; repeat++)
					samples.add(`${fixture}:${format}:${preset}:${repeat}`);
	for (const row of report.imageCalibration) {
		if (
			!samples.delete(
				`${row.fixture}:${row.format}:${row.preset}:${row.repeat}`,
			) ||
			!pixels(row.semantic) ||
			!Number.isSafeInteger(row.bytes) ||
			row.bytes <= 0
		)
			throw new Error("Unchecked or duplicate calibration sample");
	}
}

export function installedHashCommand(revision) {
	if (typeof revision !== "string" || !/^(?:x)?[1-9][0-9]*$/.test(revision))
		throw new Error("Unsafe installed revision");
	const path = `/var/lib/snapd/snaps/z8-work_${revision}.snap`;
	return {
		path,
		binary: "/usr/bin/sudo",
		args: ["-n", "/usr/bin/sha256sum", "--", path],
	};
}
export function parseInstalledHash(stdout, revision) {
	const { path } = installedHashCommand(revision);
	const match = stdout.trimEnd().match(/^([a-f0-9]{64}) {2}(.+)$/);
	if (!match || match[2] !== path)
		throw new Error("Installed archive hash response mismatch");
	return match[1];
}
export async function installedFingerprint(revision, run) {
	const { lstat } = await import("node:fs/promises");
	const { fileInfo } = await import("./desktop-sources.mjs");
	const invocation = installedHashCommand(revision);
	try {
		return {
			...(await fileInfo(
				"/var/lib/snapd/snaps",
				`z8-work_${revision}.snap`,
			)),
			method: "direct",
		};
	} catch (error) {
		if (error.code !== "EACCES") throw error;
		// snapd cache files are commonly root:root 0600. Elevate only this fixed
		// read-only digest command, never snap run or a script from the candidate.
		const before = await lstat(invocation.path);
		if (
			!before.isFile() ||
			before.isSymbolicLink() ||
			before.size > 2 * 1024 ** 3
		)
			throw new Error("Invalid installed cache file");
		const result = await run(invocation.binary, invocation.args, {
			timeout: 120000,
		});
		const digest = parseInstalledHash(result.stdout, revision);
		const after = await lstat(invocation.path);
		if (
			before.ino !== after.ino ||
			before.dev !== after.dev ||
			before.size !== after.size ||
			before.mtimeMs !== after.mtimeMs
		)
			throw new Error("Installed cache changed while hashing");
		return {
			sha256: digest,
			bytes: after.size,
			method: "sudo-n-sha256sum",
		};
	}
}
