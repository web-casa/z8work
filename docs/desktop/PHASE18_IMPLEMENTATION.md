# Phase 18：PDF 首页原生预览

日期：2026-09-09。承接 [Phase 17 图片预览](PHASE17_IMPLEMENTATION.md)，补充 [V1 方案](V1_PLAN.md) 的 PDF 预览适配。桌面继续使用本地原生 MuPDF，不增加 WASM、网络服务或新的依赖。

## 用户可见变化

已授权、32 MiB 以内的 PDF 提供“预览首页”。预览在当前文件行显示，最长边 256 像素，明确标注首页快照。中英文文案、图片替代文本均区分 PDF 首页和图片首帧；无需先选择输出目录。

预览失败会显示错误，仍允许尝试正式转换，但不保证损坏、加密或超出转换限制的文件可以成功转换。本阶段没有密码输入、翻页、缩放或整本文档阅读器。

正式 PDF 转换沿用原有逐页流水线、分辨率设置、部分结果与重试规则。预览不增加转换次数、不修改转换状态，也不作为正式编码输入。三页红/绿/蓝测试文档只预览红色首页；正式 PNG 导出仍得到三张 1440×960 的不同颜色页面。

[英文截图](evidence/phase18/pdf-preview.png)、[中文截图](evidence/phase18/pdf-preview-zh.png)、[真实预览报告](evidence/phase18/preview-gui.json)。截图中的纯色页面是自动生成的测试 PDF，用来辨别页码与方向。

## 实现与边界

`preview_input` 继续只接收已登记任务 ID，不接收任意路径、页码或引擎参数。复用 Phase 17 的输入句柄与 Stamp 复核、队列互斥、取消、移除/退出等待、受限二进制 PNG 响应、单 Blob URL 与迟到响应清理；不增加 IPC 权限或持久化 schema。

`src-tauri/native/src/convert/preview.rs` 在相同临时目录与原始授权输入复制流程后选择 PDF 渲染分支：

```text
mutool draw -q -L -D -m 67108864 -F png -c rgba \
  -r 72 -w 256 -h 256 -o preview.png input.pdf 1
```

