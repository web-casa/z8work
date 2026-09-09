# Phase 16：转换中退出确认

日期：2026-09-09。承接 [Phase 15](PHASE15_IMPLEMENTATION.md)，完成 [V1 方案](V1_PLAN.md) 中的“任务进行中退出提示”，并完成 Linux ARM64 原生 GUI 验证、回归和 review。Windows 安装验收、Snap strict 安装和 macOS 实机验收仍待完成。

## 用户可见变化

- 有运行或排队的转换时，关闭主窗口会先询问“停止并退出 / 留在应用”。原生系统菜单退出也接入同一后端入口；本轮实际操作验证的是 Linux 窗口关闭。
- 点击“留在应用”、按 Escape 或关闭确认框不会取消任务。Linux 默认焦点和 Enter 操作为“留在应用”。确认框打开期间队列仍可正常完成。
- 选择退出后，取消运行及排队任务，等待工作线程与编码进程清理完成才退出；原文件和已经保存的结果保留。重启后恢复任务记录，但需要重新选择文件及输出目录并手动重试。
- 没有活动任务时直接清理退出。尚未启动的列表项目保留在历史中，不因退出而转换。
- 原生文件选择框已打开时，先完成或取消该选择，再关闭主窗口；不会叠加退出确认框。
- 显式简体中文/English 偏好对应各自确认文案。“跟随系统”或偏好读取失败时使用中英双语，保证 WebView 尚未加载时也能提示；不依赖前端语言回调。
- 原生窗口标题移除旧 `Desktop Phase 3` 字样。

[中文确认框](evidence/phase16/confirmation-zh.png)、[英文确认框](evidence/phase16/confirmation-en.png)、[退出 GUI 结果](evidence/phase16/quit-gui.json)。确认框采用原生桌面组件，现有工作区继续使用像素风格。

## 实现与边界

`src-tauri/src/quit.rs` 管理原子退出状态：空闲 → 请求处理中 → 清理完成。`CloseRequested` 和 `ExitRequested` 共用 `allow_exit`；重复请求在同一次确认/清理期间被拦截。取消确认后回到空闲；只有 `Queue::shutdown()` 返回、工作线程 join 完成后才允许最终退出。

检查队列、读取偏好和等待选择在专门的辅助线程执行。Linux GTK 对话框通过 `run_on_main_thread` 创建并以 response 回调回复；不嵌套主事件循环。确认框与现有原生文件选择框共用互斥标记。

`Queue::prepare_idle_exit()` 在队列 Mutex 内检查正在运行、排队及清空状态，只有真正空闲才同时设置 closing。这样不会出现“快照为空闲 → 新批次提交 → 未经确认取消新批次”的间隙。有活动任务时该方法不取消、不暂停、不改写任务。队列状态无法读取时，文案明确说明未知，并仍要求确认。

