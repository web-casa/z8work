# 原生格式扩展开发记录

更新日期：2026-09-15。本文件记录当前“低、超低、中难度格式 + HEIC/HEIF、SVG、JXL、EXR、HDR、DPX”桌面版扩展的实际开发过程、复核结论和证据边界。它与[实施计划](FORMAT_EXPANSION_DELIVERY_PLAN.md)配套使用；历史三批已交付格式见[第一步](FORMAT_EXPANSION_PHASE1.md)、[第二步](FORMAT_EXPANSION_PHASE2.md)、[第三步 A](FORMAT_EXPANSION_PHASE3A.md)与[第三步 B](FORMAT_EXPANSION_PHASE3B.md)。

## 范围与已确认决策

- 转换继续由桌面端随包的 Rust 管理原生引擎完成，不回退到网页 WASM 引擎，也不依赖用户系统安装的同名程序。
- 本轮不开发视频格式。音频只处理白名单容器中的第一条音轨，继续禁止网络协议、播放列表和未知裸 PCM。
- 每个格式的“可支持”必须同时经过产品路由、最终包内引擎、真实编码、重新解码和结果语义检查；引擎声称支持某 coder 或同扩展名出现在网页端，都不足以开放桌面版能力。
- 专业图片首版明确以受限静态位图语义交付：不承诺动画、多页、制作级 LUT、任意 ICC/高位深或专业调色保真。PDF 的输出逐页，文本类只提取 UTF-8 纯文本。

格式优先级、依赖和平台风险的调研保留在[格式扩展调研](FORMAT_EXPANSION_RESEARCH.md)与[格式目录](FORMAT_EXPANSION_CATALOG.md)；网页、上游引擎和桌面候选的支持差异见[格式支持报告](FORMAT_SUPPORT_REPORT.html)。

## 实施过程与 review 修正

| 顺序 | 观察到的实际问题                                                                        | 已采取的修正                                                                                                                                          | 复核结果                                                                                                     |
| ---- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | ImageMagick 默认拒绝策略下，RGBA ICO 写入会在内部调用 `PNG32`，导致 ICO 路线被拒绝。    | 仅在既有显式 coder 白名单中加入 `PNG32`；仍拒绝 PDF、delegate、filter 和通配写权限。                                                                  | 同一随包 ARM64 引擎可写入并读回 256 × 256 ICO；尝试写 PDF 仍被策略拒绝。                                     |
| 2    | 初始 DPX 夹具把 PNG 样本乘以 4 后写入 10-bit 整数 DPX，超范围样本会静默变黑。           | DPX 夹具改为可表示的 10-bit `TrueColor` 样本；产品代码把 DPX 从 EXR/HDR 固定曝光映射中分离，按解码后的 8-bit sRGB SDR 输出。                          | 四色 DPX 可以读回；不会再把无效夹具当成产品解码失效。专业 LUT、gamma、reference black/white 仍不作保真承诺。 |
| 3    | PDF 第二页用亮绿背景配白字，导出 PBM/XBM 时两色都落在 50% 阈值白侧，读回成为单色。      | 保持产品的灰度后固定 50% 阈值语义，夹具第二页换为深绿背景以跨越阈值。                                                                                 | 三页 PBM 能读回黑白两种像素；读回门禁未放宽。                                                                |
| 4    | Org 的未转义下划线被 Pandoc 按下标语义解释，标识符字面文本变化。                        | 使用真实 Org 输入，并显式写入 `#+OPTIONS: ^:{}`；结果说明披露 Org 标记语义。                                                                          | 同一随包 Pandoc 保留 `Z8_MATRIX_START` 等测试标识符；不再误把标记解析视为丢失文本。                          |
| 5    | AMR-NB 8 kHz 转 Opus 后，读回采样率为 48 kHz；初始矩阵把它当作异常。                    | 采样率验证改为共享的编码器合同：Opus 接受 48 kHz 时钟；MP3/AAC/M4A 仅接受各自最近的离散目标采样率；无损/未受限输出保持精确一致。                      | 使用最终 FFmpeg 直接转换 AMR、VOC 和多个边界采样率；codec、声道、时长和完整解码检查仍保留。                  |
| 6    | VOC 的 nominal 48 kHz 样本被读作 47,994 Hz，初始严格一致性检查使 `VOC → WAV` 无法发布。 | 将采样率判断集中到 `audio_output_sample_rate_matches_contract`，产品转换和格式矩阵复用同一函数；界面分别说明 MP3、AAC/M4A 与 Opus 的有损/重采样行为。 | retry-4 的停止点已跨过；完整 ARM64 矩阵尚未完成，不能把该单点修正称为全矩阵通过。                            |

