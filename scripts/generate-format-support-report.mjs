import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = resolve(root, "docs/desktop/FORMAT_SUPPORT_REPORT.html");
const catalogMarkdownPath = resolve(
	root,
	"docs/desktop/FORMAT_EXPANSION_CATALOG.md",
);
const reportDate = "2026-09-15";

const read = (path) => readFile(resolve(root, path), "utf8");
const json = async (path) => JSON.parse(await read(path));
const escape = (value) =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
const unique = (values) => [...new Set(values)];

function parseFormatInfos(source) {
	const formats = [];
	const activeSource = source
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("//"))
		.join("\n");
	const expression =
		/new\s+FormatInfo\(\s*"([^"]+)"\s*(?:,\s*(true|false))?\s*(?:,\s*(true|false))?\s*(?:,\s*(true|false))?\s*\)/g;
	for (const match of activeSource.matchAll(expression)) {
		formats.push({
			name: match[1].toLowerCase(),
			from: match[2] === undefined ? true : match[2] === "true",
			to: match[3] === undefined ? true : match[3] === "true",
			native: match[4] === undefined ? true : match[4] === "true",
		});
	}
	return formats;
}

function parseStringArray(source, declaration) {
	const match = source.match(
		new RegExp(`const\\s+${declaration}\\s*=\\s*\\[([\\s\\S]*?)\\];`),
	);
	if (!match) throw new Error(`Could not find ${declaration}`);
	return [...match[1].matchAll(/"([^"]+)"/g)].map((item) =>
		item[1].toLowerCase(),
	);
}

