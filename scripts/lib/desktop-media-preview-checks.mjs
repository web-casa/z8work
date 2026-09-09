// Native FFmpeg fixtures. Real WebKit pixels and native audio outputs are checked.
import assert from "node:assert/strict";
import { copyFile, readFile, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";

export async function checkMediaPreviews(h) {
	const {
		root,
		execute,
		manifest,
		choose,
		invoke,
		preview,
		js,
		routes,
		checks,
		change,
		screenshot,
		until,
	} = h;
	const ffmpeg = (...args) =>
		execute(
			manifest.engines.ffmpeg.path,
			["-nostdin", "-v", "error", "-n", ...args],
			{ timeout: 30000 },
		);
	const file = (name) => join(root, name);
	const cover = file("album.png");
	await execute(
		manifest.engines.magick.path,
		["-size", "300x600", "xc:lime", cover],
		{ timeout: 10000 },
	);
	await ffmpeg(
		"-f",
		"lavfi",
		"-i",
		"color=c=red:s=720x480:r=5:d=2",
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:duration=2",
		"-c:v",
		"libx264",
		"-threads",
		"1",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		file("video.mp4"),
	);
	for (const ext of ["mov", "mkv"])
		await ffmpeg(
			"-i",
			file("video.mp4"),
			"-c",
			"copy",
			file(`video.${ext}`),
		);
	await ffmpeg(
		"-i",
		file("video.mp4"),
		"-c:v",
		"libvpx-vp9",
		"-threads",
		"1",
		"-c:a",
		"libopus",
		file("video.webm"),
	);
	await ffmpeg(
		"-i",
		file("video.mp4"),
		"-vf",
		"setsar=2/1",
		"-c:v",
		"libx264",
		"-threads",
		"1",
		"-c:a",
		"copy",
		file("wide-pixels.mp4"),
	);
	await ffmpeg(
		"-display_rotation:v:0",
		"90",
		"-i",
		file("video.mp4"),
		"-c",
		"copy",
		file("rotated-video.mp4"),
	);
	const rotation = JSON.parse(
		(
			await execute(
				manifest.engines.ffprobe.path,
				[
					"-v",
					"error",
					"-select_streams",
					"v",
					"-show_entries",
					"stream_side_data",
					"-of",
					"json",
					file("rotated-video.mp4"),
				],
				{ timeout: 10000 },
			)
		).stdout,
	);
	assert.equal(
		rotation.streams[0].side_data_list[0].rotation,
		90,
		"Fixture lacks an actual display matrix",
	);

	await ffmpeg(
		"-i",
		file("video.mp4"),
		"-i",
		cover,
		"-map",
		"1:v",
		"-map",
		"0:v",
		"-map",
		"0:a",
		"-c",
		"copy",
		"-disposition:v:0",
		"attached_pic",
		file("video-and-cover.mp4"),
	);
	for (const [ext, codec] of [
		["mp3", "libmp3lame"],
		["m4a", "aac"],
		["flac", "flac"],
	]) {
		await ffmpeg(
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:duration=2",
			"-i",
			cover,
			"-map",
			"0:a",
			"-map",
			"1:v",
			"-c:a",
			codec,
			"-c:v",
			"png",
			"-threads",
			"1",
			"-disposition:v",
			"attached_pic",
			file(`cover.${ext}`),
		);
	}
	// Vorbis/Opus store FLAC picture blocks in tags, rather than a second stream.
	const png = await readFile(cover),
		mime = Buffer.from("image/png");
	const word = (n) => {
		const b = Buffer.alloc(4);
		b.writeUInt32BE(n);
		return b;
	};
	const picture = Buffer.concat([
		word(3),
		word(mime.length),
		mime,
		word(0),
		word(300),
		word(600),
		word(24),
		word(0),
		word(png.length),
		png,
	]).toString("base64");
	for (const [ext, codec] of [
		["ogg", "libvorbis"],
		["opus", "libopus"],
	]) {
		await ffmpeg(
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:duration=2",
			"-c:a",
			codec,
			"-metadata",
			`METADATA_BLOCK_PICTURE=${picture}`,
			file(`cover.${ext}`),
		);
	}
	await ffmpeg(
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:duration=2",
		"-c:a",
		"pcm_s16le",
		file("no-cover.wav"),
	);
	await ffmpeg(
		"-i",
		file("no-cover.wav"),
		"-c:a",
		"aac",
		file("audio-only.mp4"),
	);
	await writeFile(file("broken-video.mp4"), "not a video");
	await copyFile(file("video.mp4"), file("large-video.mp4"));
	await truncate(file("large-video.mp4"), 33554433);
	const ids = {};
	async function pick(name) {
		await choose(
			"pick_inputs",
			file(name),
			"^Z8.Work — Select input files$",
		);
		const task = (await invoke("queue_snapshot")).tasks.find(
			(t) => t.name === name,
		);
		assert.ok(task, `Missing imported ${name}`);
		ids[name] = task.id;
		return task;
	}
	for (const name of [
		"video.mp4",
		"video.mov",
		"video.mkv",
		"video.webm",
		"wide-pixels.mp4",
		"rotated-video.mp4",
		"video-and-cover.mp4",
		"cover.mp3",
		"cover.m4a",
		"cover.flac",
		"cover.ogg",
		"cover.opus",
	]) {
		const task = await pick(name),
			img = await preview(task.id);
		const audio = name.startsWith("cover.");
		const expected = audio
			? [128, 256]
			: name === "wide-pixels.mp4"
				? [256, 85]
				: name === "rotated-video.mp4"
					? [170, 256]
					: [256, 170];
		assert.deepEqual([img.width, img.height], expected, name);
		const content = await js(
			'const img=document.querySelector(".input-preview img"),c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext("2d");ctx.drawImage(img,0,0);return {pixel:Array.from(ctx.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data),alt:img.alt,caption:img.closest("figure").textContent}',
		);
		assert.ok(
			audio
				? content.pixel[1] > 240 && content.pixel[0] < 15
				: content.pixel[0] > 240 && content.pixel[1] < 15,
			`${name} wrong source pixels: ${content.pixel}`,
		);
		assert.match(
			content.alt,
			audio ? /embedded audio cover/ : /video first-frame/,
		);
		assert.match(content.caption, /Conversion uses the original/);
		const state = await invoke("queue_snapshot"),
			current = state.tasks.find((t) => t.id === task.id);
		assert.equal(state.output_authorized, false);
		assert.equal(current.phase, "ready");
		assert.equal(current.attempt, task.attempt);
		routes.push({
			input: name,
			width: img.width,
			height: img.height,
			pixel: content.pixel,
		});
		if (name === "video.mp4" || name === "cover.mp3") {
			await change(".language select", "zh_hans");
			assert.match(
				await js(
					'return document.querySelector(".input-preview img").alt',
				),
				audio ? /音频内嵌封面/ : /视频首帧/,
			);
			await screenshot(
				audio ? "audio-cover-zh.png" : "video-preview-zh.png",
			);
			await change(".language select", "en");
		}
	}
	await js('document.querySelector("[data-preview-close]").click()');
	checks.push(
		"four-video-containers-and-five-audio-cover-containers",
		"media-preview-without-output-grant-or-attempt",
		"media-preview-bilingual-labels",
		"video-display-aspect-ratio-and-rotation",
		"video-stream-selected-instead-of-embedded-cover",
	);
	for (const [name, reason] of [
		["no-cover.wav", /No embedded cover/],
		["audio-only.mp4", /No video frame/],
		["broken-video.mp4", /./],
		["large-video.mp4", /32 MiB/],
	]) {
		const task = await pick(name);
		await assert.rejects(invoke("preview_input", { id: task.id }), reason);
		const state = await invoke("queue_snapshot"),
			current = state.tasks.find((t) => t.id === task.id);
		assert.equal(state.processing, false);
		assert.equal(current.phase, "ready");
		assert.equal(current.authorized, true);
		assert.equal(current.attempt, task.attempt);
		if (name === "large-video.mp4")
			assert.equal(
				await js(
					'return !!document.querySelector(`[data-task-id="${arguments[0]}"] [data-preview-open]`)',
					[task.id],
				),
				false,
			);
		if (name === "no-cover.wav") {
			await js(
				'document.querySelector(`[data-task-id="${arguments[0]}"] [data-preview-open]`).click()',
				[task.id],
			);
			await until(
				async () =>
					/No readable embedded cover/.test(
						await js(
							'return document.querySelector(".input-preview .error")?.textContent || ""',
						),
					),
				"Missing no-cover explanation",
			);
			await js('document.querySelector("[data-preview-close]").click()');
		}
		checks.push(`media-preview-rejects-${name}-without-blocking-queue`);
	}
	// A renamed playlist must never trigger a network request during sniffing.
	let requests = 0;
	const server = createServer((req, res) => {
		requests++;
		res.writeHead(404);
		res.end();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		for (const ext of ["mp4", "mkv", "mp3"]) {
			const name = `playlist.${ext}`;
			await writeFile(
				file(name),
				`#EXTM3U\n#EXTINF:2,\nhttp://127.0.0.1:${server.address().port}/original.ts\n`,
			);
			const task = await pick(name);
			await assert.rejects(invoke("preview_input", { id: task.id }));
		}
		assert.equal(requests, 0);
	} finally {
		await new Promise((r) => server.close(r));
	}
	await preview(ids["video.mp4"]);
	await js('document.querySelector("[data-preview-close]").click()');
	checks.push(
		"renamed-media-playlists-rejected-with-zero-http-requests",
		"media-preview-recovers-after-errors",
	);
	return ids;
}

export async function checkMediaExport(h, ids) {
	const { invoke, submit, until, execute, manifest, checks } = h;
	for (const name of ["video.mp4", "cover.mp3", "no-cover.wav"]) {
		const id = ids[name];
		await invoke("set_task_format", { id, format: "flac" });
		await submit(id);
		const done = await until(
			async () => {
				const s = await invoke("queue_snapshot");
				return !s.processing && s.tasks.find((t) => t.id === id);
			},
			"Media conversion stalled",
			60000,
		);
		assert.equal(done.phase, "saved", JSON.stringify(done));
		const probe = JSON.parse(
			(
				await execute(
					manifest.engines.ffprobe.path,
					[
						"-v",
						"error",
						"-show_entries",
						"stream=codec_type,codec_name:format=duration",
						"-of",
						"json",
						done.result.files[0].path,
					],
					{ timeout: 10000 },
				)
			).stdout,
		);
		assert.equal(probe.streams.length, 1);
		assert.equal(probe.streams[0].codec_type, "audio");
		assert.equal(probe.streams[0].codec_name, "flac");
		assert.ok(
			Number(probe.format.duration) >= 1.9 &&
				Number(probe.format.duration) < 2.2,
		);
	}
	checks.push(
		"media-conversion-uses-full-audio-after-video-cover-or-missing-cover-preview",
	);
}
