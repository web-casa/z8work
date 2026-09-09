import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeSavedImages } from "../../desktop/src/platform/impact.ts";

export async function checkProduct({
	invoke,
	js,
	change,
	choose,
	submit,
	until,
	screenshot,
	checks,
	xdotool,
	windows,
	root,
	output,
}) {
	const win = (await windows("^Z8.Work — Desktop$"))[0];
	await invoke("remove_tasks", { ids: [] });
	await change(".language select", "zh_hans");
	await until(
		() =>
			js(
				'return document.querySelector("[data-impact-summary]").textContent.includes("：0")',
			),
		"Impact did not reset",
	);
	assert.equal(
		(await invoke("desktop_info")).processing_location,
		"device-v1",
	);
	await assert.rejects(
		invoke("open_impact_source", {
			id: "https://example.com/?file=secret",
		}),
		/Unknown source/,
	);
	await js('document.querySelector("[data-privacy]").open=true');
	await screenshot("product-privacy-zh.png", "[data-privacy]");
	assert.match(
		await js('return document.querySelector("[data-privacy]").textContent'),
		/文件上传 0 B/,
	);
	checks.push("privacy-native-capability-and-external-url-allowlist");
	await js('document.querySelector(".skip-link").focus()');
	await xdotool("windowfocus", win);
	await xdotool("key", "Return");
	await until(
		() => js('return document.activeElement.id === "conversion-workspace"'),
		"Skip link did not focus the workspace",
	);
	checks.push("keyboard-skip-link-focuses-workspace");
	await choose(
		"pick_inputs",
		root + "/large.png",
		"^Z8.Work — (Select input files|选择输入文件|Select input files / 选择输入文件)$",
	);
	await choose(
		"pick_output",
		output + "/",
		"^Z8.Work — (Select output folder|选择保存目录|Select output folder / 选择保存目录)$",
	);
	let s = await invoke("queue_snapshot");
	const task = s.tasks[0];
	await invoke("set_task_format", { id: task.id, format: "webp" });
	await submit(task.id);
	s = await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return s.tasks[0]?.phase === "saved" && s;
		},
		"Product sample conversion failed",
		60000,
	);
	const before = await readFile(s.tasks[0].result.path);
	const compareSummary = async () => {
		const s = await invoke("queue_snapshot");
		const sum = summarizeSavedImages(s.tasks, "device-v1");
		await until(
			async () =>
				(
					await js(
						'return document.querySelector("[data-impact-summary]").textContent',
					)
				).includes(
					new Intl.NumberFormat("zh-Hans", {
						maximumSignificantDigits: 3,
					}).format(Math.abs(sum.savedBytes)),
				),
			"Impact summary differs from native snapshot",
		);
	};
	await compareSummary();
	await screenshot("product-saved-zh.png", "[data-impact]");
	await submit(task.id);
	await until(
		async () => {
			const s = await invoke("queue_snapshot");
			return s.tasks[0].phase === "saved" && s.tasks[0].attempt === 2;
		},
		"Product retry failed",
		60000,
	);
	await compareSummary();
	assert.equal(
		summarizeSavedImages(
			(await invoke("queue_snapshot")).tasks,
			"device-v1",
		).count,
		1,
	);
	checks.push(
		"saved-image-impact-matches-native-snapshot-and-retry-does-not-accumulate",
	);
	// Real keyboard activation of clear; assert both original and previously saved bytes survive.
	await js('document.querySelector(".toolbar .danger").focus()');
	await xdotool("windowfocus", win);
	await xdotool("key", "Return");
	await until(
		async () => (await invoke("queue_snapshot")).tasks.length === 0,
		"Keyboard clear failed",
	);
	assert.deepEqual(await readFile(s.tasks[0].result.path), before);
	assert.ok((await readFile(root + "/large.png")).length > 0);
	await until(
		() =>
			js('return document.activeElement.matches("[data-choose-files]")'),
		"Focus lost after clearing",
	);
	await until(
		() =>
			js(
				'return document.querySelector("[data-impact-summary]").textContent.includes("：0")',
			),
		"Clear did not reset impact",
	);
	checks.push(
		"keyboard-clear-resets-impact-retains-originals-and-saved-files-restores-focus",
	);
	await change(".language select", "en");
	await js(
		'document.querySelector("[data-privacy]").open=false;document.querySelector("[data-impact-details]").open=true',
	);
	await screenshot("product-impact-en.png", "[data-impact-details] summary");
	assert.match(
		await js('return document.querySelector("[data-impact]").textContent'),
		/not a device measurement/,
	);
	// Native minimum window, then 200% layout scaling. CSS zoom emulates effective
	// viewport/text scale; this is not a target-OS DPI or assistive-technology test.
	await xdotool("windowsize", win, "620", "560");
	for (const zoom of [1, 2]) {
		await js(
			"document.documentElement.style.zoom=arguments[0];window.scrollTo(0,0)",
			[String(zoom)],
		);
		await until(
			() =>
				js("return document.documentElement.scrollWidth <= innerWidth"),
			"Horizontal overflow at minimum window scale " + zoom,
		);
		await screenshot(`product-minimum-${zoom}x.png`, ".language");
		await js('document.querySelector(".language select").focus()');
		await xdotool("key", "Tab");
		assert.equal(
			await js(
				'return document.activeElement.matches("[data-privacy] summary")',
			),
			true,
		);
		assert.equal(
			await js(
				"const s=getComputedStyle(document.activeElement);return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 && s.outlineColor !== 'transparent'",
			),
			true,
		);
		await xdotool("key", "Return");
		assert.equal(
			await js('return document.querySelector("[data-privacy]").open'),
			true,
		);
		await xdotool("key", "Return");
	}
	await js('document.documentElement.style.zoom="1"');
	await xdotool("windowsize", win, "1100", "800");
	await js('document.querySelector("[data-impact-details]").open=false');
	checks.push(
		"minimum-620x560-and-200-percent-layout-no-horizontal-overflow-keyboard-focus",
	);
	await change(".language select", "zh_hans");
	assert.equal(await js("return document.documentElement.lang"), "zh-Hans");
	await change(".language select", "en");
	assert.equal(await js("return document.documentElement.lang"), "en");
	checks.push(
		"visible-language-switch-updates-document-language-and-offline-copy",
	);
	await js('document.querySelector("[data-licenses]").open=true');
	await until(
		() =>
			js(
				'return document.querySelector("[data-licenses] textarea")?.value.includes("GNU AFFERO GENERAL PUBLIC LICENSE")',
			),
		"Offline license did not load",
	);
	await assert.rejects(
		invoke("read_license", { id: "licenses/../../secret" }),
	);
	const notices = await invoke("license_index");
	const component = notices.find((entry) => entry.id !== "application");
	if (component) {
		const original = await invoke("read_license", { id: component.id });
		assert.ok(original.length > 0);
		await change("[data-licenses] select", component.id);
		await until(
			async () =>
				(await js(
					'return document.querySelector("[data-licenses] textarea")?.value',
				)) === original,
			"Bundled component notice did not load",
		);
		checks.push("bundled-component-notice-matches-backend-text");
		await change("[data-licenses] select", "application");
		await until(
			() =>
				js(
					'return document.querySelector("[data-licenses] textarea")?.value.includes("GNU AFFERO GENERAL PUBLIC LICENSE")',
				),
			"Application license did not reload",
		);
	}
	await screenshot("product-licenses-en.png", "[data-licenses]");
	checks.push("offline-license-readable-and-arbitrary-path-rejected");
}
