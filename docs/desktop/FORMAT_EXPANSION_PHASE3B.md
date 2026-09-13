# 原生格式扩展第三步 B：OGG/Vorbis 与 AIFF

日期：2026-09-13。承接 [文档输入扩展](FORMAT_EXPANSION_PHASE3A.md)，继续 [原生格式调研](FORMAT_EXPANSION_RESEARCH.md) 中的音频方向。

## 范围与语义

新增 OGG/Vorbis 输出，以及 AIFF/AIF 输入和 AIFF 输出。音频范围由 10 种输入扩展名 × 5 种输出增加到 12 × 7，新增 34 条路线。共享产品范围合计 29 个输入扩展名、15 个输出格式、167 条路线；AIF 是 AIFF 的输入别名。

| 输出 | 实际编码                  | 取舍                                                                    |
| ---- | ------------------------- | ----------------------------------------------------------------------- |
| OGG  | libvorbis，固定质量档位 5 | 有损，使用 VBR，文件大小不固定；与已有 Opus 输出区分                    |
| AIFF | pcm_s16be，16 位大端 PCM  | 未压缩；16 位源样本可保留，更高位深会量化到 16 位，不能称原始高位深无损 |

仅取第一条音轨，去掉视频、封面和用户标签，不合并多音轨。新两种输出要求采样率与声道数通过校验，否则拒绝保存。输入上限仍为 512 MiB，音频输出上限为 256 MiB，任务期限仍为 120 秒。AIFF 通常较大；不承诺转换能节省存储空间。不承诺每种源容器里所有 codec、声道布局或损坏文件都可转换。

依据：[FFmpeg codecs / libvorbis](https://ffmpeg.org/ffmpeg-codecs.html#libvorbis)、[FFmpeg 支持格式](https://ffmpeg.org/general.html)（2026-09-13 核对）。Linux/Windows 复用现有包内 FFmpeg；macOS 需要补齐编码器打包（见下文）。转换期间不下载引擎，不新增运行权限。

## 实现与 review

- 复用共享路线、Rust 输出枚举、已有 FFmpeg 进程和原子保存逻辑；AIFF/AIF 输入显式使用 AIFF demuxer，保留仅允许 file 协议的限制。
- 编码后核对 Vorbis/PCM16 codec、OGG/AIFF 文件头、源与输出采样率、声道和时长，再实际解码。不能只看文件名、扩展名或进程退出码。
- Vorbis 使用质量档位而非固定码率，并实测 8 kHz/44.1 kHz 单声道；AIFF 用 96 kHz 的 16/24 位源样本检查到 PCM16 的量化结果。
- UI 增加转换前编码取舍说明，隐藏不适用的图片质量/元数据/PDF DPI 控件；AIFF/AIF 加入音频预览识别及格式偏好恢复测试。没有内嵌封面不表示无法转换。
- 修正首页原有“5 种音频输出”声明，同步商店支持范围和双语支持页草稿。旧结果说明仍能识别，新增说明明确 Vorbis 有损和 AIFF 位深限制。
- 新增独立 `--audio-expansion` 验收，与完整质量矩阵和六平台能力工作流相连；完整门禁要求 34 条音频新增结果，旧 133 条报告不再代表当前范围。
- 浏览器音频选项测试接入已有桌面 CI；使用官方 Tauri IPC mock，只验证交互，不代替系统对话框和原生 WebView 验收。

## macOS 打包缺口

检查上一轮六平台包内清单发现，macOS 的基础 Homebrew `ffmpeg` 不包含 `libvorbis` 编码器；不能把另外两类系统的结果代替 Mac 验收。改用官方 [ffmpeg-full](https://formulae.brew.sh/formula/ffmpeg-full) 并从其独立 keg 的前缀复制二进制，防止机器上同时安装的基础版被误选。打包前核对七种产品音频编码器，随后复用依赖闭包、许可证/配方收据、重定位、签名和完整转换检查。

这会增加 Mac 原生库依赖和包体积；新库不代表产品自动开放它们支持的所有格式。旧 Mac 包不具备新增 OGG/Vorbis 输出能力。

## 真实文件验证

新增 34 条路线检查 codec/容器、尺寸字节、源文件哈希、音频时长/声道，以及实际解码后左声道 440 Hz、右声道 880 Hz 的振幅。视频样本包含视频流，输出只保留音频。

另有 10 项边界检查：4 项单声道/采样率组合、2 项 AIFF PCM16 量化、2 项多音轨选择、2 项无音轨视频拒绝。多音轨负例额外检查第二轨的 1200/1600 Hz 信号未进入输出。AIFF 和 AIF 分别验证预取消、重复保存不覆盖和伪装成音频的播放列表拒绝。

复现命令：

- `Z8_DEV_ENGINE_MANIFEST=... cargo run --locked --release --manifest-path src-tauri/Cargo.toml -p z8-native --features development-engines --bin smoke -- --audio-expansion`
- `bundle-check ENGINE_DIRECTORY --audio-expansion`
- `bundle-check ENGINE_DIRECTORY --quality`：完整 167 条路线及原有质量、图片校准和 PDF ICC 检查。
- `bun run desktop:test:audio-expansion`

本机脚本测试 199 项通过；Svelte 检查 0 errors / 0 warnings；前端构建和音频浏览器检查通过。Rust 首轮有一项既有工作目录回收测试 `normal_drop_failure_also_retains_ownership_marker` 的 deferred 数量断言失败；单项重跑及完整重跑均通过（120 passed、3 ignored）。该失败未能复现，未修改回收逻辑，也未将其称为已经修复。初始失败与复跑日志一并保留。

完整质量回归的 167 条路线、20 项质量检查、240 项图片校准及 PDF ICC 检查通过；六平台结果将在本轮验收完成后补记。证据目录：[format-phase3b-20260913](evidence/format-phase3b-20260913/)。

## 交付边界

本轮是源码与包内引擎验收，不自动重发安装包。历史安装包不会自动获得新路线。本地支持页和商店草稿更新不等于部署或上架。

RTF 仍因上一轮正文顺序问题暂缓；AAC 裸流、ALAC、音频码率/质量设置、多声道专项、富文本输出及其他图像/视频扩展继续留在后续范围。
