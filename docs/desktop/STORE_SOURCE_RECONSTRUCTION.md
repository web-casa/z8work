# 商店源码重建：第三批

本轮将 FFmpeg 与 Pandoc 从“缺少构建来源”推进到固定源码候选、可核验归档和重建入口。应用使用的 WASM 没有替换；商店提交仍被发行门禁阻止。

## 已落实

FFmpeg 的主仓库与 16 个依赖已按完整 Git commit 收集并核验。锁文件是 `packaging/desktop-web/ffmpeg-source-dependencies.json`。x264 和 LAME 原本使用分支名，目前固定为解析得到的提交；这不构成历史构建输入证明。

新增 `scripts/desktop-web-ffmpeg-context.py`，先检查每个收集组的身份及 Git 内容，再生成构建目录。Dockerfile 改用本地源码和固定 Emscripten 镜像摘要，拒绝上游 Dockerfile 意外变动、缺失依赖和浮动镜像。源码校验现在也拒绝额外文件，避免未记录的构建输入混入。上游无上限的 `make -j` 被明确改为 `-j2`，补丁文件清单写入报告。

Pandoc 已收集候选源码 `336228bb8d5e9bf35750cfe6b546ffb4bcd86c15` 及六个固定补丁仓库。`cabal.project` 的索引日期为 `2024-11-15T08:25:42Z`。旧 WASM 的 producer 段标记 GHC `9.12.0.20241115`、Clang `19.1.4-wasi-sdk`；历史 GHC 归档通过上游摘要校验，内部版本头也匹配。另保存 65 个完整包 unit ID 线索；它们不是完整依赖解析计划。

25 个源码收集组共 19,759 个 Git blob 通过核验。FFmpeg/Pandoc 各有一份本地源码候选归档，解包后的源码复验通过；位置、大小和摘要见证据目录的 `archives.json`。这些文件位于忽略目录 `.desktop-local/store-source-phase3/`，尚未公开提供。

## 构建与验收入口

新增手动工作流 [.github/workflows/desktop-web-ffmpeg-source.yml](../../.github/workflows/desktop-web-ffmpeg-source.yml)。它在原生 x86 Ubuntu runner 收集并核验固定源码、构建 single-thread core、执行音视频转换检查，再记录与当前 WASM 的摘要比较。只产出验证用 artifact，不替换应用文件、不签名、不提交商店；本轮没有推送或触发此工作流。

本地准备命令：

```sh
python3 scripts/desktop-web-ffmpeg-context.py \
  --collection .desktop-local/store-source-phase3 \
  --output /absolute/new-build-context
```

构建使用专用 BuildKit 配置 `packaging/desktop-web/buildkitd.toml`，限制两个并行步骤；本轮专用 builder 限制为 6 GiB 内存、4 核 CPU，每个 make 两个任务。对应设置来自 [Docker BuildKit 配置](https://docs.docker.com/build/buildkit/configure/)和 [container driver](https://docs.docker.com/build/builders/drivers/docker-container/) 文档。

新工具 `scripts/desktop-web-ffmpeg-smoke.mjs` 验证 WAV、MP3、Ogg Vorbis、FLAC 编解码、H.264 编解码和缺失输入拒绝。已在当前应用引擎上通过；不代表重建候选或浏览器/原生安装包验收通过。

## 仍未完成

- FFmpeg：历史二进制与源码候选的绑定；最终重建产物和应用浏览器验收；apt/Emscripten ports 等剩余输入尚未全部归档，因此目前不是完全离线构建。
- Pandoc：实际 WASI SDK、优化器输入、完整 Cabal plan/Hackage 源码依赖，以及最终二进制对应验证。
- 全部引擎：完成分发许可审阅及对外源码交付；未将局部证据标为发行通过。
- 商店：Windows 最终 MSIX 安装/WebView2/WACK、macOS 身份/签名/沙箱/PKG 验收仍未完成。

## 验证记录

[证据目录](evidence/store-source-phase3-20260920) 保存归档摘要、源码及解包复验、GHC 检查、引擎测试和发行门禁结果。198 项应用测试、15 项源码工具测试通过；当前 FFmpeg 的六项转换检查通过；新增工作流经 actionlint 检查通过。引擎清单已更新具体缺项，离线许可证材料已重新生成，发行预检仍失败。

本地构建实际结果见同目录 `build-status.json`。首次无限并行构建因资源压力被中止，不计作通过；受限重试也只有在最终产物和退出状态均成功时才算完成。

## 第四批进展

FFmpeg 续建和全字节对照已完成；常用核心转换、能力清单及离线页面验收通过。额外 H.265 编码探测超时单独记录。详见 [FFMPEG_REBUILD_VALIDATION.md](FFMPEG_REBUILD_VALIDATION.md)。

## 第五批进展

Pandoc 已从固定源码、工具链和 127 个 Hackage 包断网重建，并以通过应用内 Markdown→DOCX 验收的新产物替换旧 WASM。两次独立构建功能一致但字节不同，未标为 bit-for-bit reproducible；具体摘要、原因边界和门禁约束见 [PANDOC_REBUILD_VALIDATION.md](PANDOC_REBUILD_VALIDATION.md)。
