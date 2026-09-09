# Phase 19：媒体静态预览

日期：2026-09-09。承接 [Phase 18](PHASE18_IMPLEMENTATION.md)，补充 [V1 方案](V1_PLAN.md) 中的视频静态画面与媒体预览能力。使用已有原生 FFmpeg/ffprobe，不新增依赖、播放器、WASM 或网络服务。

## 用户可见变化

- MP4、MOV、MKV、WebM 提供“预览首帧”，显示第一个视频画面的 PNG 快照。片头黑帧会原样显示，不自动寻找精彩片段。
- MP3、WAV、FLAC、OGG、M4A、OPUS 提供“查看封面”，尝试读取内嵌图片。没有可读取封面的音频给出明确说明，不将任务标为转换失败。
- 图片、PDF、媒体的静态预览均限输入 32 MiB、输出最长边 256 像素。超限文件显示预览限制说明，正式转换仍按其独立限制处理。
- 中英文按钮、替代文本和说明分别区分图片首帧、PDF 首页、视频首帧及音频封面。预览无需选择输出目录，正式转换继续读取原文件。

[视频截图](evidence/phase19/video-preview-zh.png)、[音频封面截图](evidence/phase19/audio-cover-zh.png)。截图使用生成的红色视频与绿色封面，便于验证没有选错流。静态预览不代表已支持视频转视频；本阶段的正式媒体转换仍为音频转换或视频提取音频。

## 实现与安全边界

沿用只接受已授权任务 ID 的 `preview_input`、输入句柄与 Stamp 复核、单任务占用、取消/移除/退出等待、临时目录清理、二进制 PNG 响应和单 Blob URL 管理。不增加读取任意路径、访问网络或 Shell 的前端权限，不持久化预览数据。

新增 `convert/preview/media.rs`：

1. 从后端登记的扩展名确定明确的 demuxer。抽取正式音频转换已有的 `media_demuxer` 映射，预览和转换复用同一容器选择；不会靠内容探测将伪装媒体识别为播放列表。
2. 在已复制的临时输入上运行有时限的 ffprobe，只查询视频流编号、尺寸与 `attached_pic` 标志。视频选择首个非封面视频流；音频只接受内嵌图片流，不把伪装音频文件里的普通视频当作封面。
3. 校验选中流的尺寸与编号，再由 FFmpeg 显式 `-map 0:<index>`、`-frames:v 1` 输出单帧 RGBA PNG，去除元数据和章节，禁用音频、字幕与数据输出。
4. 根据显示宽高比缩放，并设为方形像素；FFmpeg 的自动旋转在滤镜前处理方向。预览编码结果继续经过现有 PNG 文件头、尺寸与字节数校验。

ffprobe 和 FFmpeg 都固定 `-protocol_whitelist file`，MOV 家族额外关闭 `enable_drefs` 和 `use_absolute_path`，处理文件名、滤镜与参数来自固定代码，不接收用户滤镜脚本或命令行。格式映射抽取没有改变正式音频编码参数。