上述技术依据、官方资料链接和更细的推导见[实施计划中的复核修正](FORMAT_EXPANSION_DELIVERY_PLAN.md#方案复核修正)。

## 已执行的本地验证

下表记录本轮代码变更后已经完成的本地门禁。它们验证源码和前端，不替代最终 Linux ARM64 包或其他平台包的验收。

| 门禁                                                                                               | 结果                     | 覆盖范围                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| `cargo fmt --manifest-path src-tauri/Cargo.toml` 与 `git diff --check`                             | 通过                     | Rust 格式与变更空白检查。                                       |
| cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --features engine-validation | 142 通过、0 失败、3 忽略 | 原生路由、策略、DPX/PBM/Org、共享音频采样率合同和静态文档夹具。 |
| `bun test desktop/tests/impact.test.mjs tests/format-support-report.test.mjs`                      | 6 通过、0 失败           | 中文结果说明与格式支持报告契约。                                |
| `bun run desktop:check`                                                                            | 0 errors、0 warnings     | Svelte/TypeScript 前端检查。                                    |
| `bun run desktop:build`                                                                            | 通过                     | 桌面前端生产构建。                                              |

## Linux ARM64 最终包矩阵状态

完整矩阵在最终随包 loader 下执行格式矩阵 verifier，不使用开发机 PATH。每一条路线
走生产转换路径，成功时才写出完整 JSON。原始记录在
[format-matrix-20260915](evidence/format-matrix-20260915/)。

| 尝试    | 已到达的范围                                        | 终止结果                                     | 当前结论                                                       |
| ------- | --------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| retry-4 | 图片、PDF、文本/文档及大部分媒体；末尾到 VOC 输入。 | 音频采样率合同过严。                         | 已修正，但该次仍是失败记录。                                   |
| retry-5 | 进入 WMA 输入；最后可见为 WMA 到 Opus 的解码读回。  | Timed out，没有矩阵 JSON。                   | 同引擎九条 WMA 缩小复现通过，不能据此宣布 WMA 或 Opus 不兼容。 |
| retry-6 | 到 PDF PBM 第二页。                                 | 候选中旧 verifier 停止。                     | 当前源码 verifier 已越过该点，不能作为当前 PBM 失败。          |
| retry-7 | 全部图片和 PDF。                                    | Pandoc writer 生成 DOCX 夹具时缺少模板数据。 | 已改为静态真实 reader 夹具；仍未完成完整矩阵。                 |

因此，本轮源码不能宣称 Linux ARM64 扩展格式矩阵通过，也不能生成新的可交付 DEB、
更新公开格式承诺，或把同一结果外推到 Linux AMD64、Windows、macOS。

### retry-5 的同引擎缩小复现

使用 retry-5 同一 ARM64 随包 loader 与 FFmpeg 9.0.1，按产品编码参数分别执行 WMA → WAV、MP3、FLAC、Opus、M4A、OGG、AIFF、AAC、ALAC，并用格式矩阵的完整解码参数读取每个输出。九条编码和九条解码均返回 0；编码为 5–20 ms，解码为 5–14 ms。原始命令、输出和 SHA-256 见[缩小复现日志](evidence/format-matrix-20260915/wma-all-output-direct-reproduction.log)。

这排除了“同一随包 FFmpeg 的 WMA→Opus 命令本身立刻卡住”这一简单解释，但没有走 Rust 的 staging、发布和整个矩阵循环，不能解释或关闭 retry-5。下一步由“先单路复现”调整为“保留这个缩小结果后，受控完整重跑并记录准确停止路由”。

## 当前待处理事项与执行顺序

1. 使用当前源码 verifier 和同一 ARM64 候选引擎执行完整 retry-8。只接受非空 JSON、
   精确路由覆盖、每条输出真实读回、来源文件哈希未变化的结果。
2. 若出现新的明确失败，只修正已复现的最小路径并添加回归。不得用放宽全局期限、
   取消读回或降低 sandbox 条件来消除失败。
3. retry-8 通过后，重新构建 ARM64 候选，让最终归档内嵌当前 verifier；从提取后的
   归档再次运行完整矩阵。
4. 在最终归档上检查应用/引擎哈希、DEB 内容、离线安装、实际转换、卸载和
   GUI/保存/取消边界。通过前不替代现有稳定候选。
5. 以同一合同分别验收 Linux AMD64、Windows AMD64/ARM64、macOS AMD64/ARM64；
   每个平台记录实际引擎版本、签名/封装状态与未覆盖范围。
6. 只有所有目标包完成对应验收后，才更新支持页面、格式报告、下载清单、许可与
   源码交付材料，并进入 Windows MSIX、Snap strict、macOS 权限/升级和正式发行门禁。

## 不应在当前阶段作出的结论

- 不将 retry-5 的 timeout 写成“WMA 或 Opus 不支持”，也不将日志最后出现的命令写成已成功通过。
- 不把本地 Rust/Svelte 测试、开发构建或空 JSON 当作最终包验收。
- 不因为需要完成矩阵而放宽 ImageMagick 的默认拒绝安全策略、FFmpeg 文件协议限制、Pandoc sandbox、输出大小预算、原子保存或音频读回条件。
- 不把新源码自动等同于 GitHub Release、商店提交、已有安装包更新或跨平台可用性。

## 2026-09-15 续记：静态文档夹具、retry-6/retry-7 与下一次矩阵

### 观察、归因和最小修正

retry-6 的停止点是 PDF PBM 第二页，但该候选内嵌 verifier 仍是旧二进制。以当前
源码重新编译的 verifier 在相同 ARM64 引擎目录中越过所有图片和 PDF 路线，说明
不能把 retry-6 归因为当前 PBM 代码。

retry-7 随后停止于 Pandoc 生成 DOCX 输入夹具，而不是产品将用户 DOCX 转为 TXT：
bundled Pandoc writer 寻找系统路径下的 DOCX 模板数据文件。Pandoc reader 已用真实
DOCX、ODT、EPUB 输入在产品的 sandbox 参数、显式 reader 和随包数据目录下读回
有序文本。修复没有关闭 sandbox，也没有把 writer 纳入产品能力。

代码现在把两个验证器中的 DOCX、ODT、EPUB 输入改为可复核的静态真实文件：
format_matrix_checks.rs 覆盖格式矩阵的 DOCX/ODT/EPUB；document_expansion_checks.rs
覆盖 HTML/HTM/ODT/EPUB 的 Unicode、列表、表格、重复转换、取消、损坏 archive 与
外链隔离。夹具的来源文本、固定生成条件和 SHA-256 记录在
src-tauri/native/fixtures/README.md。

### 已完成的复核

- 原生测试以单线程完成：142 通过、0 失败、3 个明确忽略。此前一轮并行运行中的
  workspace 权限模拟短暂失败，单项、单线程和后续三轮默认并行复跑均通过；未在没有
  可重复根因的情况下修改不相关的工作区清理代码。
- 当前源码在离线 ARM64 core24 容器中重新编译 verifier，SHA-256 为
  4efff13dbbf6e9f7e383a1314432f5a933a96e551459922b8a43c074889d6cfc。
- 该 verifier 对同一候选引擎执行独立文档扩展检查已通过。证据
  document-expansion-static-fixtures.json 显示 4 条输入路线均保留有序文本和来源
  哈希；资源隔离结果是 HTTP 请求 0、本地文件和脚本内容均未进入结果。

上述 verifier 是从当前源码临时编译并挂接到旧候选引擎的诊断工具。它证明 reader
和夹具修正，不等于候选归档已经包含新 verifier 或已完成最终包验收。

### 接下来的执行顺序

1. 使用当前源码 verifier 和同一 ARM64 候选引擎执行完整 retry-8；仅接受非空 JSON、
   完整路由覆盖和所有输出重新读回。
2. 若 retry-8 发现新的明确失败，只修复已复现的路径并把失败日志、输入性质和回归
   测试写回本目录；不放宽全局超时、codec、像素或 sandbox 条件。
3. retry-8 通过后，重新构建 ARM64 引擎候选，使最终归档内嵌同一 verifier 和静态
   夹具源码；从提取后的归档再次运行完整矩阵。
4. 只有最终归档报告非空且哈希绑定成功，才构建和验证新的 ARM64 DEB，并开始 Linux
   AMD64、Windows AMD64/ARM64、macOS AMD64/ARM64 的逐平台验收。
