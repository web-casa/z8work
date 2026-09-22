import assert from "node:assert/strict";
import { readFile, readdir, writeFile, rename, lstat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { cachedWebp } from "./desktop-packaged-quit-checks.mjs";
import { processIdentity, sameProcess } from "./desktop-linux-process.mjs";

export async function checkPackagedRemoveUnsaved({
	root,
	output,
	input,
	original,
	collisions,
	invoke,
	js,
	change,
	choose,
	until,
	screenshot,
	checks,
	windows,
	xdotool,
}) {
	const cache = join(root, "cache/work.z8.desktop.m0/native-work-v1");
	assert.deepEqual(await cachedWebp(cache), []);
	const second = join(root, "remove-keep.png");
	const png = await js(
		'const c=document.createElement("canvas");c.width=48;c.height=24;const x=c.getContext("2d");x.fillStyle="#2345ab";x.fillRect(0,0,48,24);return c.toDataURL("image/png").split(",")[1]',
	);
	const secondBytes = Buffer.from(png, "base64");
	await writeFile(second, secondBytes, { flag: "wx" });
	for (let i = 1; i <= 1000; i++)
		await writeFile(
			join(collisions, `remove-keep-z8-${i}.webp`),
			"existing",
			{ flag: "wx" },
		);
	const existing = new Map();
	for (const n of await readdir(output))
		existing.set(n, await readFile(join(output, n)));
	const main = (await windows("^Z8.Work — Desktop$"))[0];
	const app = await processIdentity(
		Number(await xdotool("getwindowpid", main)),
	);
	assert.ok(app);
	for (const path of [input, second]) {
		await choose("button-input", path, "^Z8.Work — Select input files$");
		const t = await until(
			async () =>
				(await invoke("queue_snapshot")).tasks.find(
					(t) => t.name === basename(path),
				),
			"Remove sample missing",
		);
		await change(`[data-task-id="${t.id}"] select`, "webp");
	}
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
		"Convert unavailable",
	);
	await js('document.querySelector("[data-start-conversion]").click()');
	const before = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			for (const t of s.tasks)
				if (t.phase === "failed") throw new Error(t.error);
			return (
				!s.processing &&
				s.tasks.length === 2 &&
				s.tasks.every((t) => t.phase === "awaiting_save") &&
				s
			);
		},
		"Both results did not await saving",
		30000,
	);
	for (const t of before.tasks) {
		assert.equal(t.attempt, 1);
		assert.equal(t.result, null);
		assert.match(t.error, /Too many output filename collisions/);
	}
	const removed = before.tasks.find((t) => t.name === basename(input)),
		kept = before.tasks.find((t) => t.name === basename(second));
	assert.ok(removed && kept);
	const decode = async (bytes) => {
		await js(
			'window.z8RemoveDecoded=null;const im=new Image();im.onload=()=>window.z8RemoveDecoded=[im.naturalWidth,im.naturalHeight];im.onerror=()=>window.z8RemoveDecoded="failed";im.src=arguments[0]',
			[`data:image/webp;base64,${bytes.toString("base64")}`],
		);
		return until(
			() => js("return window.z8RemoveDecoded"),
			"Retained WebP did not decode",
		);
	};
	const paths = await cachedWebp(cache);
	assert.equal(paths.length, 2);
	const payloads = [];
	for (const path of paths) {
		const bytes = await readFile(path);
		payloads.push({ path, bytes, decoded: await decode(bytes) });
	}
	const discarded = payloads.find((p) => p.decoded[0] === 32),
		retained = payloads.find((p) => p.decoded[0] === 48);
	assert.ok(discarded && retained);
	assert.deepEqual(discarded.decoded, [32, 32]);
	assert.deepEqual(retained.decoded, [48, 24]);
	assert.notDeepEqual(discarded.bytes, retained.bytes);
	await screenshot(
		"remove-unsaved-before.png",
		`[data-task-id="${removed.id}"]`,
	);
	await js(
		'const row=document.querySelector(arguments[0]);const b=[...row.querySelectorAll("button")].find(b=>b.textContent.trim()==="Remove task");if(!b||b.disabled)throw new Error("Remove unavailable");b.focus()',
		[`[data-task-id="${removed.id}"]`],
	);
	await xdotool("windowfocus", main);
	await xdotool("key", "Return");
	const after = await until(async () => {
		const s = await invoke("queue_snapshot");
		return !s.clearing && !s.processing && s.tasks.length === 1 && s;
	}, "Single removal did not settle");
	assert.equal(after.closing, false);
	assert.equal(after.epoch, before.epoch);
	assert.equal(after.output, before.output);
	assert.equal(after.output_authorized, true);
	assert.deepEqual(after.tasks[0], kept);
	await until(async () => {
		try {
			await lstat(discarded.path);
			return false;
		} catch (e) {
			if (e.code === "ENOENT") return true;
			throw e;
		}
	}, "Removed payload remains");
	assert.deepEqual(await cachedWebp(cache), [retained.path]);
	assert.deepEqual(await readFile(retained.path), retained.bytes);
	assert.ok(await sameProcess(app));
	const unchanged = async () => {
		assert.deepEqual(await readFile(input), original);
		assert.deepEqual(await readFile(second), secondBytes);
		assert.equal((await readdir(collisions)).length, 2000);
		for (const prefix of ["save-probe", "remove-keep"])
			for (let i = 1; i <= 1000; i++)
				assert.equal(
					await readFile(
						join(collisions, `${prefix}-z8-${i}.webp`),
						"utf8",
					),
					"existing",
				);
		for (const [n, b] of existing)
			assert.deepEqual(await readFile(join(output, n)), b);
	};
	await unchanged();
	assert.deepEqual(
		(await readdir(output)).sort(),
		[...existing.keys()].sort(),
	);
	await screenshot("remove-unsaved-kept.png", `[data-task-id="${kept.id}"]`);
	checks.push("keyboard-remove-one-unsaved-releases-only-selected-cache");
	const moved = second + ".moved";
	await rename(second, moved);
	let completed;
	try {
		await assert.rejects(lstat(second), { code: "ENOENT" });
		await choose(
			"button-output",
			output + "/",
			"^Z8.Work — Select output folder$",
		);
		const selector = `[data-task-id="${kept.id}"] [data-save-result]`;
		await until(
			() =>
				js(
					"const b=document.querySelector(arguments[0]);return b&&!b.disabled",
					[selector],
				),
			"Save-only unavailable",
		);
		await js("document.querySelector(arguments[0]).focus()", [selector]);
		await xdotool("windowfocus", main);
		await xdotool("key", "Return");
		completed = await until(
			async () => {
				const s = await invoke("queue_snapshot");
				const t = s.tasks[0];
				if (t?.phase === "failed") throw new Error(t.error);
				return !s.processing && t?.phase === "saved" && s;
			},
			"Other cached result did not save",
			30000,
		);
		assert.equal(completed.tasks.length, 1);
		assert.equal(completed.tasks[0].id, kept.id);
		assert.equal(completed.tasks[0].attempt, 2);
		assert.equal(completed.epoch, before.epoch);
		assert.deepEqual(
			await readFile(completed.tasks[0].result.path),
			retained.bytes,
		);
		await assert.rejects(lstat(second), { code: "ENOENT" });
	} finally {
		await rename(moved, second);
	}
	const saved = completed.tasks[0].result;
	assert.equal(dirname(saved.path), output);
	assert.equal(saved.bytes, retained.bytes.length);
	assert.ok(await sameProcess(app));
	await unchanged();
	assert.deepEqual(
		(await readdir(output)).sort(),
		[...existing.keys(), basename(saved.path)].sort(),
	);
	await until(
		async () => (await cachedWebp(cache)).length === 0,
		"Saved payload remains",
	);
	const decoded = await decode(await readFile(saved.path));
	assert.deepEqual(decoded, [48, 24]);
	await screenshot(
		"remove-unsaved-saved.png",
		`[data-task-id="${kept.id}"] .saved-path`,
	);
	await js('document.querySelector(".toolbar .danger").click()');
	await until(async () => {
		const s = await invoke("queue_snapshot");
		return !s.clearing && s.tasks.length === 0;
	}, "Final clear failed");
	assert.deepEqual(await readFile(saved.path), retained.bytes);
	checks.push(
		"remove-one-unsaved-other-result-saves-without-source-or-reencoding",
	);
	const digest = (b) => ({
		bytes: b.length,
		sha256: createHash("sha256").update(b).digest("hex"),
	});
	await writeFile(
		join(root, "remove-unsaved-details.json"),
		JSON.stringify(
			{
				schema: 1,
				beforeRemoval: before,
				afterRemoval: after,
				afterSave: completed,
				appRemainedOpen: true,
				sourceUnavailableDuringSave: true,
				collisionsPreserved: 2000,
				discardedPayload: {
					...digest(discarded.bytes),
					decoded: discarded.decoded,
				},
				retainedPayload: {
					...digest(retained.bytes),
					decoded: retained.decoded,
				},
				decoded,
				output: {
					file: basename(saved.path),
					...digest(retained.bytes),
				},
			},
			null,
			2,
		) + "\n",
	);
}
