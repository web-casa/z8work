import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { taskReadiness } from "../src/platform/runtime.ts";
const json = async (path) =>
	JSON.parse(
		await readFile(new URL(`../../${path}`, import.meta.url), "utf8"),
	);
test("every native architecture audits a fingerprinted complete package rather than an application-only archive", async () => {
	const matrix = await json("packaging/desktop/ci-matrix.json");
	const sources = await json("packaging/desktop/capability-sources.json");
	assert.deepEqual(
		sources.map((s) => s.id).sort(),
		matrix.map((s) => s.id).sort(),
	);
	for (const s of sources) {
		assert.match(s.sha256, /^[a-f0-9]{64}$/);
		assert.match(s.run, /^\d+$/);
		assert.ok(!s.artifact.includes("application-only"));
		assert.equal(s.runner, matrix.find((m) => m.id === s.id).runner);
		assert.equal(s.target, matrix.find((m) => m.id === s.id).target);
		assert.equal(s.arch, s.id.endsWith("arm64") ? "arm64" : "x64");
	}
});
test("frontend readiness uses reviewed routes and rejects unknown inputs even when all engines are ready", async () => {
	const scope = await json("packaging/desktop/v1-scope.json");
	const states = ["magick", "mutool", "ffmpeg", "ffprobe", "pandoc"].map(
		(id) => ({ id, phase: "ready", failure: null }),
	);
	for (const g of scope.groups)
		for (const ext of g.inputs) {
			const task = { name: `file.${ext.toUpperCase()}`, phase: "ready" };
			assert.equal(taskReadiness(task, states), "ready");
			for (const needed of g.engines)
				assert.equal(
					taskReadiness(
						task,
						states.filter((s) => s.id !== needed),
					),
					"preparing",
				);
		}
	assert.equal(
		taskReadiness({ name: "file.xlsx", phase: "ready" }, states),
		"failed",
	);
	assert.equal(
		taskReadiness({ name: "file.xlsx", phase: "awaiting_save" }, states),
		"ready",
	);
});

const { imageInventory, codecInventory, summarizeInventory } = await import(
	"../../scripts/lib/desktop-format-inventory.mjs"
);
test("inventory preserves read/write direction, excludes pseudo formats from product summary and never treats an unavailable probe as absence", () => {
	const raw =
		" Format Module Mode Description\n PNG* PNG rw- Portable\r\n HEIC HEIC r-- Read only\n INFO INFO -w+ Metadata\n GRADIENT* GRADIENT r-- Generator\n JXL JXL --- Disabled";
	assert.deepEqual(imageInventory(raw).get("HEIC"), {
		read: true,
		write: false,
		multiImage: false,
	});
	assert.deepEqual(imageInventory(raw).get("INFO"), {
		read: false,
		write: true,
		multiImage: true,
	});
	const s = summarizeInventory({
		probes: [{ kind: "image-formats", status: "listed", raw }],
	});
	assert.equal(s.images.HEIC.write, false);
	assert.equal(s.images.BMP.status, "not-listed");
	assert.equal(s.images.JXL.write, false);
	assert.ok(!("GRADIENT" in s.images));
	assert.equal(s.encoders.aac, "unknown");
	assert.equal(
		summarizeInventory({ probes: [] }).images.BMP.status,
		"unknown",
	);
	assert.deepEqual(
		[
			...codecInventory(
				"V..... = Video\n V....D libx264 H264\n A....D aac AAC\n not an encoder",
			),
		],
		["libx264", "aac"],
	);
});

test("Windows ImageMagick inventory without module column is parsed", () => {
	const rows = imageInventory(
		" PNG* rw- Portable Network Graphics\r\n AVIF rw+ AV1\r\n HEIC r-- HEIF",
	);
	assert.equal(rows.get("PNG").write, true);
	assert.equal(rows.get("AVIF").multiImage, true);
	assert.equal(rows.get("HEIC").write, false);
});
