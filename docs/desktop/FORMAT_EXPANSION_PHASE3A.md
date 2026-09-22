# 原生格式扩展第三步 A：文档输入补齐

日期：2026-09-13。承接 [图片扩展](FORMAT_EXPANSION_PHASE2.md) 与 [调研顺序](FORMAT_EXPANSION_RESEARCH.md)。这是第三步“文档与音频”的文档输入子批次，音频新编码和富文本输出尚未开发。

## 交付范围

新增 HTML（含 HTM 别名）、ODT、EPUB → UTF-8 TXT。复用已有 Pandoc，不新增下载、引擎或运行权限。共享范围现在为 27 个输入扩展名、13 个输出格式、133 条路线；扩展名别名不代表独立文件格式。

仅提取正文、标题、列表和可表示为文本的表格内容。图片、HTML 脚本节点、字体、分页和页面布局不保留；不执行脚本，但正文中的代码示例仍可能作为普通文本保留；不提供 OCR、DRM 解密、电子表格转换或文档排版保真。EPUB 章节按文档阅读顺序提取。验收样本不代表所有 Word/LibreOffice/电子书厂商的复杂文档都无损支持。

## 实现与 review

- 根据已授权输入选择显式 Pandoc reader，HTML/HTM 使用 `html+raw_html`；不再让非 DOCX 输入一律回退 Markdown。所有转换继续传 `--sandbox`，参数不经过 shell，不允许用户提供 reader、过滤器或资源目录。
- 官方手册指出 HTML iframe 可能读取本地或远端资源；使用 sandbox 与 raw HTML reader 扩展限制该行为，纯文本 writer 丢弃原始 HTML。[Pandoc 手册](https://pandoc.org/MANUAL.html)（2026-09-13 核对）。
- 原有私有工作目录、文件句柄授权、512 MiB 输入上限、120 秒任务期限、进程树取消、原子保存和重名保护继续适用。
- 在批量设置与文件任务内提前说明纯文本限制；不显示图片质量、EXIF 或 PDF DPI 控件。父组件原本已排除文档的图片选项，本轮实际修复是接入新的限制提示，不能说旧界面已出现错误的图片控件。首页示例与双语商店/支持页面草稿同步新格式。
- 图片与文档浏览器检查接入已有 desktop CI 的 frontend job，使用锁定依赖提供的 Playwright 安装 Chromium，避免仅留下手工运行脚本。
- 完整质量矩阵合并原有 84 条、图片扩展 45 条、文档扩展 4 条，逐条核对共享范围。JS 门禁要求文档报告，旧 129 条报告不能代替新范围验收。
- Review 修正验收工具的权限边界：宿主机独立文档验收监听回环地址检测资源请求，包内 `--quality` 不监听端口、不要求 Snap 添加 network-bind。后者明确记录网络探针 `not-run`，不是网络检查通过。六平台宿主机审计门禁要求实际探针 `passed` 且请求数为 0。

## 验证方式

真实文件检查通过生产 `convert` 路径。HTML/ODT/EPUB 样本由确定的 Markdown 正文生成，包含中文、多语种字符、列表、表格及两个章节；HTML 外部资源负例单独手工构造。检查 UTF-8、关键内容顺序、源文件哈希不变、重复保存不覆盖、预取消、损坏 ODT/EPUB 拒绝，以及 HTML 脚本和本地外部文件内容未进入结果。宿主机 HTTP 探针检查 iframe、图片、样式和脚本引用。

- `Z8_DEV_ENGINE_MANIFEST=... cargo run --locked --release --manifest-path src-tauri/Cargo.toml -p z8-native --features development-engines --bin smoke -- --document-expansion`
- `bundle-check ENGINE_DIRECTORY --document-expansion`：在宿主机使用固定包内引擎，包含 HTTP 探针。
- `bundle-check ENGINE_DIRECTORY --quality`：完整 133 条路线及原有质量/色彩检查，网络探针不运行。
- `bun run desktop:test:document-expansion`：四种扩展名的 UI 提示/选项检查，使用 Tauri IPC mock，不代替实际文件选择器或系统 WebView 验收。

本机结果：脚本测试 197 项通过；Rust 120 项通过、3 项既有测试忽略；Svelte 检查 0 errors / 0 warnings；前端构建通过；文档四种扩展名及原有 BMP/TGA/QOI 的浏览器回归通过。完整质量检查的 133 条路线、20 项质量检查、240 项图片校准及 PDF ICC 检查通过。

证据存放于 [format-phase3a-20260913](evidence/format-phase3a-20260913/)。证据中的 HTTP 0 请求只针对所列测试输入，不是对任意文件的流量测量承诺。

## RTF 验收失败与范围修正

首轮 CI `34764753112` 在 Windows/macOS 的 Pandoc 3.11 上发现 RTF 正文顺序错误：标题和导语后的列表，在转换结果中移到了文档开头。本机下载并校验官方 Linux ARM64 Pandoc 3.11 后也复现，所以不能归因于 Windows 路径或 GUI。

最小 RTF 原件中的顺序是 BEFORE、INTRO、ITEM_ONE、ITEM_TWO、表格、AFTER；3.11 reader 输出把两个 ITEM 移到了 BEFORE 前。3.1.11.1 reader 读取这个 RTF 也会把列表并入表格，不能简单降级规避。旧 writer 生成的较简单样本在两版 reader 上通过，并不能否定新样本的失败。[3.11 官方发布记录](https://github.com/jgm/pandoc/releases/tag/3.11)说明该版本更改了 RTF 列表输出并增加嵌套表格读取能力，静态 review 还发现 [3.11 RTF reader 的 intbl 分支](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Readers/RTF.hs#L625) 将关闭的列表前置到已累计的正文块，与复现现象吻合；这是候选原因，尚未编译修改后的 Pandoc 验证。

本轮删除 RTF 的产品路线、reader、UI 与商店支持声明，保留失败最小复现。既有队列导入现在拒绝 RTF；不降低正文顺序断言、不改用只检查文件生成成功。RTF 输入与输出均待引擎专项修复后重新验收。本轮“第三步 A”完成范围以 133 条路线为准，不代表第三步所有候选都完成。

## 平台状态

[第二轮六平台验收 34765258166](https://github.com/web-casa/z8work/actions/runs/34765258166) 全部通过，工具代码为 `e7ac7d3`。每个平台运行四条新文档路线、重名/预取消/损坏压缩文档/外部资源检查，并重跑 45 条图片扩展路线。下表的“通过”是包内引擎与新工具的有限验收，不是新安装包安装验收。

| 平台          | 包内 Pandoc        | 文档路线与边界检查 | 来源报告                                                    |
| ------------- | ------------------ | ------------------ | ----------------------------------------------------------- |
| Linux AMD64   | 3.1.3              | 通过               | [报告](evidence/format-phase3a-20260913/linux-amd64.json)   |
| Linux ARM64   | 3.1.3              | 通过               | [报告](evidence/format-phase3a-20260913/linux-arm64.json)   |
| Windows AMD64 | 3.11               | 通过               | [报告](evidence/format-phase3a-20260913/windows-amd64.json) |
| Windows ARM64 | 3.11，x64 兼容运行 | 通过               | [报告](evidence/format-phase3a-20260913/windows-arm64.json) |
| macOS AMD64   | 3.11               | 通过               | [报告](evidence/format-phase3a-20260913/macos-amd64.json)   |
| macOS ARM64   | 3.11               | 通过               | [报告](evidence/format-phase3a-20260913/macos-arm64.json)   |

报告保留源包 run/文件/SHA-256、工具 SHA-256、提交及原始文档验收结果。本机另验证开发引擎 Pandoc 3.1.11.1 与官方 3.11；不能用本机版本替代包内版本。

本轮未重发 Windows/macOS/Linux 主程序安装包；历史安装包不会因源码增加路线自动获得新功能。商店草稿/静态支持页的本地更新不表示部署或上架完成。

后续按 [调研方案](FORMAT_EXPANSION_RESEARCH.md)继续音频输出、富文本路线，以及独立的 TIFF/ICO/动画等批次；本阶段不宣称这些已经完成。
