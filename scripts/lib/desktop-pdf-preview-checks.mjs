// Generated PDF fixtures and assertions for the real desktop preview GUI harness.
import assert from "node:assert/strict";
import { writeFile, copyFile, truncate } from "node:fs/promises";
import { join } from "node:path";

function pdf(pages, rotate = 0) {
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		`<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages} >>`,
	];
	for (let i = 0; i < pages; i++) {
		const color = ["1 0 0", "0 1 0", "0 0 1"][i % 3];
		const stream = `${color} rg 0 0 720 480 re f\n`;
		objects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 480] /Rotate ${rotate} /Resources << >> /Contents ${4 + i * 2} 0 R >>`,
			`<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
		);
	}
	let value = "%PDF-1.4\n";
	const offsets = [];
	for (const [i, object] of objects.entries()) {
		offsets.push(value.length);
		value += `${i + 1} 0 obj\n${object}\nendobj\n`;
	}
	const start = value.length;
	value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets)
		value += `${String(offset).padStart(10, "0")} 00000 n \n`;
	return (
		value +
		`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
	);
}

export async function checkPdfPreviews(h) {
	const {
		root,
		choose,
		change,
		until,
		invoke,
		preview,
		js,
		checks,
		routes,
		execute,
		manifest,
		screenshot,
	} = h;
	const files = {
		"three-pages.PDF": pdf(3),
		"rotated.pdf": pdf(1, 90),
		"many-pages.pdf": pdf(201),
		"empty.pdf": pdf(0),
		"broken.pdf": "%PDF-1.4\nnot a document",
		"disguised.pdf":
			'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>',
	};
	for (const [name, content] of Object.entries(files))
		await writeFile(join(root, name), content);
	const mutool = manifest.engines.mutool;
	await execute(
		mutool.path,
		[
			"clean",
			"-E",
			"aes-256",
			"-O",
			"fixture-owner",
			"-U",
			"fixture-user",
			join(root, "three-pages.PDF"),
			join(root, "encrypted.pdf"),
		],
		{
			timeout: 10000,
			env: {
				...process.env,
				...(mutool.library_dir
					? { LD_LIBRARY_PATH: mutool.library_dir }
					: {}),
			},
		},
	);
	await copyFile(join(root, "three-pages.PDF"), join(root, "large.pdf"));
	await truncate(join(root, "large.pdf"), 33554433);
	async function pick(name) {
		await choose(
			"pick_inputs",
			join(root, name),
			"^Z8.Work — Select input files$",
		);
		return (await invoke("queue_snapshot")).tasks.find(
			(t) => t.name === name,
		);
	}
	const main = await pick("three-pages.PDF");
	for (const name of ["three-pages.PDF", "rotated.pdf", "many-pages.pdf"]) {
		const task = name === main.name ? main : await pick(name);
		const img = await preview(task.id);
		assert.ok(
			img.width > 0 &&
				img.height > 0 &&
				img.width <= 256 &&
				img.height <= 256,
		);
		assert.equal(name === "rotated.pdf" ? img.height : img.width, 256);
		assert.ok(
			name === "rotated.pdf"
				? img.width < img.height
				: img.width > img.height,
		);
		const content = await js(
			'const img=document.querySelector(".input-preview img"),c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext("2d");ctx.drawImage(img,0,0);return {pixel:Array.from(ctx.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data),alt:img.alt,caption:img.closest("figure").textContent}',
		);
		assert.deepEqual(content.pixel, [255, 0, 0, 255]);
		assert.match(content.alt, /first-page preview/);
		assert.match(content.caption, /still exports each page/);
		const state = await invoke("queue_snapshot");
		assert.equal(state.output_authorized, false);
		assert.equal(state.tasks.find((t) => t.id === task.id).phase, "ready");
		assert.equal(
			state.tasks.find((t) => t.id === task.id).attempt,
			task.attempt,
		);
		routes.push({
			input: name,
			width: img.width,
			height: img.height,
			firstPagePixel: content.pixel,
		});
		if (name === main.name) {
			await screenshot("pdf-preview.png");
			await change(".language select", "zh_hans");
			assert.match(
				await js(
					'return document.querySelector(".input-preview img").alt',
				),
				/首页预览/,
			);
			await screenshot("pdf-preview-zh.png");
			await change(".language select", "en");
			checks.push("pdf-preview-bilingual-labels");
		}
	}
	await js('document.querySelector("[data-preview-close]").click()');
	checks.push(
		"pdf-first-page-pixels-and-label-without-output-grant",
		"pdf-rotation-preserved",
		"pdf-201-pages-preview-independent-of-export-limit",
	);
	for (const name of [
		"empty.pdf",
		"broken.pdf",
		"disguised.pdf",
		"encrypted.pdf",
		"large.pdf",
	]) {
		const task = await pick(name);
		await assert.rejects(
			invoke("preview_input", { id: task.id }),
			name === "large.pdf"
				? /32 MiB/
				: name === "disguised.pdf"
					? /PDF header/
					: /./,
		);
		const state = await invoke("queue_snapshot"),
			current = state.tasks.find((t) => t.id === task.id);
		assert.equal(state.processing, false);
		assert.equal(current.phase, "ready");
		assert.equal(current.attempt, task.attempt);
		assert.equal(current.authorized, true);
		if (name === "broken.pdf") {
			await js(
				'document.querySelector(`[data-task-id="${arguments[0]}"] [data-preview-open]`).click()',
				[task.id],
			);
			await until(
				async () =>
					/still try converting/.test(
						await js(
							'return document.querySelector(".input-preview .error")?.textContent || ""',
						),
					),
				"PDF preview failure was not displayed",
			);
			await js('document.querySelector("[data-preview-close]").click()');
			checks.push("pdf-preview-error-shown-without-promising-conversion");
		}
		if (name === "large.pdf") {
			assert.equal(
				await js(
					'return !!document.querySelector(`[data-task-id="${arguments[0]}"] [data-preview-open]`)',
					[task.id],
				),
				false,
			);
		}
		checks.push(
			`pdf-preview-rejects-${name}-without-changing-conversion-state`,
		);
	}
	// An error must release the reservation, allowing a valid preview immediately.
	await preview(main.id);
	await js('document.querySelector("[data-preview-close]").click()');
	checks.push("pdf-preview-recovers-after-errors");
	return main.id;
}

export async function checkPdfExport(h, id) {
	const { invoke, submit, until, execute, manifest, checks } = h;
	await invoke("configure_tasks", {
		ids: [id],
		format: "png",
		options: { quality: "balanced", keep_metadata: false, pdf_dpi: 144 },
	});
	await submit(id);
	const done = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return !s.processing && s.tasks.find((t) => t.id === id);
		},
		"PDF export did not settle",
		60000,
	);
	assert.equal(done.phase, "saved");
	assert.equal(done.result.files.length, 3);
	for (const [i, file] of done.result.files.entries()) {
		const result = await execute(
			manifest.engines.magick.path,
			[file.path, "-format", "%w %h %[pixel:p{720,480}]", "info:"],
			{ timeout: 10000 },
		);
		assert.match(result.stdout, /^1440 960 /);
		assert.match(
			result.stdout,
			[/\(255,0,0(?:,1)?\)/, /\(0,255,0(?:,1)?\)/, /\(0,0,255(?:,1)?\)/][
				i
			],
		);
	}
	checks.push("pdf-export-still-has-three-original-resolution-colored-pages");
}