Linux 直接复用 Tauri 已使用的 GTK 0.18.2。review 发现锁定版本的 rfd 0.16.0 在 `xdg-portal` 模式下通过宿主 `zenity` 实现消息框；因此这里避免调用该路径，文件选择仍保留既有 GTK/portal 功能开关。Cargo 新增 GTK 直接依赖，使用已有锁定版本，没有新增 GTK 版本。Windows/macOS 复用 `tauri-plugin-dialog` 的原生消息框，只接受明确的肯定响应；取消、关闭和未知响应均不授权退出。[Tauri 消息框 API](https://docs.rs/tauri-plugin-dialog/2.7.3/tauri_plugin_dialog/struct.MessageDialogBuilder.html)、[GTK response 与默认按钮 API](https://gtk-rs.org/gtk3-rs/stable/latest/docs/gtk/prelude/trait.DialogExt.html)

本阶段没有新增 IPC 命令、路径授权、前端进程管理权限或测试后门。已有进程组/Job Object/watchdog 和输出保存逻辑继续负责取消、回收与结果保留。强制结束进程、系统断电等情形不可能保证出现确认框，仍走已有异常恢复语义。

## Review 发现与修正

| 问题                                                      | 修正与验证                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 原关闭路径直接取消转换                                    | 加入统一确认入口；真实 GUI 覆盖继续与退出                                                                               |
| 独立快照检查与提交之间存在竞态                            | 在同一个队列锁内检查空闲并设置 closing；测试晚到提交被拒绝，已有未开始任务保留                                          |
| 重复窗口/菜单请求可能重复弹窗，或在清理结束前退出         | 原子 Gate 只有一个请求拥有确认；20 个并发请求只产生一个 Start；最终退出必须等待 finish                                  |
| 关闭确认框可能被误当作肯定选择                            | 严格匹配肯定响应；测试中文、英文、双语及未知队列文案，真实 GUI 覆盖 Escape/窗口关闭                                     |
| 默认按钮可能误停任务                                      | Linux 显式设置“留在应用”的默认响应与焦点，真实 Enter 操作验证通过；其他系统仍需原生按键验收                             |
| portal 消息框隐式依赖宿主 zenity                          | Linux 改用已有 GTK；`linux-portal` 构建检查通过，不据此声称 Snap strict 实测通过                                        |
| 原生选择框与退出确认可能叠加                              | 共用对话框标记；实际选择框打开时关闭主窗口，选择和队列均保留                                                            |
| 测试假定提交参数顺序决定执行顺序                          | 队列实际按导入顺序执行；改用后导入的独立排队样本，先断言 queued，再验证退出后 cancelled                                 |
| 多轮 GUI 操作可能比真实编码更慢，空闲退出被误报为缺确认框 | 仅在退出交互检查期间对测试进程拥有的编码器发送 SIGSTOP，随后 SIGCONT 并验证实际保存；第二次确认退出使用正常运行的编码器 |

最终 review 未发现本阶段尚未修复的阻断问题。跨平台安装和系统菜单交互仍是下方明确保留的未执行项。

## 验证结果

| 检查                                     | 结果                  | 范围                                                                                                                                       |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Rust native / no-default-features        | 57 通过，1 ignored    | 新增 3 项退出边界测试；ignored 为既有进程子测试 fixture                                                                                    |
| Rust native / development-engines        | 56 通过，1 ignored    | 功能开关导致测试集合不同                                                                                                                   |
| Rust app / development、packaged         | 各 7 项通过           | 新增 4 项退出状态和响应测试；packaged 也是本机单元测试，不是安装验收                                                                       |
| Node 22.22.2 / 24.18.0                   | 各 138 项通过         | 既有桌面 UI 契约和工具回归                                                                                                                 |
| Svelte 类型检查                          | 0 errors / 0 warnings | 桌面入口                                                                                                                                   |
| Rust 构建、Clippy、rustfmt               | 通过                  | 当前开发应用及工作区                                                                                                                       |
| linux-portal 编译检查                    | 通过                  | 退出确认可与 portal 文件选择功能开关共同编译                                                                                               |
| ESLint、Prettier、actionlint             | 通过                  | 新脚本、配置与 CI                                                                                                                          |
| 原生退出 GUI                             | 13 项检查通过         | 单确认框、Escape/留在应用/Enter/关闭确认框、确认期间完成、进程回收、重启取消状态、授权失效、保留原文件和已保存文件、临时输出清理、空闲退出 |
| 原生偏好 GUI 回归                        | 通过                  | 语言和参数持久化、刷新、完整重启、写入失败重试、坏记录保留、IPC 校验                                                                       |
| 原生转换 GUI 回归                        | 通过                  | 2 个图片结果、批量 AVIF、5 页 PDF 部分取消和刷新后续转、重复请求、权限拒绝、单实例、清空保留输出                                           |
| Windows/macOS 原生退出、系统菜单及快捷键 | 未执行                | 需要目标系统；两个退出事件共用入口的源码和 Gate 测试不能替代原生菜单操作                                                                   |
| MSIX/Snap strict 安装、升级与商店审核    | 未执行                | 当前主机为 Linux ARM64；此前安装待办继续保留                                                                                               |
| 完整 76 条编码路线重跑                   | 未执行                | 本阶段未调整编码参数或格式路由                                                                                                             |

GUI 脚本 `scripts/desktop-quit-gui.mjs` 使用独立 XDG 目录、仓库样本和自建大图，通过 tauri-driver 操作真实 Tauri/WebKit 应用。`scripts/lib/desktop-quit-window.py` 使用 ICCCM `WM_DELETE_WINDOW` 请求真实关闭，使用限定测试应用 PID 的 AT-SPI 点击原生按钮；不使用会绕过关闭处理的 `XDestroyWindow`，也不添加生产测试 IPC。

为了稳定覆盖多个确认动作，第一轮 GUI 暂停的是它自己发现的原生编码子进程，不是应用或其他转换程序；恢复后验证任务真正保存。第二轮正常运行的编码器在确认退出后消失，排队项被取消。通用后代进程回收由已有 Rust 进程测试覆盖，不把单个 GUI PID 检查扩大为三端进程树实测。

新 Gate 测试加入已有 packaged-app 三系统 CI job 的 `cargo test`，原生队列测试由已有 native 全量 job 执行。远端工作流未在本轮触发。早期脚本失败日志保留在本地 `.desktop-local/phase16/`，最终通过证据单独归档。

## 复现与证据

```bash
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-desktop --features development-engines,custom-protocol
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol

Z8_XDOTOOL=/tmp/z8-m0-deps/extracted/usr/bin/xdotool \
Z8_XDOTOOL_LIBRARY_DIR=/tmp/z8-m0-deps/extracted/usr/lib/aarch64-linux-gnu \
Z8_DEV_ENGINE_MANIFEST=/home/ivmm/VERT/.desktop-local/engines.json \
  xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- bun run desktop:test:quit
```

GUI 还需要 `tauri-driver`、WebKitWebDriver、Python 3 的 GI/Atspi、libX11、ImageMagick `import`、Xvfb 和 D-Bus。这里的路径是本机实际路径，其他开发机应替换。该测试是 Linux 开发环境测试；其他平台按其原生自动化及人工验收执行。

最终开发二进制 SHA-256：`c0e42e82fb05b331da4d1e80fc93daf497346704b1a899a71da8623fda70ecbc`。源码收据记录实际工作区输入，不用未提交功能之外的 HEAD 代替当前代码。详见 [环境与二进制摘要](evidence/phase16/environment.json)、[源码收据](evidence/phase16/inputs.json)、[证据清单](evidence/phase16/inventory.json)、[转换回归](evidence/phase16/conversion-gui.json)和[偏好回归](evidence/phase16/preferences-gui.json)。

Phase 13 的 MSIX 与此前 Snap 候选保持原样，不包含 Phase 15/16 功能，需要重建并完成原生安装验收才能作为新候选。Phase 15 已验证二进制另存于 `.desktop-local/phase15/z8-desktop-verified`。下一项本机可推进的产品功能是受资源预算约束的原生预览；跨平台安装、权限与许可验收仍是发行前置条件。
