# 桌面版 M0：第一轮实现与 review

本文保留 M0 第一轮实现记录；当前队列、恢复与单实例实现见 [Phase 1 / M1 实施记录](PHASE1_IMPLEMENTATION.md)。

日期：2026-09-08。应用基线 `c554d15` 加本轮工作区修改；尚未提交或发布。开发环境为 Debian 13 / Linux ARM64，Rust 1.96.0、Bun 1.4.0、GTK 3.24.49、WebKitGTK 2.52.5。

本轮已跑通 Tauri 窗口和四类原生转换。这是 **M0 的开发原型阶段**，不是 V1 完成，也没有完成 [V1 方案](V1_PLAN.md) 中的整个 M0 验收：随包引擎、Windows MSIX、Linux amd64 strict Snap 和 macOS 实机验证仍未执行。不能把本机开发引擎当成可分发安装包。

## 已实现

- `desktop/`：独立 Vite/Svelte 桌面入口，复用网页的像素图标、配色和字体，提供中英文切换、文件列表、输出格式、保存目录、批量执行、取消和清空。网页 SvelteKit 路由、SEO 和 WASM 转换入口继续独立构建。
- `src-tauri/`：Tauri 2 外壳和 Rust 文件登记。只有原生选择器选中的输入与输出目录进入会话；前端传文件 ID 与输出枚举，不传文件正文、任意命令或自行填写的路径。
- `src-tauri/native/`：与窗口分离的 Rust 原生转换库。当前使用显式指定的 ImageMagick、FFmpeg/ffprobe、Pandoc、MuPDF 程序；不查询 PATH，不自动下载，不调用网页 WASM。
- 原生主窗口只授权六个自定义命令；未启用通用 shell、文件读取、updater 或远程页面权限。CSP 限制前端远程连接；这不等于子进程获得了操作系统沙箱。
- 每个任务使用私有临时目录和固定引擎文件名，输出经过验证后用 `persist_noclobber` 保存。同名结果增加编号，不覆盖原文件或已有结果。清空列表保留已保存文件。
- 一个原生转换同时运行；前端目前逐项派发批量任务，完整 Rust 队列、事件、重启恢复和单实例属于 M1。
- Unix 进程组 / Windows Job Object 由 `process-wrap` 管理。两条日志管道同时读取，各保留最后 8 KiB 原始字节；总转换预算 120 秒，不因进度重置。取消和退出触发进程清理。退出状态会拒绝后续任务，等待当前清理完成再关闭窗口。

本轮没有给桌面端显示“实测上传流量 0 B”。界面准确描述为本地处理、没有接入上传服务；未实现系统网络流量计量，也未证明所有宿主引擎依赖均无联网行为。

## 原型开放的转换范围

| 输入                             | 输出                  | 当前限制                                                        |
| -------------------------------- | --------------------- | --------------------------------------------------------------- |
| PNG、JPEG、WebP、AVIF、HEIC/HEIF | PNG、JPEG、WebP、AVIF | 只转换首帧；质量 75，结果可能变大；JPEG 透明区域铺白底          |
| PDF                              | PNG、JPEG、WebP、AVIF | 只渲染首页，96 DPI，尺寸上限 4096 × 4096；不支持密码输入        |
| MP3、WAV、FLAC、OGG、M4A         | WAV                   | 第一条音轨，PCM 16 位；不代表已完成全部音频格式的质量与保真测试 |
| Markdown、DOCX                   | TXT                   | 仅提取文本，明确不保留图片、排版和格式                          |

输入上限每个 512 MiB、列表 100 个文件。ImageMagick 配置限制资源、coder、delegate、filter 和间接文件引用；Pandoc 使用 `--sandbox`。这些是原型保护措施，尚未完成宿主配置冲突、恶意文件、大输出、内存峰值、进程逃逸和系统资源隔离验收。