显式指定页码 `1`，防止默认渲染所有页面。`-r` 配合宽高上限保持比例，`-D` 禁用 display list，`-L` 启用低内存模式。参数已核对本机 MuPDF 1.25.1 帮助及 [MuPDF 官方 draw 文档](https://mupdf.readthedocs.io/en/1.28.1/tools/mutool-draw.html)。实际执行使用受验证的引擎路径与参数数组，不经过 Shell。

MuPDF 支持 PDF 之外的文档，所以该分支在渲染前要求文件从 `%PDF-` 开始。此检查用于排除明显伪装扩展名的文档，并非完整 PDF 结构或安全性验证；结构仍由 MuPDF 解析。带前置垃圾的非标准 PDF 可能被预览拒绝，即便正式转换能够修复读取。

| 预算     | 限制                                                  |
| -------- | ----------------------------------------------------- |
| 输入     | 32 MiB，复制过程中再次检查                            |
| 页面     | 固定首页，不做全书页数预检                            |
| 输出     | PNG，最长边 256 像素，最多 512 KiB                    |
| MuPDF    | `-m` 64 MiB，低内存、无 display list                  |
| 总时限   | 共用 15 秒 deadline，覆盖复制检查、渲染和输出检查     |
| 生命周期 | 同队列与转换互斥；正常成功、失败、取消后清理临时目录  |
| 前端     | 一张快照，一个 Blob URL；关闭、替换、移除、卸载时释放 |

无需为了渲染首页先执行无内存限制的 `mutool show` 页数预检。测试中的 201 页 PDF 可以预览首页，但正式导出的既有 200 页上限仍适用。预览能力不代表可以完整转换；两者的资源限制独立。

MuPDF 的内存参数是引擎层限制，不能视为操作系统级别的所有内存分配隔离；同步文件系统调用的 deadline 检查点和异常强杀可能残留临时目录的限制与 Phase 17 相同。PDF 快照用于辨识内容，不承诺精确校样、表单交互或执行 PDF JavaScript。

## Review 与修正

| 检查点                           | 处理                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| 忘记页码导致遍历整本 PDF         | 固定 `1`；三色多页和 201 页 PDF 实测首页像素                                   |
| 文档预检先消耗大量资源           | 首页预览仅一次受控 `draw`，省去页数预检                                        |
| MuPDF 自动识别其他文档类型       | 增加 PDF 文件头检查，伪装 SVG 被拒绝                                           |
| 横竖方向、PDF 页面旋转           | 不使用强制拉伸；真实 90° 旋转页面得到 171×256                                  |
| 预览改变正式输出尺寸或页数       | 真实三页 PNG 输出逐页验证尺寸和颜色                                            |
| 空文档、损坏、加密或超限卡住队列 | 实测均返回错误，任务仍为 ready、attempt 不变、授权仍有效，随后正常文件可以预览 |
| 错误文案暗示转换必定成功         | 改为“仍可尝试转换”；超限提示明确转换有独立限制                                 |
| 资源与权限扩张                   | 沿用已有队列与 PNG 响应，不增加路径权限、缓存或后台服务                        |

最终 review 未发现本阶段尚未修复的阻断问题。本阶段不改变正式 PDF 编码路径；发行与验证边界见下节。

## 验证与复现

使用隔离 XDG 目录及生成的测试输入，未读取用户实际文档。执行入口：

```bash
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol

Z8_XDOTOOL=/tmp/z8-m0-deps/extracted/usr/bin/xdotool \
Z8_XDOTOOL_LIBRARY_DIR=/tmp/z8-m0-deps/extracted/usr/lib/aarch64-linux-gnu \
Z8_DEV_ENGINE_MANIFEST=/home/ivmm/VERT/.desktop-local/engines.json \
  xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- bun run desktop:test:pdf-preview
```

命令需要本机原生引擎、tauri-driver、WebKitWebDriver、Xvfb、D-Bus 与 xdotool；路径按环境调整。`desktop:test:preview` 保留图片专项入口；新增 `--pdf` 同时执行图片回归与 PDF 检查，公用同一 GUI harness，避免复制窗口/选择器驱动代码。

| 检查                                    | 结果                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0                  | 各 143 项通过，新增 PDF 预览输入预算契约                                                        |
| Rust native / no-default-features       | 62 通过、1 ignored（既有进程 fixture）                                                          |
| Rust native / development-engines       | 61 通过、1 ignored                                                                              |
| Rust app                                | 7 项通过                                                                                        |
| Svelte                                  | 0 errors / 0 warnings                                                                           |
| 前端、原生构建                          | 通过                                                                                            |
| Clippy、rustfmt --all、ESLint、Prettier | 通过                                                                                            |
| linux-portal                            | 编译通过；不代表 strict Snap 运行验收                                                           |
| 真实 Linux WebKit GUI                   | 22 项行为检查通过，5 种图片与 3 种有效 PDF 预览                                                 |
| PDF 正式导出                            | 三页 PNG 尺寸、颜色和页数均通过                                                                 |
| 授权、URL、取消/移除/退出等待           | 复用既有 Rust/前端测试；本轮 GUI 验证变更输入、重启、URL 释放，不冒充 PDF 专项取消/退出故障注入 |

PDF 预算契约随既有 Node 测试进入 CI；PDF 原生 GUI 脚本为有真实引擎的本机专项入口，本轮没有触发远端 CI。全格式转换矩阵和其他平台 GUI 未重跑。

最终开发二进制 SHA-256：`0cf985dc9b2f2b1dcbdf30745cb461f4a761ee81e1ec63264b49a396be9e59bf`。[环境摘要](evidence/phase18/environment.json)、[源码收据](evidence/phase18/inputs.json)、[证据清单](evidence/phase18/inventory.json)与 [GUI 报告](evidence/phase18/preview-gui.json)已归档；收据复核 292 个源码/配置文件未变。

环境排障：首轮 GUI 行为断言通过，但随后 `/tmp` inode 耗尽，导致最终重编译与 Xvfb 启动失败。将旧上游 review 候选的 `node_modules` 缓存移至 `.desktop-local/phase18/archived-tmp/upstream-review-node_modules` 保留，释放 inode；本轮使用 `.desktop-local/phase18/tmp` 作为 TMPDIR，重新构建并运行最终 GUI，退出码为 0。失败日志与最终通过证据分开保留。

Windows/macOS 原生 GUI、MSIX 与 Snap strict 安装验收不在本机执行范围。旧发行候选未包含本阶段代码，需重建再验收；媒体封面预览、原生跨平台验证和商店发行条件继续按 V1 方案推进。