参数已核对本机 FFmpeg 7.1.5 帮助及 [FFmpeg CLI 文档](https://ffmpeg.org/ffmpeg.html)、[scale/setsar 文档](https://ffmpeg.org/ffmpeg-filters.html#scale)和[协议白名单说明](https://ffmpeg.org/ffmpeg-protocols.html)。`max_alloc` 是单次分配上限，不能宣传为进程总内存上限。

### 资源预算

| 项目        | 限制                                                                      |
| ----------- | ------------------------------------------------------------------------- |
| 原始输入    | 32 MiB，复制时再次检查                                                    |
| probe       | 1 MiB probesize、1 秒 analyzeduration；后者是分析的媒体时长，不是墙钟超时 |
| 解码前尺寸  | 单边 1–8000 像素，最多 1600 万像素；流编号小于 1024                       |
| FFmpeg 分配 | `max_alloc` 64 MiB，限制单次分配；不等于进程总内存                        |
| 线程        | 输入解码、滤镜和 PNG 输出各设置为 1；外部 codec 内部实现仍可能有自身行为  |
| 输出        | 一帧 RGBA PNG，最长边 256，读入 WebView 前最多 512 KiB                    |
| 总时限      | 共用 15 秒 deadline，覆盖复制检查、probe、生成与结果校验，不因进度重置    |
| 同时任务    | 沿用队列互斥；不与正式转换同时运行                                        |
| 缓存        | 一个 Blob URL；替换、关闭、移除、卸载时释放                               |

媒体快照可能放大小画面；极端比例按最小 1 像素、整数尺寸取整。快照用于辨识内容，不承诺动画、HDR、色彩校样或完整视频播放。复杂但有效的媒体可能因预览预算被拒绝，正式转换能力独立适用。

同步文件系统调用的 deadline 检查点、引擎层限制不等于操作系统硬隔离，以及异常强杀可能留下临时目录的边界，继续沿用 Phase 17/18 的说明。

## Review 与修正

| 问题                         | 处理与验证                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| 视频可能选中封面流而非画面   | 显式区分 `attached_pic`；单元测试混合流顺序，真实文件含红色视频与绿色封面                       |
| 非方形像素导致预览失真       | 使用显示宽高比而非编码宽高比，输出方形像素；SAR 2:1 样本预期为 256×85                           |
| 旋转夹具没有真实旋转信息     | 首轮 GUI 发现；ffprobe 确认旧 `rotate` 标签未生成矩阵，改用 `display_rotation` 并先断言矩阵角度 |
| 无封面被误解为不能转换       | 中英文说明明确“没有可读取的内嵌封面”，任务仍可尝试转换；无封面 WAV 转 FLAC 专项验证             |
| 伪装播放列表触发外部读取     | 强制媒体容器、限制协议和 MOV 引用；三种扩展名的 HTTP 播放列表请求计数必须为 0                   |
| 仅以压缩文件大小估计解码内存 | 补选中视频流尺寸限制、单次分配限制及既有整体时限                                                |
| 扩展预览种类后文案条件散落   | 前端统一 `previewKind` 与 `previewPresentation`，按类别生成按钮、替代文本与说明                 |
| 大小契约接受负数或非有限数   | 前端预览入口拒绝负数、NaN、Infinity，补边界测试                                                 |

## 验证与复现

```bash
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol

TMPDIR=/home/ivmm/VERT/.desktop-local/phase19/tmp \
Z8_XDOTOOL=/tmp/z8-m0-deps/extracted/usr/bin/xdotool \
Z8_XDOTOOL_LIBRARY_DIR=/tmp/z8-m0-deps/extracted/usr/lib/aarch64-linux-gnu \
Z8_DEV_ENGINE_MANIFEST=/home/ivmm/VERT/.desktop-local/engines.json \
  xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- bun run desktop:test:media-preview
```

临时目录需先创建，路径按本机环境替换。GUI 脚本要求已有原生引擎、tauri-driver、WebKitWebDriver、Xvfb、D-Bus 和 xdotool。它使用隔离 XDG 配置与生成的测试输入，不处理实际用户文件。新增 `--media` 会同时执行图片和 PDF 回归，原有 `--pdf` 和图片专项入口继续可用。

最终 review 未发现本阶段尚未修复的阻断问题。结果如下：

| 检查                                    | 结果                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0                  | 各 144 项通过                                                                |
| Rust native / no-default-features       | 65 通过、1 ignored（既有进程 fixture）                                       |
| Rust native / development-engines       | 64 通过、1 ignored                                                           |
| Rust app                                | 7 项通过                                                                     |
| Svelte                                  | 0 errors / 0 warnings                                                        |
| 前端和原生构建                          | 通过                                                                         |
| Clippy、rustfmt --all、ESLint、Prettier | 通过                                                                         |
| linux-portal                            | 编译通过；不代表 strict Snap 运行验收                                        |
| 真实 Linux WebKit GUI                   | 34 项检查通过，20 个有效预览样本                                             |
| 媒体样本                                | 四种视频容器、三种视频变体、五种有封面音频容器                               |
| 图片 / PDF 回归                         | 五种图片、三个有效 PDF 预览，三页 PDF 原分辨率导出                           |
| 正式音频输出                            | 视频、带封面 MP3、无封面 WAV 均成功输出约 2 秒 FLAC，仅含一个音频流          |
| 异常与授权                              | 无封面、无视频流、损坏、超限、伪装播放列表、变更输入、重启授权、URL 释放通过 |

最终开发二进制 SHA-256：`3ec0014b006ba6014d70e5a7cc91a57f8d6d49ba824a7a091167fbfe1e773946`。[环境摘要](evidence/phase19/environment.json)、[源码收据](evidence/phase19/inputs.json)、[GUI 报告](evidence/phase19/preview-gui.json)和[证据清单](evidence/phase19/inventory.json)已归档。首轮旋转夹具失败与最终通过日志分开保存，最终 GUI 退出码为 0。

新增 Rust 测试覆盖视频/封面流选择、异常尺寸与编号、输入容器/协议限制；Node 测试补媒体分类、扩展名伪装与非法大小。全格式编码矩阵未重跑。

媒体预览的取消、移除和退出等待复用既有队列及进程机制，由 Rust 生命周期回归覆盖；本轮 GUI 不冒充媒体专项取消/退出故障注入。真实 GUI 脚本为本机专项入口，Node 契约与 Rust 测试进入已有 CI，本轮未触发远端工作流。

Windows/macOS 原生运行、MSIX/Snap strict 安装与签名仍待目标系统验收。旧安装候选不包含本阶段代码，需要重建；本阶段没有执行发布或商店上传。