function mergeFormats(...collections) {
	const byName = new Map();
	for (const item of collections.flat()) {
		const existing = byName.get(item.name);
		if (!existing) {
			byName.set(item.name, { ...item });
			continue;
		}
		existing.from ||= item.from;
		existing.to ||= item.to;
		existing.native ||= item.native;
	}
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function formatNames(formats, direction) {
	return formats
		.filter((item) => item[direction])
		.map((item) => item.name)
		.sort((a, b) => a.localeCompare(b));
}

function canonical(name) {
	const normalized = name.replace(/^\./, "").toLowerCase();
	return (
		{
			jpg: "jpeg",
			jpe: "jpeg",
			tif: "tiff",
			aif: "aiff",
			oga: "ogg",
		}[normalized] ?? normalized
	);
}

function outputFileExtension(format) {
	return format === "jpeg" ? "jpg" : format;
}

function parseMagickFormats(raw) {
	const entries = [];
	for (const line of raw.split("\n")) {
		const match = line.match(
			/^\s*([A-Z0-9][A-Z0-9_-]*\*?)\s+(\S+)\s+([rw-]{2}[+-])\s+(.+)$/,
		);
		if (!match) continue;
		entries.push({
			tag: match[1],
			module: match[2],
			mode: match[3],
			description: match[4],
		});
	}
	return entries;
}

function parseFfmpegEncoders(raw) {
	return raw
		.split("\n")
		.map((line) => line.match(/^\s*[VAS][.A-Z]{5}\s+(\S+)/))
		.filter(Boolean)
		.map((match) => match[1]);
}

function pills(values, className = "") {
	if (!values.length) return '<span class="muted">无</span>';
	return `<div class="pills ${className}">${values
		.map((value) => `<code>${escape(`.${value}`)}</code>`)
		.join("")}</div>`;
}

function namedPills(values) {
	if (!values.length) return '<span class="muted">无</span>';
	return `<div class="pills">${values
		.map((value) => `<code>${escape(value)}</code>`)
		.join("")}</div>`;
}

function sourceLink(path, label = path) {
	return `<a href="${escape(relative(dirname(reportPath), resolve(root, path)))}">${escape(label)}</a>`;
}

function engineLink(url, label) {
	return `<a href="${escape(url)}" rel="noopener noreferrer">${escape(label)}</a>`;
}

function table(rows, headers, className = "") {
	return `<div class="table-wrap ${className}"><table><thead><tr>${headers
		.map((header) => `<th scope="col">${header}</th>`)
		.join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function validateCatalog(catalog) {
	if (catalog.schema !== 1) throw new Error("Unsupported catalog schema");
	if (!Array.isArray(catalog.tiers) || !Array.isArray(catalog.items))
		throw new Error("Catalog must contain tiers and items");
	const tierIds = new Set();
	for (const tier of catalog.tiers) {
		for (const field of ["id", "label", "summary"]) {
			if (!tier[field] || typeof tier[field] !== "string")
				throw new Error(`Catalog tier is missing ${field}`);
		}
		if (tierIds.has(tier.id))
			throw new Error(`Duplicate catalog tier: ${tier.id}`);
		tierIds.add(tier.id);
	}
	if (tierIds.size !== 5) throw new Error("Catalog must define five tiers");
	const itemIds = new Set();
	const counts = new Map([...tierIds].map((tier) => [tier, 0]));
	for (const item of catalog.items) {
		for (const field of [
			"id",
			"tier",
			"title",
			"direction",
			"engine",
			"boundary",
			"work",
			"recommendation",
		]) {
			if (!item[field] || typeof item[field] !== "string")
				throw new Error(
					`Catalog item ${item.id ?? "unknown"} is missing ${field}`,
				);
		}
		if (!/^(?:UL|L|M|H|UH)-\d{2}$/.test(item.id))
			throw new Error(`Invalid catalog item id: ${item.id}`);
		if (!tierIds.has(item.tier))
			throw new Error(
				`Unknown catalog tier for ${item.id}: ${item.tier}`,
			);
		if (!Array.isArray(item.formats) || item.formats.length === 0)
			throw new Error(`Catalog item ${item.id} has no formats`);
		if (itemIds.has(item.id))
			throw new Error(`Duplicate catalog item: ${item.id}`);
		itemIds.add(item.id);
		counts.set(item.tier, counts.get(item.tier) + 1);
	}
	for (const [tier, count] of counts) {
		if (count === 0) throw new Error(`Catalog tier has no items: ${tier}`);
	}
	if (!Array.isArray(catalog.recommendedPacks))
		throw new Error("Catalog must contain recommended packs");
	for (const pack of catalog.recommendedPacks) {
		for (const field of ["id", "label", "why"]) {
			if (!pack[field] || typeof pack[field] !== "string")
				throw new Error(`Catalog pack is missing ${field}`);
		}
		if (!Array.isArray(pack.items) || pack.items.length === 0)
			throw new Error(`Catalog pack ${pack.id} has no items`);
		for (const id of pack.items) {
			if (!itemIds.has(id))
				throw new Error(
					`Catalog pack ${pack.id} references unknown item ${id}`,
				);
		}
	}
}

function markdownCell(value) {
	return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderCatalogMarkdown(catalog) {
	const lines = [
		"# Z8.Work 原生格式扩展选择目录",
		"",
		`核查日期：${catalog.reviewedOn}。`,
		"",
		catalog.appliesTo,
		"",
		"## 如何选择",
		"",
		"难度表示接入到当前 Z8.Work 架构所需的工程层数，不是工期承诺，也不是上游引擎的格式数量。选择某个编号后，仍要完成产品路由、输入安全、最终包依赖和六个桌面目标的真实文件验收。",
		"",
		"超低项只解决文件名兼容，不能算作新的用户格式。回复编号即可，例如 `M-01 M-02 M-06`；也可以直接选择下方组合包。",
		"",
		"## 建议组合包",
		"",
	];
	for (const pack of catalog.recommendedPacks) {
		lines.push(
			`- **${pack.label}**（${pack.items.map((id) => `\`${id}\``).join("、")}）：${pack.why}`,
		);
	}
	for (const tier of catalog.tiers) {
		const items = catalog.items.filter((item) => item.tier === tier.id);
		lines.push(
			"",
			`## ${tier.label}（${items.length} 项）`,
			"",
			tier.summary,
			"",
			"| 编号 | 格式 | 首版路线与边界 | 引擎基础 | 主要工作 | 建议 |",
			"| --- | --- | --- | --- | --- | --- |",
		);
		for (const item of items) {
			lines.push(
				`| \`${item.id}\` ${markdownCell(item.title)} | ${item.formats.map((format) => `\`${format}\``).join(" ")} | ${markdownCell(`${item.direction}。${item.boundary}`)} | ${markdownCell(item.engine)} | ${markdownCell(item.work)} | ${markdownCell(item.recommendation)} |`,
			);
		}
	}
	lines.push(
		"",
		"## 共同验收门槛",
		"",
		"1. 路由和 UI 白名单明确，不依赖引擎自动猜测扩展名。",
		"2. 最终安装包在 Linux、Windows、macOS 的 AMD64 与 ARM64 上分别验证依赖和实际转换。",
		"3. 真实文件验证格式/容器、重新解码、语义边界、取消、磁盘/保存失败与恶意或伪装输入。",
		"4. 有动画、多页、图层、多轨、专业色彩或 OCR 时，先定义保留/舍弃的用户可见行为。",
		"",
		"资料依据：`FORMAT_EXPANSION_RESEARCH.md`、`FORMAT_EXPANSION_PHASE1.md`、`FORMAT_EXPANSION_PHASE3A.md`、`FORMAT_EXPANSION_PHASE3B.md` 与 `FORMAT_SUPPORT_REPORT.html`。上游资料：[ImageMagick](https://imagemagick.org/formats/)、[FFmpeg](https://ffmpeg.org/general.html)、[Pandoc](https://pandoc.org/MANUAL.html)、[resvg](https://github.com/linebender/resvg)、[LibRaw](https://www.libraw.org/docs)、[Tesseract](https://tesseract-ocr.github.io/tessdoc/Installation.html)、[LibreOffice](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)。",
		"",
		"本文件由 `node scripts/generate-format-support-report.mjs` 从 `format-expansion-catalog.json` 生成，请修改 JSON 源文件而不是直接编辑本文件。",
	);
	return `${lines.join("\n")}\n`;
}

const [
	scope,
	magickSource,
	magickAutomated,
	ffmpegSource,
	pandocSource,
	pdfSource,
	catalog,
	engineEvidence,
] = await Promise.all([
	json("packaging/desktop/v1-scope.json"),
	read("src/lib/converters/magick.svelte.ts"),
	read("src/lib/converters/magick-automated.ts"),
	read("src/lib/converters/ffmpeg.svelte.ts"),
	read("src/lib/converters/pandoc.svelte.ts"),
	read("src/lib/util/pdf-options.ts"),
	json("docs/desktop/format-expansion-catalog.json"),
	Promise.all([
		json(
			"docs/desktop/evidence/format-research-20260913/magick-formats.json",
		),
		json(
			"docs/desktop/evidence/format-research-20260913/magick-version.json",
		),
		json(
			"docs/desktop/evidence/format-research-20260913/ffmpeg-encoders.json",
		),
		json(
			"docs/desktop/evidence/format-research-20260913/pandoc-inputs.json",
		),
		json(
			"docs/desktop/evidence/format-research-20260913/pandoc-outputs.json",
		),
	]),
]);

validateCatalog(catalog);

const [
	magickEvidence,
	magickVersion,
	ffmpegEvidence,
	pandocInputsEvidence,
	pandocOutputsEvidence,
] = engineEvidence;
const webImage = mergeFormats(
	parseFormatInfos(magickSource),
	parseFormatInfos(magickAutomated),
);
const webAudio = parseFormatInfos(ffmpegSource);
const webVideo = parseStringArray(ffmpegSource, "videoFormats").map((name) => ({
	name,
	from: true,
	to: false,
	native: false,
}));
const webMedia = mergeFormats(webAudio, webVideo);
const webDocuments = mergeFormats(parseFormatInfos(pandocSource));
const pdfOutputs = [...pdfSource.matchAll(/^\s*"\.([^"]+)":/gm)].map((match) =>
	match[1].toLowerCase(),
);
if (pdfOutputs.length !== 23)
	throw new Error(`Expected 23 PDF outputs, found ${pdfOutputs.length}`);

const desktopGroups = scope.groups.map((group) => ({
	...group,
	inputs: group.inputs.map((item) => item.toLowerCase()),
	outputs: group.outputs.map((item) => item.toLowerCase()),
}));
const desktopInputs = unique(desktopGroups.flatMap((group) => group.inputs));
const desktopOutputs = unique(desktopGroups.flatMap((group) => group.outputs));
const desktopRouteCount = desktopGroups.reduce(
	(total, group) => total + group.inputs.length * group.outputs.length,
	0,
);

const web = {
	image: {
		inputs: formatNames(webImage, "from"),
		outputs: formatNames(webImage, "to"),
	},
	media: {
		inputs: formatNames(webMedia, "from"),
		outputs: formatNames(webMedia, "to"),
	},
	documents: {
		inputs: formatNames(webDocuments, "from"),
		outputs: formatNames(webDocuments, "to"),
	},
	pdf: { inputs: ["pdf"], outputs: pdfOutputs },
};

const desktopImage = desktopGroups.find((group) => group.id === "images");
const desktopMedia = desktopGroups.find((group) => group.id === "media");
const desktopDocuments = desktopGroups.find(
	(group) => group.id === "documents",
);
const imageWebOnlyOutputs = web.image.outputs.filter(
	(item) => !desktopImage.outputs.map(canonical).includes(canonical(item)),
);
const imageWebOnlyInputs = web.image.inputs.filter(
	(item) => !desktopImage.inputs.map(canonical).includes(canonical(item)),
);
const mediaWebOnlyInputs = web.media.inputs.filter(
	(item) => !desktopMedia.inputs.map(canonical).includes(canonical(item)),
);
const documentWebOnlyInputs = web.documents.inputs.filter(
	(item) => !desktopDocuments.inputs.map(canonical).includes(canonical(item)),
);
const magickFormats = parseMagickFormats(magickEvidence.stdout);
const ffmpegEncoders = parseFfmpegEncoders(ffmpegEvidence.stdout);
const pandocInputs = pandocInputsEvidence.stdout
	.trim()
	.split("\n")
	.filter(Boolean);
const pandocOutputs = pandocOutputsEvidence.stdout
	.trim()
	.split("\n")
	.filter(Boolean);
const magickVersionLine =
	magickVersion.stdout.trim().split("\n")[0] || "未记录";

const desktopRows = desktopGroups.map((group) => {
	const readableOutputs = group.outputs.map(
		(item) => `.${outputFileExtension(item)}`,
	);
	const verification =
		group.id === "images" || group.id === "pdf"
			? "图片/PDF 路线有独立的像素、文件头和重新解码校验"
			: group.id === "media"
				? "音频路线校验容器、编解码器、时长和声道"
				: "文档仅验证 UTF-8 纯文本；不承诺排版保真";
	return `<tr data-search="${escape(
		[...group.inputs, ...group.outputs, ...group.engines].join(" "),
	)}"><th scope="row">${escape(group.id)}</th><td>${pills(group.inputs)}</td><td>${pills(readableOutputs.map((item) => item.slice(1)))}</td><td>${namedPills(
		group.engines,
	)}</td><td>${escape(verification)}</td></tr>`;
});

const webRows = [
	{
		name: "图片（ImageMagick WASM）",
		inputs: web.image.inputs,
		outputs: web.image.outputs,
		note: "静态声明；SVG 会先走专用栅格化路径。每个输入/输出组合仍由转换器方向与运行时编码器决定。",
	},
	{
		name: "PDF → 栅格图片（MuPDF WASM + 图像编码器）",
		inputs: web.pdf.inputs,
		outputs: web.pdf.outputs,
		note: "PDF 输入只有 .pdf；23 个输出扩展含 JPG/JPEG 和 TIF/TIFF 两组别名。",
	},
	{
		name: "音频/视频 → 音频（FFmpeg WASM）",
		inputs: web.media.inputs,
		outputs: web.media.outputs,
		note: "视频格式在此版本只作为音频提取输入，不构成网页视频输出能力。",
	},
	{
		name: "文档（Pandoc WASM）",
		inputs: web.documents.inputs,
		outputs: web.documents.outputs,
		note: "声明的是网页转换器白名单；其中 JSON 必须是 Pandoc JSON。",
	},
].map(
	(row) =>
		`<tr data-search="${escape(
			[row.name, ...row.inputs, ...row.outputs].join(" "),
		)}"><th scope="row">${escape(row.name)}</th><td><strong>${row.inputs.length}</strong>${pills(
			row.inputs,
		)}</td><td><strong>${row.outputs.length}</strong>${pills(
			row.outputs,
		)}</td><td>${escape(row.note)}</td></tr>`,
);

const whyRows = [
	{
		family: "网页已开放、桌面仍未开放的图片输出",
		formats: "JP2/J2K、PSD、DDS 等；完整差集见下方。",
		component:
			"ImageMagick 官方可支持的范围很广，但实际可读写项目取决于编译 delegate、coder 模块和包内库。",
		web: "网页图片和/或 PDF 输出白名单中存在许多这些格式。",
		desktop:
			"桌面源码范围已包含 GIF、JXL、TIFF/TIF、ICO、PCX、PNM/PBM/PGM/PPM、HEIC/HEIF 等；JP2/J2K、PSD、DDS 尚未纳入。",
		why: "产品范围不会因为原生引擎列出了 coder 就自动扩大。新增路线仍要在各目标最终包中验证编码、重新解码、颜色/alpha、元数据、多页或多帧语义和保存失败处理。",
		next: "仍可逐格式扩展；先补齐模块、固定编码参数和逐平台验收。",
	},
	{
		family: "HEIC/HEIF 输出",
		formats: "HEIC、HEIF",
		component:
			"ImageMagick 的 HEIC delegate 可以是读写能力，且具体编码插件、版本与参数会影响结果。",
		web: "网页白名单把 HEIC/HEIF 标为输入，不标为输出。",
		desktop:
			"桌面源码范围已定义 HEIC/HEIF 输出为 HEVC、有损、8-bit SDR 的同一兼容档位；具体安装包仍须通过随包编码器与读回验收后才显示。",
		why: "可解码 HEIC 不等于每个平台都具备可发布的编码器。路线固定了色彩、位深和 alpha 的降级语义，仍需分别验证真实文件与包内插件闭包。",
		next: "在每个目标包通过 HEIF 编码/读回和许可证复核前，不扩展其公开 profile。",
	},
	{
		family: "SVG、EPS/PS 与相机 RAW",
		formats: "SVG、EPS、PS、ARW、CR2、DNG、NEF、RAF、ORF、RW2 等",
		component:
			"需要 SVG 渲染器、字体/外部资源策略，或 LibRaw/相机 vendor delegate；ImageMagick 的格式表不是对所有包的承诺。",
		web: "网页声明部分 SVG、EPS/PS 或 RAW 为输入/输出，但其中多项只读或有专用前处理。",
		desktop:
			"桌面源码范围支持受限的静态 SVG 输入；EPS/PS 与相机 RAW 仍没有产品路线。",
		why: "它们不是简单的像素重编码：静态 SVG 仍须限制字体、脚本和外部资源，RAW 则涉及相机型号、显影和色彩配置。EPS/PS、RAW 没有对应的产品路线与质量合同。",
		next: "需要专用引擎和独立安全/保真验收。",
	},
	{
		family: "动画、多页和多尺寸图像",
		formats: "GIF/APNG/动画 WebP、TIFF 多页、ICO 多尺寸、PSD 图层等",
		component:
			"图像库能列出读写，不表示保留帧时长、循环、页序、图层或图标尺寸。",
		web: "网页某些扩展可选，但产品仍需按具体转换器处理。",
		desktop:
			"桌面普通图片按首帧处理；PDF 是唯一具有逐页恢复语义的多页路线。",
		why: "若默认只取第一帧/第一页却称为完整格式转换，会造成数据语义丢失。需要定义帧/页/图层策略和资源上限，并做专门回归。",
		next: "产品设计与验收后再开放。",
	},
	{
		family: "更多音频/视频容器，以及视频输出",
		formats:
			"AAC、WMA、AMR、AU、CAF、AVI、TS/MTS、MPEG、FLV、3GP、MXF 等；MP4/WebM/MKV → 视频输出亦在此列。",
		component:
			"FFmpeg 的 demuxer/muxer 与 encoder 列表远大于产品路线；容器、codec、字幕、多音轨、HDR 和硬件加速是不同维度。",
		web: "网页列出更多媒体输入，但当前只把它们转/提取为音频，不提供视频输出。",
		desktop:
			"桌面源码范围接收 24 个媒体扩展、输出 9 个音频格式；MP4/MOV/MKV/WebM 仅取第一条音轨。",
		why: "扩展名不够判断可转换性。当前实现明确限定 demuxer、只映射第一条音轨，并验证指定 codec/容器；视频输出会新增预设、流选择、字幕/旋转/色彩、磁盘预算与硬件回退责任。",
		next: "更多音频容器可逐项扩展；视频输出是独立功能阶段。",
	},
	{
		family: "富文本文档输出与额外文档输入",
		formats:
			"DOC、RTF、CSV、TSV、Pandoc JSON、RST、DocBook，以及 DOCX/ODT/EPUB/HTML → DOCX/HTML/EPUB/PDF 等",
		component:
			"Pandoc 有大量 reader/writer；PDF writer 还需要实际 PDF 排版引擎，不能只看 writer 列表。",
		web: "网页 Pandoc 白名单开放 12 个输入/输出名称。",
		desktop:
			"桌面源码范围接收 TXT/TEXT、Markdown 别名、RST、DOCX、HTML/HTM、ODT、EPUB、CSV/TSV、DocBook、Org，并且只输出 UTF-8 TXT。",
		why: "桌面合同明确选择文本提取，不保留图片、字体、分页、布局或复杂表格。RTF 曾在验收中出现正文顺序问题，因此被明确移出桌面路线；这类路线不能因能生成文件就算支持。",
		next: "结构化文档可逐路线扩展；排版保真与 PDF 输出需单独引擎/测试。",
	},
	{
		family: "电子表格、演示文稿与 OCR",
		formats: "XLS、XLSX、ODS、PPT、PPTX；扫描 PDF/图片 → 可搜索文本",
		component:
			"现有 Pandoc/MuPDF/ImageMagick/FFmpeg 组合不是完整 Office 或 OCR 引擎。",
		web: "当前网页没有 XLS/XLSX/ODS/PPT/PPTX 或 OCR 路线。",
		desktop: "当前桌面也没有；Rust 测试明确断言 XLSX 没有输出路线。",
		why: "工作簿包含多工作表、公式、图表和打印区域，不能把 XLSX → CSV 当成保真转换。OCR 还需要语言模型、识别准确度、隐私/包体积和平台分发策略。",
		next: "需要新增 LibreOffice/专门表格引擎或 Tesseract 等专用组件，并单独做发行审核。",
	},
].map(
	(row) =>
		`<tr data-search="${escape(
			Object.values(row).join(" "),
		)}"><th scope="row">${escape(row.family)}</th><td>${escape(
			row.formats,
		)}</td><td>${escape(row.component)}</td><td>${escape(
			row.web,
		)}</td><td>${escape(row.desktop)}</td><td>${escape(
			row.why,
		)}</td><td>${escape(row.next)}</td></tr>`,
);

const catalogItemById = new Map(catalog.items.map((item) => [item.id, item]));
const catalogTierSections = catalog.tiers.map((tier) => {
	const items = catalog.items.filter((item) => item.tier === tier.id);
	const rows = items.map(
		(item) =>
			`<tr data-search="${escape(
				[
					item.id,
					item.title,
					...item.formats,
					item.direction,
					item.engine,
					item.boundary,
					item.work,
					item.recommendation,
				].join(" "),
			)}"><th scope="row"><code>${escape(item.id)}</code><br><span class="catalog-title">${escape(
				item.title,
			)}</span></th><td>${namedPills(item.formats)}</td><td><strong>${escape(
				item.direction,
			)}</strong><p class="small">${escape(item.boundary)}</p></td><td>${escape(
				item.engine,
			)}</td><td>${escape(item.work)}</td><td>${escape(
				item.recommendation,
			)}</td></tr>`,
	);
	return `<details class="catalog-tier" data-catalog-tier${tier.id === "medium" ? " open" : ""}><summary><span class="tier-badge tier-${escape(
		tier.id,
	)}">${escape(tier.label)}</span> ${escape(tier.summary)} <span class="muted">（${items.length} 项）</span></summary><div class="details-content">${table(
		rows,
		[
			"编号 / 能力",
			"格式",
			"首版路线与边界",
			"已有基础",
			"主要工作",
			"建议",
		],
		"catalog-table",
	)}</div></details>`;
});
const catalogPackCards = catalog.recommendedPacks
	.map(
		(pack) =>
			`<article class="catalog-pack"><h3>${escape(pack.label)}</h3><p>${pack.items
				.map((id) => {
					const item = catalogItemById.get(id);
					return `<code title="${escape(item.title)}">${escape(id)}</code>`;
				})
				.join(" ")}</p><p>${escape(pack.why)}</p></article>`,
	)
	.join("");

const magickRows = magickFormats.map(
	(item) =>
		`<tr><th scope="row"><code>${escape(item.tag)}</code></th><td><code>${escape(
			item.module,
		)}</code></td><td><code>${escape(item.mode)}</code></td><td>${escape(
			item.description,
		)}</td></tr>`,
);

const routeSourceDigest = createHash("sha256")
	.update(
		[
			JSON.stringify(scope),
			magickSource,
			magickAutomated,
			ffmpegSource,
			pandocSource,
			pdfSource,
			JSON.stringify(catalog),
		].join("\0"),
	)
	.digest("hex")
	.slice(0, 12);
const sourcePaths = [
	["packaging/desktop/v1-scope.json", "桌面产品范围"],
	["src-tauri/native/src/formats.rs", "Rust 路由读取范围"],
	["src-tauri/native/src/convert.rs", "桌面转换实现与输出枚举"],
	["desktop/src/platform/queue-contract.ts", "桌面前端契约"],
	["src/lib/converters/magick.svelte.ts", "网页图像转换器"],
	["src/lib/converters/ffmpeg.svelte.ts", "网页媒体转换器"],
	["src/lib/converters/pandoc.svelte.ts", "网页文档转换器"],
	["src/lib/util/pdf-options.ts", "网页 PDF 23 输出"],
	["docs/desktop/format-expansion-catalog.json", "格式扩展选择目录源数据"],
	["docs/desktop/FORMAT_EXPANSION_CATALOG.md", "格式扩展选择目录"],
	["docs/desktop/FORMAT_EXPANSION_RESEARCH.md", "已有原生格式调研"],
	["docs/desktop/FORMAT_EXPANSION_PHASE3B.md", "桌面音频扩展验收"],
];

const html = `<!doctype html>
<html lang="zh-Hans">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Z8.Work 格式能力对照报告</title>
  <style>
    :root { color-scheme: light dark; --bg:#f7f5ef; --surface:#fffdf8; --ink:#1d2930; --muted:#5d6c73; --line:#d9d6cd; --accent:#05668d; --green:#0d7a54; --amber:#a85f00; --red:#a33b35; --code:#edf4f6; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.55; }
    main { max-width:1500px; margin:0 auto; padding:36px clamp(16px,4vw,56px) 72px; }
    header { border-bottom:4px solid var(--ink); padding-bottom:24px; margin-bottom:28px; }
    .eyebrow { margin:0 0 8px; color:var(--accent); font-weight:800; font-size:.78rem; letter-spacing:.12em; text-transform:uppercase; }
    h1 { font-size:clamp(2rem,5vw,4.25rem); line-height:.96; letter-spacing:-.055em; max-width:15ch; margin:0; }
    h2 { font-size:clamp(1.45rem,2.8vw,2.25rem); letter-spacing:-.035em; line-height:1.1; margin:0 0 12px; }
    h3 { font-size:1.05rem; margin:0 0 8px; }
    p { max-width:100ch; }
    a { color:var(--accent); text-decoration-thickness:1.5px; text-underline-offset:3px; }
    .meta { display:flex; flex-wrap:wrap; gap:8px 18px; margin-top:20px; color:var(--muted); font-size:.9rem; }
    .meta strong { color:var(--ink); }
    .callout { border-left:5px solid var(--accent); background:color-mix(in srgb, var(--accent) 8%, var(--surface)); padding:16px 18px; margin:22px 0; }
    .callout strong { display:block; margin-bottom:4px; }
    .warning { border-left-color:var(--amber); background:color-mix(in srgb, var(--amber) 9%, var(--surface)); }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; margin:18px 0 32px; }
    .card { background:var(--surface); border:1px solid var(--line); padding:16px; border-radius:10px; }
    .card .number { display:block; font-size:2rem; line-height:1; letter-spacing:-.06em; font-weight:800; color:var(--accent); margin:5px 0 8px; }
    .card p { margin:0; color:var(--muted); font-size:.9rem; }
    section { margin-top:46px; scroll-margin-top:20px; }
    .legend { display:flex; flex-wrap:wrap; gap:8px; padding:0; list-style:none; }
    .legend li { border:1px solid var(--line); border-radius:999px; padding:4px 9px; font-size:.84rem; background:var(--surface); }
    .legend .product { border-color:var(--green); color:var(--green); }
    .legend .component { border-color:var(--accent); color:var(--accent); }
    .legend .missing { border-color:var(--amber); color:var(--amber); }
    .search { width:min(100%,640px); padding:11px 13px; border-radius:8px; border:1px solid var(--line); background:var(--surface); color:var(--ink); font:inherit; margin:10px 0 14px; }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-radius:10px; background:var(--surface); }
    table { width:100%; border-collapse:collapse; min-width:850px; font-size:.9rem; }
    th, td { padding:12px; text-align:left; vertical-align:top; border-bottom:1px solid var(--line); }
    thead th { position:sticky; top:0; background:var(--ink); color:#fff; z-index:1; font-size:.8rem; letter-spacing:.03em; }
    tbody tr:last-child > * { border-bottom:0; }
    tbody tr:hover { background:color-mix(in srgb, var(--accent) 5%, var(--surface)); }
    th[scope="row"] { min-width:135px; font-weight:750; }
    code { background:var(--code); border:1px solid color-mix(in srgb, var(--accent) 15%, var(--line)); border-radius:4px; color:inherit; padding:1px 4px; font: .82em ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space:nowrap; }
    .pills { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; min-width:210px; }
    .pills code { font-size:.74rem; }
    .muted, .small { color:var(--muted); }
    .small { font-size:.86rem; }
    details { border:1px solid var(--line); background:var(--surface); border-radius:10px; padding:0 14px; margin:16px 0; }
    summary { cursor:pointer; padding:13px 2px; font-weight:750; }
    details[open] summary { border-bottom:1px solid var(--line); margin-bottom:13px; }
    .details-content { padding-bottom:14px; }
    .catalog-packs { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; margin:18px 0; }
    .catalog-pack { border:1px solid var(--line); border-top:4px solid var(--accent); border-radius:10px; background:var(--surface); padding:14px; }
    .catalog-pack h3 { margin:0; color:var(--accent); }
    .catalog-pack p { margin:8px 0 0; color:var(--muted); font-size:.88rem; }
    .catalog-pack p + p { color:var(--ink); }
    .catalog-tier { margin:12px 0; }
    .catalog-tier summary { display:flex; align-items:center; gap:8px; }
    .tier-badge { display:inline-block; border:1px solid currentColor; border-radius:999px; padding:2px 8px; font-size:.78rem; line-height:1.2; white-space:nowrap; }
    .tier-ultra-low { color:var(--muted); }
    .tier-low { color:var(--green); }
    .tier-medium { color:var(--accent); }
    .tier-high { color:var(--amber); }
    .tier-ultra-high { color:var(--red); }
    .catalog-title { display:inline-block; margin-top:6px; min-width:135px; }
    .catalog-table table { min-width:1180px; }
    .catalog-table td p { margin:7px 0 0; }
    .comparison { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .comparison article { border:1px solid var(--line); background:var(--surface); border-radius:10px; padding:15px; }
    .comparison h3 { color:var(--accent); }
    .comparison p { font-size:.88rem; color:var(--muted); }
    .difference { columns:2 16rem; column-gap:22px; }
    .difference code { display:inline-block; margin:2px; }
    footer { margin-top:54px; border-top:1px solid var(--line); padding-top:18px; color:var(--muted); font-size:.86rem; }
    @media (max-width:780px) { main { padding-top:24px; } .comparison { grid-template-columns:1fr; } h1 { max-width:none; } }
    @media (prefers-color-scheme:dark) { :root { --bg:#13191d; --surface:#1b252b; --ink:#edf3f3; --muted:#b3c0c4; --line:#344249; --accent:#75c8e8; --green:#6fdaac; --amber:#f1b665; --red:#f08a82; --code:#26343a; } }
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Z8.Work · 格式能力对照</p>
    <h1>组件能做什么，产品实际开放什么</h1>
    <p>这份报告把三个层级分开：上游转换组件的能力、当前网页端公开路线、桌面源码范围与各安装包已验收路线。它回答“为什么桌面版比网页少”，同时避免把某个引擎的格式清单误写成 Z8.Work 已经支持的功能。</p>
    <div class="meta"><span>核对日期：<strong>${reportDate}</strong></span><span>路线来源摘要：<strong>${escape(routeSourceDigest)}</strong></span><span>桌面源码路线：<strong>${desktopInputs.length} 个输入扩展 / ${desktopOutputs.length} 个输出格式 / ${desktopRouteCount} 条声明路线</strong></span></div>
  </header>

  <div class="callout">
    <strong>结论</strong>
    桌面版不是“原生引擎只能处理少数格式”。它故意只公开已接入、已定义语义、可在目标平台包中验证的路线。引擎能够列出一个 coder、decoder 或 writer，只说明可能具备入口；它不自动解决容器/codec 组合、图层或多帧取舍、颜色与元数据、依赖封装、跨平台签名和真实文件验收。
  </div>
  <ul class="legend"><li class="component">组件能力：引擎/官方文档或本地清单</li><li class="product">产品路线：当前源码明确允许</li><li class="missing">未开放：可能是产品范围、打包依赖或缺少专用引擎</li></ul>

  <div class="grid">
    <article class="card"><strong>网页图片</strong><span class="number">${web.image.inputs.length} → ${web.image.outputs.length}</span><p>静态源码白名单中的输入 / 输出名称。</p></article>
    <article class="card"><strong>网页 PDF</strong><span class="number">1 → ${web.pdf.outputs.length}</span><p>.pdf 输入可导出 ${web.pdf.outputs.length} 个栅格扩展名；包含别名。</p></article>
    <article class="card"><strong>网页媒体</strong><span class="number">${web.media.inputs.length} → ${web.media.outputs.length}</span><p>视频只作为音频提取输入，不代表网页视频输出。</p></article>
    <article class="card"><strong>桌面源码范围</strong><span class="number">${desktopInputs.length} → ${desktopOutputs.length}</span><p>${desktopRouteCount} 条声明路线，来自统一范围文件。</p></article>
  </div>

  <section id="matrix">
    <h2>一览：三个层级</h2>
    <div class="comparison">
      <article><h3>上游组件</h3><p>ImageMagick、FFmpeg、Pandoc、MuPDF 的能力会随编译选项和操作系统变化。组件可以有很多格式入口，但不等于应用安全、完整地提供此转换。</p></article>
      <article><h3>网页版本</h3><p>由 Svelte/WASM 转换器的 <code>FormatInfo</code> 白名单决定；输入与输出方向分开声明，具体组合还需经过网页转换器的方向判断。</p></article>
      <article><h3>桌面版本</h3><p>由 <code>v1-scope.json</code> 驱动 Rust 路由和前端契约。未知扩展会被拒绝，而不是尝试让引擎猜测。</p></article>
    </div>
  </section>

  <section id="desktop">
    <h2>桌面源码范围当前定义的格式</h2>
    <p>下表是当前桌面源码合同，不是计划，也不是原生命令行工具的完整能力。<code>jpeg</code> 的实际文件扩展名为 <code>.jpg</code>。</p>
    <p class="small">当前源码范围的 ${desktopRouteCount} 条路线必须逐一经过最终包验收；历史下载包不会自动升级。实际用户可见路线以安装包随附的已签署 acceptance list 为准，并按版本、平台与架构分别核对。${sourceLink("docs/desktop/FORMAT_EXPANSION_PHASE3B.md", "查看历史音频扩展验收记录")}</p>
    ${table(desktopRows, ["类别", "可导入扩展名", "可输出扩展名", "所用原生引擎", "验证语义"])}
    <div class="callout warning"><strong>桌面包的边界</strong>PDF 最多 200 页；普通图片只处理首帧。文档输出是纯文本，视频输入只提取第一条音轨。JPEG/BMP 透明区域会填白；BMP/TGA/QOI 为 8 位 sRGB，且不保留元数据或 ICC 配置。格式名称相同不代表结果一定无损或一定更小。</div>
  </section>

  <section id="catalog">
    <h2>扩展格式选择目录</h2>
    <p>以下 ${catalog.items.length} 项按照<strong>接入当前桌面架构的难度</strong>分组。难度不是工期承诺，也不是上游组件格式数量：它综合了现有代码路径、包内依赖、安全策略、用户可见语义和六个平台最终包验收。${escape(catalog.appliesTo)}</p>
    <p class="small">组件资料：${engineLink("https://imagemagick.org/formats/", "ImageMagick")} · ${engineLink("https://ffmpeg.org/general.html", "FFmpeg")} · ${engineLink("https://pandoc.org/MANUAL.html", "Pandoc")} · ${engineLink("https://github.com/linebender/resvg", "resvg")} · ${engineLink("https://www.libraw.org/docs", "LibRaw")} · ${engineLink("https://tesseract-ocr.github.io/tessdoc/Installation.html", "Tesseract")} · ${engineLink("https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html", "LibreOffice")}</p>
    <div class="callout"><strong>选择方式</strong>回复编号即可，例如 <code>M-01 M-02 M-06</code>；也可以直接选择一个组合包。每个编号都写明首版会保留什么、会舍弃什么，避免把“能生成同名文件”当成格式支持。</div>
    <h3>建议组合包</h3>
    <div class="catalog-packs">${catalogPackCards}</div>
    <input class="search" type="search" placeholder="筛选候选，例如 tiff、ocr、视频、M-06" data-catalog-search>
    <p class="small">超低项仅是扩展名兼容，不计为新增格式。每一个低及以上的候选都需要显式路线、真实输入样本、输出读回，以及 Linux、Windows、macOS 的 AMD64/ARM64 最终包验证。</p>
    ${catalogTierSections.join("\n")}
    <p class="small">可阅读版本：${sourceLink("docs/desktop/FORMAT_EXPANSION_CATALOG.md", "Markdown 选择目录")}；可维护源：${sourceLink("docs/desktop/format-expansion-catalog.json", "JSON 目录数据")}。</p>
  </section>

  <section id="web">
    <h2>网页版本当前公开的格式白名单</h2>
    <p>输入和输出是独立方向。这里展示的是代码声明，不把“某个 WASM 组件理论可用”加进列表。PDF 的 ${web.pdf.outputs.length} 个输出也单独列出。</p>
    <input class="search" type="search" placeholder="筛选网页格式，例如 avif、xlsx、video" data-filter=".web-format-table">
    ${table(webRows, ["网页转换器", "输入", "输出", "边界"], "web-format-table")}
    <details><summary>查看网页图片的完整输入 / 输出列表</summary><div class="details-content"><h3>输入（${web.image.inputs.length}）</h3>${pills(web.image.inputs)}<h3>输出（${web.image.outputs.length}）</h3>${pills(web.image.outputs)}</div></details>
    <details><summary>查看网页媒体的完整输入 / 输出列表</summary><div class="details-content"><h3>输入（${web.media.inputs.length}）</h3>${pills(web.media.inputs)}<h3>输出（${web.media.outputs.length}）</h3>${pills(web.media.outputs)}</div></details>
    <details><summary>查看网页文档的完整输入 / 输出列表</summary><div class="details-content"><h3>输入（${web.documents.inputs.length}）</h3>${pills(web.documents.inputs)}<h3>输出（${web.documents.outputs.length}）</h3>${pills(web.documents.outputs)}</div></details>
    <details><summary>查看网页 PDF 的全部 ${web.pdf.outputs.length} 个图片输出</summary><div class="details-content">${pills(web.pdf.outputs)}</div></details>
  </section>

  <section id="why">
    <h2>为什么这些格式尚未对全部桌面包开放</h2>
    <p>“尚未开放”表示当前桌面源码或某个最终安装包没有授权该路线。原因分为：尚未接入并验收、包内依赖/模块没有跨平台保证，或现有组件根本不负责这一类任务。</p>
    <input class="search" type="search" placeholder="筛选限制原因，例如 TIFF、XLSX、OCR、视频" data-filter=".why-table">
    ${table(whyRows, ["格式族", "典型格式", "组件层面", "网页现状", "桌面现状", "为何不开放", "下一步"], "why-table")}

    <details><summary>网页图片输出中、桌面图片输出中没有的全部名称（${imageWebOnlyOutputs.length}）</summary><div class="details-content"><p class="small">其中有编码器别名、伪格式和专业格式。它们不应以“名称数量”替代产品支持数量。</p><div class="difference">${imageWebOnlyOutputs.map((item) => `<code>.${escape(item)}</code>`).join("")}</div></div></details>
    <details><summary>网页可读、桌面图片输入中没有的全部名称（${imageWebOnlyInputs.length}）</summary><div class="details-content"><div class="difference">${imageWebOnlyInputs.map((item) => `<code>.${escape(item)}</code>`).join("")}</div></div></details>
    <details><summary>网页可读、桌面媒体输入中没有的全部名称（${mediaWebOnlyInputs.length}）</summary><div class="details-content"><div class="difference">${mediaWebOnlyInputs.map((item) => `<code>.${escape(item)}</code>`).join("")}</div></div></details>
    <details><summary>网页可读、桌面文档输入中没有的全部名称（${documentWebOnlyInputs.length}）</summary><div class="details-content"><div class="difference">${documentWebOnlyInputs.map((item) => `<code>.${escape(item)}</code>`).join("")}</div></div></details>
  </section>

  <section id="components">
    <h2>上游组件的证据与完整清单</h2>
    <p>下列“组件能力”不等于产品支持。ImageMagick 和 FFmpeg 都是按构建配置加载可选模块；Pandoc 的 PDF writer 也不代表打包了 PDF 排版引擎。官网清单用于了解上限，本项目归档清单用于追溯一次受控 Linux ARM64 引擎探测。</p>
    ${table(
		[
			`<tr><th scope="row">ImageMagick</th><td>${escape(magickVersionLine)}</td><td>图片 coder 的读写模式取决于模块/委托库。</td><td>${engineLink("https://imagemagick.org/formats/", "官方格式表")}；${sourceLink("docs/desktop/evidence/format-research-20260913/magick-formats.json", "归档 Linux ARM64 清单")}</td></tr>`,
			`<tr><th scope="row">FFmpeg</th><td>归档清单列出 ${ffmpegEncoders.length} 个 encoder 名称。</td><td>容器（muxer/demuxer）、codec（encoder/decoder）和硬件能力必须分别判断。</td><td>${engineLink("https://ffmpeg.org/general.html", "官方格式/codec 说明")}；${sourceLink("docs/desktop/evidence/format-research-20260913/ffmpeg-encoders.json", "归档 encoder 清单")}</td></tr>`,
			`<tr><th scope="row">Pandoc</th><td>归档清单：${pandocInputs.length} 个 reader，${pandocOutputs.length} 个 writer。</td><td>结构化转换并不保证页面布局、复杂表格或字体完全保留。</td><td>${engineLink("https://pandoc.org/MANUAL.html", "Pandoc 手册")}；${sourceLink("docs/desktop/evidence/format-research-20260913/pandoc-inputs.json", "归档输入清单")}</td></tr>`,
			`<tr><th scope="row">MuPDF</th><td>桌面产品只把它用于 PDF 渲染。</td><td>官方列出的输入包括 PDF、EPUB、常见图片、SVG、CBZ、XPS；输出包括 PDF、文本、HTML、PostScript、PNG、SVG、PNM/PAM。</td><td>${engineLink("https://mupdf.com/", "MuPDF 官方文档")}</td></tr>`,
		],
		["组件", "本项目可追溯证据", "正确解释", "来源"],
	)}
    <details><summary>ImageMagick 归档构建的格式清单（${magickFormats.length} 条 coder 行）</summary><div class="details-content"><p class="small">这是 2026-09-13 归档的 Linux ARM64 引擎发现结果，非所有平台发布包的保证。<code>r</code> 表示可读，<code>w</code> 表示可写，<code>+</code> 表示多图像支持。</p>${table(magickRows, ["Tag", "模块", "模式", "描述"], "engine-table")}</div></details>
    <details><summary>FFmpeg 归档构建的 encoder 名称（${ffmpegEncoders.length}）</summary><div class="details-content"><p class="small">这是 encoder，不是“文件扩展名列表”，也不是所有可输入容器。实际产品仍需决定 muxer、codec、流选择与参数。</p>${namedPills(ffmpegEncoders)}</div></details>
    <details><summary>Pandoc 归档 reader / writer 名称</summary><div class="details-content"><h3>Reader（${pandocInputs.length}）</h3>${namedPills(pandocInputs)}<h3>Writer（${pandocOutputs.length}）</h3>${namedPills(pandocOutputs)}</div></details>
  </section>

  <section id="method">
    <h2>判定方法和报告限制</h2>
    <ol>
      <li><strong>先看产品路线。</strong>桌面以统一范围文件为准；网页以各个转换器的 <code>FormatInfo</code> 为准。两者都不是“按照扩展名盲猜引擎”。</li>
      <li><strong>再看引擎可用性。</strong>ImageMagick 的 coder、FFmpeg 的 muxer/demuxer/codec、Pandoc 的 reader/writer 以及附属动态库都可能按平台不同。</li>
      <li><strong>最后看真实验收。</strong>新增路线至少应验证真实文件头/容器、重新解码、像素或音频语义、取消、磁盘不足、保存失败与各系统/架构的最终包。退出码为零或生成同名文件不够。</li>
    </ol>
    <div class="callout warning"><strong>不要把“格式数”当成能力指标</strong>JPG/JPEG、TIF/TIFF、AIF/AIFF 是别名；ImageMagick 的伪格式也不是用户可上传文件；FFmpeg 的一个容器可装多种 codec。报告把这些列出来是为了可追溯，不把它们夸大成独立用户功能。</div>
  </section>

  <footer>
    <p>源码依据：${sourcePaths.map(([path, label]) => sourceLink(path, label)).join(" · ")}</p>
    <p>生成命令：<code>node scripts/generate-format-support-report.mjs</code>。该报告为离线 HTML，不会读取用户文件或发起网络请求；外部链接只在用户主动打开时访问。</p>
  </footer>
</main>
<script>
  for (const input of document.querySelectorAll('[data-filter]')) {
    const table = document.querySelector(input.dataset.filter);
    if (!table) continue;
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      for (const row of table.querySelectorAll('tbody tr')) {
        row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query);
      }
    });
  }
  const catalogSearch = document.querySelector('[data-catalog-search]');
  if (catalogSearch) {
    const filterCatalog = () => {
      const query = catalogSearch.value.trim().toLowerCase();
      for (const tier of document.querySelectorAll('[data-catalog-tier]')) {
        let visible = false;
        for (const row of tier.querySelectorAll('tbody tr[data-search]')) {
          const matches = !query || row.textContent.toLowerCase().includes(query);
          row.hidden = !matches;
          visible ||= matches;
        }
        tier.hidden = Boolean(query) && !visible;
        if (query && visible && !tier.open) {
          tier.open = true;
          tier.dataset.openedBySearch = "true";
        }
        if (!query && tier.dataset.openedBySearch === "true") {
          tier.open = false;
          delete tier.dataset.openedBySearch;
        }
      }
    };
    catalogSearch.addEventListener('input', filterCatalog);
  }
</script>
</body>
</html>
`;

await mkdir(dirname(reportPath), { recursive: true });
const prettierOptions = (await prettier.resolveConfig(reportPath)) ?? {};
await writeFile(
	reportPath,
	await prettier.format(html, { ...prettierOptions, filepath: reportPath }),
);
await writeFile(
	catalogMarkdownPath,
	await prettier.format(renderCatalogMarkdown(catalog), {
		...prettierOptions,
		filepath: catalogMarkdownPath,
	}),
);
console.log(`Wrote ${relative(root, reportPath)}`);
console.log(`Wrote ${relative(root, catalogMarkdownPath)}`);
