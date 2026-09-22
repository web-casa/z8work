# Phase 17：图片原生预览与资源限制

日期：2026-09-09。承接 [Phase 16](PHASE16_IMPLEMENTATION.md)，实现 [V1 方案](V1_PLAN.md) 中的图片预览、原文件与预览隔离、资源预算和清理要求。首轮提供现有图片输入的按需首帧预览；PDF、音视频和文档预览不在本阶段范围。

## 用户可见变化

- 已授权的 PNG、JPEG/JPG、WebP、AVIF、HEIC/HEIF 图片提供“预览原图”。无需先选择输出目录，也不需要浏览器解码原始 HEIC/AVIF。
- 点击后由原生 ImageMagick 生成最长边 256 像素的 PNG 快照，显示在当前文件行中。一次只显示一张；切换、关闭、重新选输入或移除任务会释放之前的预览。
- 生成中可取消；预览与转换互斥，避免两套解码同时占用资源。预览处理结束后可以正常转换。
- 预览失败不会将任务标为转换失败，也不会增加转换次数或覆盖已有结果。超过 32 MiB 的图片显示限制说明，仍可按既有转换条件处理。
- 关闭已经显示的预览，只关闭图片；如果此时正在转换同一文件，不会取消转换。
- 文件变更或授权失效时拒绝生成预览，并要求重新选择文件。刷新不恢复旧预览，完整重启还需要重新授权原文件。
- 底部退出说明同步 Phase 16：活动任务关闭时先询问，确认后才取消与清理。

[真实 HEIC 预览截图](evidence/phase17/preview.png)、[预览 GUI 报告](evidence/phase17/preview-gui.json)。预览沿用现有像素风格按钮与文件图标，没有新增图标库。

## 实现与授权边界

