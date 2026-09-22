// Local drafting and validation only. No store APIs, login, upload or publishing commands.
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import {
	loadStore,
	renderPage,
	pagePath,
	assessChannel,
} from "./lib/desktop-store.mjs";
import { sha256 } from "./lib/desktop-artifacts.mjs";
const { values } = parseArgs({
	options: {
		output: { type: "string" },
		"write-pages": { type: "boolean" },
		"check-pages": { type: "boolean" },
		"require-ready": { type: "boolean" },
	},
});
if (values["write-pages"] && values["check-pages"])
	throw new Error("Choose write-pages or check-pages");
const root = resolve(".");
const { content, submission, matrix } = await loadStore();
const pages = [];
for (const locale of matrix.languages)
	for (const kind of ["privacy", "support"]) {
		const html = renderPage(content, locale, kind);
		const file = join("static", pagePath(locale, kind), "index.html");
		pages.push({
			locale,
			kind,
			file,
			url: new URL(pagePath(locale, kind), content.website).href,
			sha256: sha256(Buffer.from(html)),
		});
		if (values["write-pages"]) {
			await mkdir(dirname(file), { recursive: true });
			await writeFile(file, html);
		}
		if (values["check-pages"] && (await readFile(file, "utf8")) !== html)
			throw new Error(`Generated page drift: ${file}`);
	}
const channels = await Promise.all(
	["microsoft-store", "snap"].map((channel) =>
		assessChannel(root, content, submission, matrix, channel),
	),
);
const report = {
	schema: 1,
	version: matrix.version,
	status: channels.every((c) => c.status === "ready-for-human-review")
		? "ready-for-human-review"
		: "blocked",
	pages: pages.map((p) => ({
		...p,
		deployment: submission.publicPages.status,
	})),
	channels,
	sourceSha256: {},
};
for (const file of [
	"packaging/desktop/store/content.json",
	"packaging/desktop/store/submission.json",
	"packaging/desktop/artifacts.json",
	"scripts/lib/desktop-store.mjs",
	"scripts/lib/desktop-artifacts.mjs",
	"scripts/desktop-store-browser.mjs",
	"scripts/desktop-store-verify-pages.mjs",
	"scripts/desktop-store.mjs",
]) {
	report.sourceSha256[file] = sha256(await readFile(file));
}
if (values.output) {
	const output = resolve(values.output);
	await mkdir(output); // Never overwrite a reviewed dossier.
	for (const [locale, c] of Object.entries(content.locales)) {
		for (const channel of ["microsoft-store", "snap"]) {
			const listing = {
				status: "draft",
				version: matrix.version,
				language: locale,
				productName: content.product,
				summary: c.summary,
				shortDescription: c.shortDescription,
				description: c.description,
				features: c.features,
				whatsNew: "",
				website: content.website,
				supportUrl: new URL(
					pagePath(locale, "support"),
					content.website,
				).href,
				privacyUrl: new URL(
					pagePath(locale, "privacy"),
					content.website,
				).href,
				contact: content.contact,
				source: content.source,
				identity: submission.channels[channel],
			};
			await writeFile(
				join(output, `${channel}-${locale}.json`),
				JSON.stringify(listing, null, 2) + "\n",
			);
		}
		await writeFile(
			join(output, `review-notes-${locale}.md`),
			reviewNotes(locale),
		);
		for (const kind of ["privacy", "support"])
			await writeFile(
				join(output, `${kind}-${locale}.html`),
				renderPage(content, locale, kind),
			);
	}
	await writeFile(
		join(output, "readiness.json"),
		JSON.stringify(report, null, 2) + "\n",
	);
	await writeFile(
		join(output, "README.md"),
		`# Z8.Work desktop store dossier\n\nStatus: ${report.status}. These are local drafts, not an API submission payload. Public page URLs are planned until deployment is verified. Store screenshot readiness is listed per channel below; Linux ARM64 development captures cannot substitute for target-platform captures.\n\n${channels.map((c) => `## ${c.channel}\n\n${c.blockers.map((b) => `- ${b}`).join("\n")}`).join("\n\n")}\n\nReview the current Partner Center/Snap forms and Phase 30 release handoff manually. No login, upload, certification or publication has been performed.\n`,
	);
}
console.log(JSON.stringify(report, null, 2));
if (values["require-ready"] && report.status !== "ready-for-human-review")
	process.exitCode = 1;
