# Linux ARM64 扩展格式矩阵原始记录

记录日期：2026-09-15。这个目录保留本轮最终随包引擎的格式矩阵失败原始输出，供后续复现与 review 使用；它不是通过报告。

## 执行对象与方法

retry-4 至 retry-7 均通过最终随包 loader 或当前源码外置 verifier 配合最终随包 loader 执行：

```text
validation/bundle-check ENGINE_DIRECTORY --format-matrix
```

该命令由 [`packaging/desktop/linux/build-core24.sh`](../../../../packaging/desktop/linux/build-core24.sh) 中的 ARM64 专用门禁调用。它使用生产转换路径，为每一条已审核路由生成真实输入、编码、再解码并检查输出；成功时才会写出完整 JSON。执行流程及路由覆盖检查在 [`src-tauri/native/src/format_matrix_checks.rs`](../../../../src-tauri/native/src/format_matrix_checks.rs)。

原始输出在独立、可丢弃的 Linux ARM64 候选源目录产生，随后按原字节复制到此处。复制后 SHA-256 已核对；不要把空的 `format-matrix*.json` 当作部分通过报告。

| 尝试 | 原始日志 | SHA-256 | 终止位置与结论 |
| --- | --- | --- | --- |
| retry-4 | [format-matrix-retry-4.log](format-matrix-retry-4.log) | 93ab495ad81d858088796be782323d4b024aa2be3ffc776be180cc4ee49ba57d | 到 VOC → WAV 时报告 Audio sample rate changed; no output was published。VOC 以 47,994 Hz 表示名义 48 kHz 样本；该失败促成目标编码器采样率合同的集中修正。此尝试没有通过。 |
| retry-5 | [format-matrix-retry-5.log](format-matrix-retry-5.log) | be0cc2d928568d2ce04b769ea2c14edbb27bfb08085a41cc005fef9cdec3e93d | 已越过 VOC 并进入 WMA 输入；最后可见命令为 WMA → Opus 输出的 FFmpeg 解码读回，随后得到 Timed out。此尝试没有通过。 |
| retry-6 | [format-matrix-retry-6.log](format-matrix-retry-6.log) | 0c30cd2096f6c39588c1e004593f93d6cb9df35b3f0605a1d64631f1fb02d754 | 在 pdf-Pbm-2 读回停止。它调用的是候选目录中旧的嵌入 verifier；[retry-6.meta](format-matrix-retry-6.meta) 没有当前源码的验证器 SHA。随后用当前源码验证器越过全部图片/PDF 路线，因此此条不能作为当前 PBM 代码的失败结论。 |
| retry-7 | [format-matrix-retry-7.log](format-matrix-retry-7.log) | 8517622f329c31274540b424ea99f28d3432fbfc11cc5c82ad81cae85a012a5a | 以当前源码编译的外置 verifier 越过所有图片和 PDF 路线，随后在测试夹具生成的 Pandoc DOCX writer 停止，报 Could not find data file /usr/share/pandoc/data/docx/[Content_Types].xml。不是用户 DOCX 输入转换失败；静态真实输入夹具已替换该 writer 路径。该尝试仍没有通过完整矩阵。 |

retry-4 至 retry-7 的 JSON 均为 0 字节，SHA-256 均为空文件摘要 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855。因此本目录没有、也不会声称有完整格式矩阵的成功结果。

## 对 retry-5 的边界判断

最后一条打印日志由 [`phase2_smoke::command`](../../../../src-tauri/native/src/phase2_smoke.rs) 输出，该辅助函数对单个验证命令施加 30 秒 deadline；生产转换路径的 [`convert_source`](../../../../src-tauri/native/src/convert.rs) 则对非 PDF 输入施加 120 秒 deadline。日志没有携带 deadline 来源，因此 `retry-5` 的泛化 `Timed out` 只能证明某个有界步骤未正常结束，不能仅凭最后一条打印命令归因到 30 秒读回，也不能单独证明 WMA 输入、Opus 编码器或产品转换路线不兼容。

下文的同引擎缩小复现已经排除了直接 FFmpeg 命令立即卡住的简单解释，但不能区分矩阵循环、Rust 生产转换或外层执行环境。下一步必须受控完整重跑，保留开始/结束时间、精确停止路由、每一步耗时、stderr、FFprobe 结果与退出码，再决定是修正真实的转换问题，还是调整明确步骤的合理资源界限。不得因为这条日志而放宽 codec、声道、时长、完整解码或路由覆盖门禁。

## retry-5 的同引擎缩小复现（2026-09-15）

[`wma-all-output-direct-reproduction.log`](wma-all-output-direct-reproduction.log)（SHA-256 `46e7605f4d229d269c8aa84ab77972b8ac56cce90396cfc616f1659dc53ddd1b`）使用同一 ARM64 随包 loader、FFmpeg 9.0.1 和输入夹具，逐一执行 WMA → WAV、MP3、FLAC、Opus、M4A、OGG、AIFF、AAC、ALAC。每条都复用了产品编码时的 FFmpeg 参数，并再以格式矩阵的完整解码参数读取输出；每个命令设置 45 秒外层上限。

九条编码和九条解码均返回 0。编码耗时 5–20 ms，解码耗时 5–14 ms。因此没有在同一引擎的 WMA→Opus 或其后 WMA 输出中复现卡住。该检查只隔离了随包 FFmpeg 命令边界，未走 Rust 的完整 staging、发布和格式矩阵循环，不能替代完整矩阵；下一步仍需受控地完整重跑以定位 timeout 的真实来源。


## retry-6 / retry-7 的验证器与文档夹具修正

retry-6 的候选目录内嵌 validation/bundle-check SHA-256 是
5f3379d7dd0cefa8c8c5e32787d352589742f4892ff385862ae5153196ed1aac，
而 retry-7 使用本轮源码重新编译的外置验证器 SHA-256 是
5bf248ef281eab440d4c9e1c67ea5b2dfe43714a33c0efd1d37a299824b0dbc1。
后者的构建记录在
[bundle-check-current-source-build.log](bundle-check-current-source-build.log)，且明确越过了
retry-6 的 PDF/PBM 停止点。

retry-7 暴露的是验证器在生成 DOCX/ODT/EPUB 输入夹具时依赖 Pandoc writer
数据模板。产品实际路线是受 sandbox 保护的输入到 TXT reader；不能为了让测试
writer 工作而关闭 sandbox、改变产品 reader，或把测试成功误作用户输入成功。
因此矩阵和独立文档扩展检查都改为使用仓库内固定、可复核的真实文件。

修正后，当前源码外置 verifier 仍使用同一个候选 ARM64 引擎目录，已通过
[document-expansion-static-fixtures.json](document-expansion-static-fixtures.json)：
HTML、HTM、ODT、EPUB 到 TXT 的有序 Unicode 文本、源文件哈希、重复转换、
取消、损坏 archive 拒绝，以及本地文件/脚本省略和网络请求 0 均通过。
命令元数据在
[document-expansion-static-fixtures.meta](document-expansion-static-fixtures.meta)。
此结果验证了 reader 修正；它不是最终提取归档的全格式矩阵通过报告，下一次完整
矩阵仍是发布门禁。