新增 `preview_input` 命令，只接收后端已经登记的任务 ID。命令注册在 handler、build manifest 和主窗口 capability，返回 `tauri::ipc::Response` 的二进制数据。没有开放任意路径、通用读文件、Shell 或前端进程管理权限。完整原图不经过 WebView；只传递有限大小的缩略图。[Tauri 二进制响应说明](https://v2.tauri.app/develop/calling-rust/#returning-array-buffers)

队列将原有输入句柄与 Stamp 复核拆为共享的 `prepare_input`，转换和预览继续复用该授权规则。预览生成前后都复核登记输入；检查失败会释放当前输入授权，界面可以重新选择。编码失败和预览预算失败本身不会撤销仍有效的原文件授权。

`src-tauri/native/src/convert/preview.rs` 复用原生转换的 `Job`、引擎来源验证、环境收口、显式 coder 和进程取消/超时机制。原文件从已授权句柄复制到独立临时目录，交给引擎的文件名为固定安全名称。首帧经过方向修正、缩小、sRGB、去除元数据和 8-bit RGBA PNG 编码，完成后检查 PNG 头、尺寸和字节数。

预览仅是显示快照，不用于评价原文件位深、动画、HDR 或完整色彩保真。转换继续从原始授权输入进行，未读取预览副本，也未更改原有转换参数或格式路由。

### 独立预算

| 项目               | 预览限制                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| 输入格式           | PNG、JPEG/JPG、WebP、AVIF、HEIC/HEIF                                     |
| 输入字节数         | 32 MiB；复制期间再次检查，文件变大也拒绝                                 |
| 输出               | 单帧 PNG，最长边 256 像素，不放大小图；最多 512 KiB                      |
| ImageMagick policy | memory 64 MiB、map 64 MiB、disk 128 MiB、宽高各 8000、线程 1、time 15 秒 |
| 处理 deadline      | 15 秒，覆盖复制检查、编码与输出检查；复用既有取消和进程回收              |
| 原生并发           | 同一队列最多一个预览或一个转换，不同时运行                               |
| 界面缓存           | 一个 Blob URL；替换、关闭、移除和卸载时 revoke                           |

这些是应用与 ImageMagick 层的预算，不等于操作系统对所有 codec 内部分配的硬内存隔离。文件系统读写和引擎来源检查使用同步调用，deadline 会在检查点生效；不声称能够立即中断任意阻塞文件系统调用。

临时目录由 RAII 管理，正常成功、失败及取消后删除，未将预览写入用户输出目录、任务历史或持久缓存。异常强杀/断电仍可能留下系统临时目录，不能把正常清理测试扩大为任意崩溃下的磁盘清理保证。预览不会在下次启动复用这些残留。

### 生命周期

队列新增仅存在内存中的预览占用标记；`Snapshot.processing` 包含预览生成状态，持久化 schema 仍为 2，不向历史写入预览字节或 URL。预览标记由 `PreviewGuard` 管理，正常、错误或展开退出时释放，并发布新快照。

`cancel` 会给相应预览发送取消信号；`remove` 和 `shutdown` 先取消，再等待预览函数返回和临时文件清理后释放占用。Phase 16 的空闲退出检查也计入预览。预览不会修改转换 phase、attempt 或保存结果；未知任务、重启后的旧 ID 和已变更文件均被拒绝。

前端 `platform/preview.ts` 管理唯一 URL 和请求代次。移除、关闭或卸载后的迟到响应被丢弃，不再创建 URL。再次请求重新从后端生成，不使用长期缓存；已显示内容明确标注为快照。CSP 只在 `img-src` 加入 `blob:`，没有扩大脚本或网络连接权限。

## Review 与修正

| 问题                                               | 修正及证据                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 原生能解码 HEIC/AVIF 不代表 WebView 可以显示原文件 | 原生输出受限 PNG，五类真实输入均在 WebKit 中解码为 256×192                                                                 |
| 预览可能越过原有输入授权或要求无关输出授权         | 只接受任务 ID，复用打开句柄与 Stamp；未选择输出目录也能预览，伪造 ID/变更输入/重启旧 ID 均拒绝                             |
| 文件变化后仍显示为已授权，用户难以重新选择         | 预览授权复核失败时同步撤销输入授权；真实 GUI 与 Rust 测试断言 authorized 为 false                                          |
| 预览与转换、清空或退出并发可能留下进程             | 与队列统一占用、取消和等待；Rust 覆盖取消、移除/退出等待及失败后恢复                                                       |
| 关闭已显示预览可能误取消新开始的转换               | 只有仍在生成预览时才请求取消；真实 GUI 关闭预览后转换完成且原始尺寸保持 1024×768                                           |
| `PNG32` 被当前限制性策略拒绝                       | 首轮真实 GUI 复现；改为已允许的 `PNG` coder，加 `png:color-type=6`，保留原有安全策略                                       |
| URL 泄漏和迟到结果重新出现                         | 单 URL 控制器与代次检查；单元测试覆盖替换、关闭、dispose 和迟到响应，真实 WebView 跟踪 create/revoke 后数量及 URL 对应一致 |
| 预算限制被误当成不支持转换                         | 预览失败与转换状态分离；真实有效 PNG 加尾部填充超过 32 MiB 后预览拒绝，仍成功转换 WebP                                     |
| 新样式未落入桌面实际 CSS 入口                      | 截图走查后写入 `desktop/src/style.css`，补按钮间距、图片边框与说明字号                                                     |
| 旧退出文案和格式检查范围遗漏                       | 更新底部说明；Rust 使用 `cargo fmt --all --check`，覆盖 native 子包及主应用                                                |

最终 review 未发现本阶段尚未修复的阻断问题。预览只是 V1 图片部分；PDF 页面预览、媒体封面和原生安装件验收仍单独推进。

## 验证

| 检查                                                      | 结果                  | 范围                                                                                                      |
| --------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| Rust native / no-default-features                         | 62 通过，1 ignored    | 新增 5 项预览输出与授权/生命周期测试；ignored 是既有进程子测试 fixture                                    |
| Rust native / development-engines                         | 61 通过，1 ignored    | 功能开关的测试集合不同                                                                                    |
| Rust app                                                  | 7 项通过              | 既有退出与应用诊断回归                                                                                    |
| Node 22.22.2 / 24.18.0                                    | 各 142 项通过         | 新增 4 项预览契约、资源释放、迟到响应与并发/重试测试                                                      |
| Svelte 检查                                               | 0 errors / 0 warnings | 桌面入口                                                                                                  |
| 构建、Clippy、rustfmt --all、ESLint、Prettier、actionlint | 通过                  | 当前代码与配置                                                                                            |
| linux-portal 编译                                         | 通过                  | 新命令与既有 portal 功能开关共同编译；不作为 Snap strict 安装证据                                         |
| 原生预览 GUI                                              | 通过                  | PNG/JPEG/WebP/AVIF/HEIC 五类输入、10 项行为检查，实际 WebKit 解码                                         |
| 原生转换 GUI                                              | 通过                  | 两个图片结果、批量 AVIF、五页 PDF 部分取消/刷新续转、权限拒绝、单实例、清空保留输出                       |
| 原生退出 GUI                                              | 通过                  | Phase 16 的 13 项真实窗口关闭、确认、清理与重启回归                                                       |
| 预览取消/移除/退出等待                                    | Rust 测试通过         | 队列测试使用受控 renderer；通用真实进程 deadline/取消由既有 process 测试覆盖，不冒充预览 GUI 专项故障注入 |
| Windows/macOS GUI、MSIX/Snap strict 安装                  | 未执行                | 当前 Linux ARM64 开发机不能替代目标系统                                                                   |
| 所有 76 条转换路线重跑                                    | 未执行                | 本阶段未修改正式编码路径                                                                                  |

新前端测试纳入 Linux desktop 全量测试及 Windows 显式列表，原生测试由既有 native 全量 CI 运行；本轮未推送或触发远端工作流。

## 复现与证据

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
  dbus-run-session -- bun run desktop:test:preview
```

需要本机已有原生引擎、tauri-driver、WebKitWebDriver、Xvfb、D-Bus、xdotool；上述路径按实际开发机替换。脚本使用隔离 XDG 配置与自行生成的输入，不处理真实用户文件。

最终开发二进制 SHA-256：`1ec8433484491496cfaac696d9893b43519dc0c1229607cc00f88a03e9d208f3`。参见 [环境摘要](evidence/phase17/environment.json)、[源码收据](evidence/phase17/inputs.json)、[证据清单](evidence/phase17/inventory.json)、[转换 GUI](evidence/phase17/conversion-gui.json)和[退出 GUI](evidence/phase17/quit-gui.json)。早期 PNG32 失败与后续通过日志分开归档。

此前 MSIX、Snap 候选没有覆盖新代码，仍需重建和原生安装验证。Windows/macOS 文件授权、原生菜单与进程生命周期、商店提交材料和完整许可证/源码闭环继续是发行前置条件。