function reviewNotes(locale) {
	return locale === "en"
		? `# Z8.Work reviewer notes — local draft\n\nDo not submit until R5 candidate and R6 native acceptance is complete.\n\n1. Install the exact candidate identified in readiness evidence. No account or automatic conversion-server connection is required.\n2. Select generated PNG/JPEG/HEIC fixtures and an empty writable output folder. Try PNG, JPEG, WebP and AVIF output and compare saved sizes. Test quality presets; do not expect every output to be smaller.\n3. Exercise a save failure in an isolated output folder. If Retry save is offered, choose another folder and verify the retained result saves without re-encoding, including when the input path is unavailable. Save before exiting; retained results are session-only and expire after 30 idle minutes (256 MiB per file, 1 GiB total).\n4. Export a multi-page PDF. Cancel after a page is saved, reload the interface, then retry unfinished pages with the same input, settings and output folder. Confirm existing results remain intact.\n5. Convert an audio fixture, extract audio from a supported video, and extract TXT from Markdown/DOCX. OCR, spreadsheets and video output are out of scope.\n6. Restart the app and confirm history is visible but source/output access must be granted again. Cancel a picker and test a denied output location.\n7. Clear the queue and confirm source and saved output files remain. History migration backups are separately retained. Test upgrade and uninstall on the installed package.\n\n## Windows / MSIX\n\nThe planned full-trust desktop process manages native conversion subprocesses and user-selected file IO; this is not a request for administrator elevation. Confirm the actual package capability declaration. Verify WebView2 present/missing and offline behavior; no WebView2 distribution path has been certified here. Inspect the actual exe/DLL and identity evidence; use the Windows candidate's screenshots. No internal updater exists.\n\n## Snap\n\nUse the actual strict amd64 candidate. Check portal/home, hidden files and output-folder grants separately. Removable-media connection is not assumed. Developer mode and the Phase 3 ARM64 tarball do not demonstrate strict confinement. Verify update/rollback and package-manager data retention.\n\n## Contact\n\ncontact@web.casa — provide redacted errors and generated fixtures. Privacy and support links are in the locale listing; deploy and verify their exact content before submission.\n`
		: `# Z8.Work 审核说明——本地草稿\n\n完成目标平台 R5 候选及 R6 原生验收后才可提交。\n\n1. 安装证据中明确哈希的候选包，无需账号；转换不自动连接转换服务器。\n2. 选择人工生成的 PNG/JPEG/HEIC 和空的可写保存目录，分别输出 PNG、JPEG、WebP、AVIF，检查质量档位与结果体积；输出不保证变小。\n3. 导出多页 PDF，在保存一页后取消，刷新界面，使用相同输入、设置和目录重试未完成页；确认已有结果完整保留。\n5. 转换音频，从支持的视频中提取音轨，从 Markdown/DOCX 提取 TXT。OCR、表格转换和视频输出不在本版范围。\n6. 重启后应保留历史，但需重新授权输入与输出。测试取消文件选择和拒绝输出目录访问。\n7. 清空队列不删除原文件及保存结果；历史升级备份另行保留。在实际安装包上检查升级与卸载。\n\n## Windows / MSIX\n\n计划中的 full-trust 桌面进程负责原生子进程与用户授权文件读写，不是请求管理员提权；以实际包声明为准。检查 WebView2 已安装、缺失及离线场景，本轮未认证其分发路线。核对实际 exe/DLL、包身份及 Windows 截图。程序没有内部更新器。\n\n## Snap\n\n使用实际 strict amd64 候选，分别检查 portal/home、隐藏文件及输出目录授权，不默认外接盘接口已连接。devmode 和 Phase3 ARM64 tar 包不能证明 strict 隔离。检查更新回滚及包管理器数据保留行为。\n\n## 联系方式\n\ncontact@web.casa。反馈时使用脱敏错误和生成的样本。隐私与支持链接见相应语言材料，提交前需部署并核对正文。\n`;
}
