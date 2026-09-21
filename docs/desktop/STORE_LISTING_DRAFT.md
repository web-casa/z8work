# Microsoft Store 商店文案草案（冻结候选材料 · 双语）

更新：2026-09-21。用途：Partner Center 商店列表的文案草稿，供所有者粘贴/审阅后冻结。与代码内身份（`packaging/desktop-web/microsoft-store.json`）和提交源（`packaging/desktop/store/submission.json`）配套；**提交前的实际录入是外部动作**。

配套事实：应用版本 `0.2.0`（Store 包版本 `1.0.0.0`，首次提交）；Identity `53660AlanM.Z8Work`；发布者显示名 `AlanM.`；定价 `free`（submission.json 已填）；分级 `3+`（问卷答案草拟见 submission.json `ageRatingNotes`）；加密声明草拟见 `encryptionDeclaration`。

## 英文（en-US）

**Display name**: Z8.Work

**Summary**（≤ 80 字符，当前 76）:

> Convert files locally with bundled WebAssembly engines. Private, offline.

**Description**:

> Z8.Work converts images, audio, documents and PDFs right on your device.
> Every conversion runs inside bundled WebAssembly engines — your files never
> leave the app, and there is no account, no analytics and no upload server.
>
> - Works fully offline after installation
> - Image conversion with quality and format controls
> - Audio extraction and conversion
> - Document and PDF conversion, including multi-page PDFs
> - System save dialog with safe atomic writes and quit protection
>
> Z8.Work is open source under AGPL-3.0. The bundled conversion engines ship
> with their complete corresponding source, published at
> https://z8.work/desktop-source/

**Keywords**（≤ 7 × 30 字符建议）: file converter; image converter; audio converter; pdf; document converter; offline converter; webassembly

**What's new in this version**:

> First store release: local file conversion with bundled WebAssembly
> engines, system save dialog, offline notices and dual-language interface.

**Screenshot captions**（待真实截图）: "Convert images, audio, documents and PDFs locally", "Quality controls and format presets", "Safe save with retry", "Works offline".

## 简体中文（zh-CN）

**显示名称**: Z8.Work

**摘要**（≤ 80 字符，当前 46）:

> 本机文件转换：内置 WebAssembly 引擎，离线可用，文件不上传。

**描述**:

> Z8.Work 在您的设备本机完成图片、音频、文档与 PDF 转换。所有转换都在内置的
> WebAssembly 引擎中运行——文件不离开应用，没有账号、没有统计跟踪、没有上传服务器。
>
> - 安装后完全离线可用
> - 图片转换，提供画质与格式控制
> - 音频提取与格式转换
> - 文档与 PDF 转换，支持多页 PDF
> - 系统保存对话框、原子写入与退出保护
>
> Z8.Work 基于 AGPL-3.0 开源，内置转换引擎随附完整对应源码：
> https://z8.work/desktop-source/

**关键词**: 文件转换; 图片转换; 音频转换; PDF; 格式转换; 离线工具; 本机转换

**本版本新内容**:

> 首个商店版本：内置 WebAssembly 引擎的本机文件转换，系统保存对话框、
> 离线许可说明与双语界面。

## 冻结前核对清单

| 项                         | 状态                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------- |
| 定价 / 分级 / 加密声明草拟 | 已入 submission.json（分级问卷与加密问题在 Partner Center 实际确认）                |
| 双语文案                   | 本文件，待所有者确认定稿                                                            |
| 截图                       | 待 Windows 真机候选安装后捕获（需绑定候选摘要的捕获报告，见 submission 评估器要求） |
| 隐私/支持 URL              | 已部署；字节证据等 zone Email Obfuscation 关闭后固定                                |
| 应用源码与引擎源码链接     | 已发布并验证（desktop-source-1 / /desktop-source/）                                 |