格式列表是此原型的显式路由，不是全部组合经过验收的能力矩阵。本轮真实样本覆盖见下表；其他输入组合仍需补测，尤其 DOCX、M4A、ICC/EXIF、动画、多页和超大文件。网页的 23 种 PDF 输出不等同于此桌面原型的功能范围。

## 开发运行

需在有图形会话的 Linux/macOS/Windows 开发环境准备 Rust 和 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)，执行 `bun install --frozen-lockfile`。本轮实际只运行了 Linux ARM64。

先显式指定本机开发引擎。以下是此次 Debian 验证用的真实路径；`/tmp/z8-m0-deps` 是本轮解压的 Debian 包，临时文件清理后须重新准备。在其他机器上替换为当地实际路径，不要照抄临时目录。

```sh
bun run desktop:prepare \
  --magick /usr/bin/magick \
  --ffmpeg /usr/bin/ffmpeg \
  --ffprobe /usr/bin/ffprobe \
  --pandoc /tmp/z8-m0-deps/extracted/usr/bin/pandoc \
  --pandoc-data-dir /tmp/z8-m0-deps/extracted/usr/share/pandoc/data \
  --mutool /tmp/z8-m0-deps/extracted/usr/bin/mutool \
  --mutool-library-dir /tmp/z8-m0-deps/extracted/usr/lib/aarch64-linux-gnu

export Z8_DEV_ENGINE_MANIFEST="$PWD/.desktop-local/engines.json"
bun run desktop:dev
```

`desktop:prepare` 不安装系统软件、不下载引擎。它检查版本并记录可执行文件 SHA-256，生成 gitignored 的开发清单。哈希不证明发布者身份，也不涵盖所有 DLL、动态库、配置、字体和数据文件。Linux 的 `--mutool-library-dir` 仅用于本轮解压库的开发验证；其他系统需要对应的依赖布局。

仅有 `development-engines` 编译 feature 才接受开发清单。默认构建和 `kind: bundled` 均拒绝启用转换；当前没有受认可的生产引擎包，`bundle.active` 为 `false`。不要用开发配置生成商店候选。

前端预览：`bun run desktop:frontend`（127.0.0.1:1420）。普通浏览器会提示需要在桌面程序打开，不能执行原生转换。网页原有的 `bun run dev` 不受影响。

## 检查命令

```sh
bun run desktop:check
bun run desktop:build
bun run desktop:test
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo test --locked --manifest-path src-tauri/Cargo.toml --workspace --features development-engines,custom-protocol
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --workspace --all-targets --features development-engines,custom-protocol -- -D warnings

# 沿用上面设置的 Z8_DEV_ENGINE_MANIFEST；任务有限，失败返回非零状态
bun run desktop:smoke
```

不运行 Vite 也能测试包含静态页面的本地调试程序：

```sh
bun run desktop:build
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol
./src-tauri/target/debug/z8-desktop
```

Linux 原生 WebKit 自动检查另需 `tauri-driver`、`WebKitWebDriver`、Xvfb 和 D-Bus。先在一个终端运行（该终端也须设置引擎清单）：

```sh
xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- tauri-driver --port 4456 --native-port 4457
```

另一个终端执行 `bun run desktop:gui:smoke`。此脚本验证真实 WebKit 窗口、引擎状态、中英文切换和 IPC 拒绝，保存截图并关闭自己的会话。它不替代原生文件选择器和商店权限测试。输入与保存目录的完整交互，本轮另用 GTK 原生对话框和 xdotool 完成。

新增 [.github/workflows/desktop.yml](../../.github/workflows/desktop.yml) 会在 PR 中检查前端，并在 Linux、Windows、macOS runner 上检查原生库。当前只完成本机命令执行，**远端 CI 尚未运行**；此工作流不构建或发布商店安装包。

## 实测证据

