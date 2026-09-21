# FFmpeg 重建验收：第四批

**固定源码已重建出与当前应用完全相同的 FFmpeg WASM 和 JavaScript。** `@ffmpeg/core 0.12.10` 的技术来源对应关系已得到直接验证；源码对外交付、分发许可审阅以及 Windows/macOS 最终包验收仍未完成，因此不代表可以提交商店。

## 产物与来源

| 文件                    | 重建与当前应用的共同 SHA-256                                       |
| ----------------------- | ------------------------------------------------------------------ |
| `ffmpeg-core.wasm`      | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |
| `ffmpeg-core.js`（ESM） | `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3` |

本轮复用前批缓存，在 Linux ARM 主机上运行 x86 Emscripten 工具链，构建正常退出（0）。最终产物位于 `.desktop-local/store-source-phase4/ffmpeg-rebuilt/dist/esm/`；其目标为 WebAssembly，不是 Windows 或 macOS 安装包。

来源包括固定 FFmpeg wrapper、16 个依赖，以及新增的 Emscripten 3.1.40 和 SDL 2.24.2：共 19 个收集组、30,446 个 Git blob，通过核验及归档解包复验。Emscripten 内置运行库源码已包含在内；SDL 原始 ZIP 通过 Emscripten port 中固定的 SHA-512 校验，实际构建镜像内的 port 脚本也与收集源码一致。

源码归档位于 `.desktop-local/store-source-phase4/ffmpeg-corresponding-source-candidate.tar.gz`，SHA-256 为 `17546c1c151ef8e16578f213f9ae0c96381a19445819a213b47d2bd3fc93e663`。它仍是本地归档，未公开提供。

具体绑定、构建输入与产物摘要见 [source-binding.json](evidence/ffmpeg-rebuild-20260920/source-binding.json)。构建环境记录包含 244 个已安装包的版本；配置记录确认 14 项必要功能开关启用。

## 验证结果

| 检查                           | 结果   | 范围                                                                               |
| ------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| WASM 与 ESM JS 全字节比较      | 通过   | 两者均与现有 npm 文件一致                                                          |
| 核心转换检查                   | 通过   | WAV、MP3、Vorbis、FLAC 编解码，H.264 编解码，缺失输入拒绝，共 6 项                 |
| 能力清单对照                   | 通过   | 184 编码器、479 解码器、465 滤镜、386 格式，均无增减；这不是逐个编解码器的功能测试 |
| 离线页面转换/下载              | 通过   | 图片、音频、文档、PDF、HEVC 视频提取音频，以及附加 MP3/Vorbis 输出，共 7 个流程    |
| 应用与源码工具回归             | 通过   | 198 项应用测试、15 项源码工具测试                                                  |
| H.265 编码补充探测             | 失败   | 原引擎与重建引擎的 8/10/12 位编码，在 Node 核心测试中均达到 20 秒进程上限          |
| Windows / macOS 直发最终包验收 | 未执行 | 本轮不含原生安装、签名、WACK、公证或 Gatekeeper 验收                               |

浏览器入口通过 `--ffmpeg-core-dir` 为实际应用页面加载指定 JS/WASM，并记录加载文件摘要；不会修改应用资源。转换使用真实 Worker/WASM；许可证与渠道 UI 检查仍使用 shell stub，不能作为原生验收证据。

新增的合成 HEVC/AAC 视频夹具为红色画面与 440 Hz 音频，不含用户媒体。生成参数及摘要见 `tests/fixtures/ffmpeg-hevc-audio.json`。浏览器把该视频转换为 FLAC 后，实际解码下载文件并检查时长及非静音信号。

链接器的 x265 函数签名警告和额外编码探测超时均已记录，尚未确认因果关系。当前 `videoFormats` 仅开放输入，未提供 H.265 视频编码输出；实际支持的视频提取音频流程已通过。不能将补充编码探测写成通过，也不能把它概括为 H.265 解码不可用。

## 可复用工具与剩余工作

- `scripts/desktop-web-browser.mjs --ffmpeg-core-dir ... --video-fixture tests/fixtures/ffmpeg-hevc-audio.mp4`：指定候选的真实离线页面验收。
- `scripts/desktop-web-ffmpeg-inventory.mjs`：保存或对照能力清单；已验证缺失条目会失败。
- `.github/workflows/desktop-web-ffmpeg-source.yml`：原生 x86 构建入口，现已包含运行库源码收集、候选音视频测试、能力对照和离线浏览器验证。工作流尚未推送或触发；本轮结论来自本地实际构建。

`packaging/desktop-web/engines.json` 已关联上述证据，同时保留分发审阅阻塞。Pandoc 随后已完成固定输入断网重建并替换旧产物，独立构建的字节非确定性单独记录；MuPDF 已完成独立复建，ImageMagick 按未修改官方资产完成上游验证。全部源码公开交付、许可审阅和最终包验收仍未完成。MS Store 首包版本保持已确认的 1.0.0.0。

所有结果及已知失败见 [证据目录](evidence/ffmpeg-rebuild-20260920)。专用构建器已停止，缓存保留。
