import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
	formatName,
	groupOrder,
	hubLinks,
	hubs,
	pickerEntries,
	relatedForTool,
	toolForPath,
	tools,
} from "../src/lib/seo/routes.mjs";

/**
 * Extract the converters' declared FormatInfo capabilities without importing
 * the Svelte-runtime modules: landing pages must only promise conversions the
 * engine tables actually declare.
 */
function parseDeclaredFormats() {
	const read = (relative) =>
		readFileSync(new URL(`../src/lib/${relative}`, import.meta.url), "utf8")
			.split("\n")
			.filter((line) => !line.trim().startsWith("//"))
			.join("\n");
	const formats = new Map();
	const declare = (name, from, to) => {
		const key = `.${name.toLowerCase()}`;
		const existing = formats.get(key) ?? { from: false, to: false };
		formats.set(key, {
			from: existing.from || from,
			to: existing.to || to,
		});
	};
	for (const relative of [
		"converters/magick.svelte.ts",
		"converters/magick-automated.ts",
		"converters/ffmpeg.svelte.ts",
		"converters/pandoc.svelte.ts",
		"converters/pdf.svelte.ts",
	]) {
		for (const match of read(relative).matchAll(
			/new FormatInfo\("([^"]+)",\s*(true|false),\s*(true|false)/g,
		)) {
			declare(match[1], match[2] === "true", match[3] === "true");
		}
	}
	// FFmpeg video inputs and PDF raster outputs are declared as plain lists.
	const videoList = read("converters/ffmpeg.svelte.ts").match(
		/const videoFormats = \[([^\]]*)\]/s,
	);
	assert.ok(videoList, "videoFormats list not found");
	for (const match of videoList[1].matchAll(/"([a-z0-9]+)"/g)) {
		declare(match[1], true, false);
	}
	const pdfModule = read("util/pdf-options.ts");
	for (const match of pdfModule.matchAll(/"(\.[a-z0-9]+)": "image\//g)) {
		declare(match[1].slice(1), false, true);
	}
	return formats;
}

const declaredFormats = parseDeclaredFormats();

test("tool and hub slugs are unique", () => {
	const slugs = [...tools, ...hubs].map((entry) => entry.slug);
	assert.equal(new Set(slugs).size, slugs.length);
});

test("every pair preselects a real conversion", () => {
	for (const tool of tools) {
		assert.ok(tool.inputs.length >= 1, tool.slug);
		assert.ok(tool.target, tool.slug);
		if (tool.slug.includes("-to-")) {
			for (const input of tool.inputs) {
				assert.notEqual(input, tool.target, tool.slug);
			}
		}
	}
});

test("every hub links at least one conversion", () => {
	for (const hub of hubs) {
		const links = hubLinks(hub);
		assert.ok(links.from.length >= 1, hub.slug);
		assert.ok(
			links.from.length + links.to.length >= 2,
			`${hub.slug} has too few conversions to justify a hub`,
		);
	}
});

test("relatedForTool excludes self, dedupes and caps", () => {
	for (const tool of tools) {
		const related = relatedForTool(tool.slug);
		const slugs = related.pairs.map((entry) => entry.slug);
		assert.ok(!slugs.includes(tool.slug), tool.slug);
		assert.equal(new Set(slugs).size, slugs.length, tool.slug);
		assert.ok(related.pairs.length <= 9, tool.slug);
		for (const hub of related.hubs) {
			const reachable =
				tool.inputs.includes(hub.format) ||
				tool.target === hub.format ||
				hub.linksFromGroup === tool.group;
			assert.ok(reachable, `${tool.slug} → ${hub.slug}`);
		}
	}
});

test("relatedForTool resolves unknown slugs safely", () => {
	assert.deepEqual(relatedForTool("nope"), { pairs: [], hubs: [] });
});

test("toolForPath resolves pairs and hubs, ignores locale prefix", () => {
	assert.equal(toolForPath("/tools/wav-to-mp3/").slug, "wav-to-mp3");
	assert.equal(
		toolForPath("/zh-Hans/tools/mp3-converter/").slug,
		"mp3-converter",
	);
	assert.equal(toolForPath("/tools/unknown/"), undefined);
});

test("formatName renders dotted extensions", () => {
	assert.equal(formatName(".jpg"), "JPG");
	assert.equal(formatName(".heic"), "HEIC");
});

test("hub entries carry group matching their format family", () => {
	for (const hub of hubs) {
		assert.ok(hub.group, hub.slug);
	}
});

test("picker entries resolve to real tool pages without duplicate formats", () => {
	const entries = pickerEntries();
	const formats = entries.map((entry) => entry.format);
	assert.equal(new Set(formats).size, formats.length);
	for (const entry of entries) {
		assert.ok(groupOrder.includes(entry.group), entry.format);
		const targetFormats = entry.targets.map((target) => target.format);
		assert.equal(
			new Set(targetFormats).size,
			targetFormats.length,
			entry.format,
		);
		for (const target of entry.targets) {
			const tool = tools.find(
				(candidate) => candidate.slug === target.slug,
			);
			assert.ok(tool, target.slug);
			assert.equal(tool.target, target.format, target.slug);
			assert.ok(tool.inputs.includes(entry.format), entry.format);
		}
	}
});

test("every landing page matches the converters' declared capabilities", () => {
	assert.ok(declaredFormats.size > 100, "format table parse looks broken");
	for (const tool of tools) {
		for (const input of tool.inputs) {
			const format = declaredFormats.get(input);
			assert.ok(format, `${tool.slug}: input ${input} undeclared`);
			assert.ok(format.from, `${tool.slug}: input ${input} not readable`);
		}
		const target = declaredFormats.get(tool.target);
		assert.ok(target, `${tool.slug}: target ${tool.target} undeclared`);
		assert.ok(
			target.to,
			`${tool.slug}: target ${tool.target} not writable`,
		);
	}
});