| 检查                                                  | 结果   | 范围                                                                                                                         |
| ----------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 桌面 Svelte 检查、前端构建、改动源码 ESLint           | 通过   | 独立入口；前端不包含转换 WASM                                                                                                |
| Rust workspace 测试与 Clippy                          | 通过   | 开发 feature：原生库 7 项 + 窗口状态 1 项；子进程 fixture 标记 ignored，由 4 项进程测试实际调用                              |
| 默认 feature 测试                                     | 通过   | 原生库 8 项，含开发清单不能启用已编译禁用功能的检查                                                                          |
| 四类真实引擎转换                                      | 通过   | 9 个样本：PNG→PNG/JPEG/WebP/AVIF、10-bit HEIC→PNG、MP3→WAV、Markdown→TXT、PDF→PNG/AVIF；文本内容断言，其余用 FFmpeg 完整解码 |
| 文件与失败行为                                        | 通过   | 中文和特殊符号名称、同名结果编号、原件保留、损坏 PNG、开始前取消、临时文件清理、不支持路由、引擎哈希不符                     |
| 进程生命周期                                          | 通过   | 双管道大日志、非零退出、运行中取消、总超时、实际启动的后代进程被终止；本机 Unix 路线                                         |
| 原生窗口与文件选择                                    | 通过   | WebKit/GTK、PNG→WebP 保存后解码、清空不删除结果；伪造 ID 和通用文件读取被拒                                                  |
| 网页回归                                              | 通过   | `bun run check` 0 errors / 0 warnings；`bun run test` 180/180                                                                |
| Windows/macOS 原生运行、全部格式保真                  | 未执行 | 需要对应环境与完整样本矩阵                                                                                                   |
| 自包含引擎包、MSIX、strict Snap、签名、安装/升级/商店 | 未执行 | 本轮没有安装包，尚未准备可分发引擎布局和渠道身份                                                                             |

证据：[引擎与样本报告](evidence/linux-arm64-native-smoke.json)、[窗口与 IPC 报告](evidence/linux-arm64-gui-smoke.json)、[原生文件流程报告](evidence/linux-arm64-gui-io.json)、[桌面截图](evidence/linux-arm64-desktop.png)。证据对应本轮工作区和开发机，报告中的输出哈希用于记录样本，不是安装包哈希或固定字节测试基准。转换样本来自仓库测试资源及生成的 PDF/文本，不使用用户的私人图片。

## Review 与已修复问题

1. **Pandoc 只携带程序会运行失败**：首轮 Markdown 转文本报缺少 `data/abbreviations`。增加显式数据目录，补齐配套数据后通过真实转换。MuPDF 同样需要配套动态库；正式打包须核验所有依赖。
2. **退出与下一项任务存在竞态**：单靠前端捕获 `Cancelled` 不足以处理恰好完成当前任务的情况。Rust 会先锁定 closing 状态，阻止后续转换，等待当前任务清理后关闭；增加关闭状态测试。
3. **Windows 创建标志类型不匹配**：静态核对 `process-wrap` 的真实 API 后改用 `CREATE_NO_WINDOW`，由包装器与 Job Object 的挂起启动组合。Windows 编译与实机证据仍须由对应 runner 提供。
4. **桌面图标编码不符合 Tauri 要求**：沿用现有 Z8.Work 图标，通过 Tauri icon 工具转换为 RGBA，未重新设计图标。
5. **构建文件误入 ESLint**：显式排除桌面 dist、Rust target/gen 和本地证据目录。源码检查继续执行。
6. **开发与发行状态容易混淆**：使用独立 M0 应用身份，界面明确原型限制，默认拒绝开发引擎，不启用打包或发布操作。

## 下一阶段

继续 M0：冻结所需的最小原生引擎构建、运行库/数据/字体布局、许可证及源码材料，准备 Windows x64 与 Linux amd64 的最小安装候选并做真实文件授权/保存验证，再补 macOS arm64。之后进入 M1，迁移完整 Rust 队列、事件和会话恢复。当前原型不具备自包含、生产沙箱、商店发布或完整网页功能等价性。
