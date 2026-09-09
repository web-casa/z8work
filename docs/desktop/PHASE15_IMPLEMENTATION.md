# Phase 15：桌面偏好持久化与恢复

日期：2026-09-09。完成桌面偏好的原生保存、双语界面接入、失败恢复、真实 Linux ARM64 GUI 验证与 review。承接 [V1 方案的平台设置要求](V1_PLAN.md)，补齐之前只保存在界面内存中的偏好。

Phase 14 的 Windows 签名/侧载验收仍缺原生 Windows x64 测试桌面，本轮没有将其改记为通过。本阶段推进可在本机实际验证的产品功能。

## 用户可见变化

- 右上角语言可选“跟随系统 / 简体中文 / English”，刷新和重启后保留。首次使用跟随 WebView 的系统首选语言：中文显示简体中文，其他语言回退英文；明确选择的语言优先。
- 批量目标格式、图片质量、元数据开关和 PDF DPI 会保留。空列表也能展开批量设置，先选参数再导入文件。
- 参数仍需点击“应用到兼容文件”才写入已有任务；保存偏好本身不更改任务、不自动开始转换。单文件参数仍独立控制。
- 偏好保存失败时保留当前窗口的选择，并明确显示“尚未保存”和重试按钮。读取失败保留原文件，提供重新读取入口；队列和单文件转换不依赖偏好文件成功读取。
- 顶部移除过时的 `PHASE 3` 字样，保留现有像素图标和“开发原型”说明。网页设置与网页转换代码未改动。

[真实桌面截图](evidence/phase15/preferences.png)、[偏好 GUI 结果](evidence/phase15/preferences-gui.json)、[转换 GUI 回归结果](evidence/phase15/conversion-gui.json)。

## 实现与数据边界

`src-tauri/native/src/preferences.rs` 管理 `app_data_dir()/preferences-v1.json`。文件内容是 schema、revision、语言、批量格式与既有 `Options`，不包含路径、输入文件、输出目录、任务、正文或授权，也不扫描浏览器数据。

这是首次引入独立桌面偏好 schema 1，不存在需要迁移的旧桌面偏好文件。读取缺失文件只返回默认值，不自动写盘。坏 JSON、未知字段/枚举、未来 schema、超过 16 KiB 的记录、非法 DPI 或修订号都会失败并保留原文件；不猜测迁移路径，不自动重置或覆盖。

保存沿用项目已采用的 `tempfile::NamedTempFile` 模式：同目录临时文件、写入并同步文件内容、原子替换目标。只有保存成功才返回递增后的 revision。`Store` 的 Mutex 串行化当前进程的操作，已有单实例插件先于 Store 初始化；前端必须提交期望 revision，旧界面或丢失响应后的重发不能覆盖新选择。此机制不承诺跨任意外部写入者的锁定，也不承诺掉电时目录更新必然落盘。[tempfile persist 的原子替换与同步边界](https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html#method.persist)

Tauri 只新增 `read_preferences` 和 `save_preferences`，分别注册在 handler、build manifest 与主窗口 capability 中。路径固定在 Rust 后端，未开放通用文件系统权限；IPC 的偏好结构使用 `deny_unknown_fields`。读写运行在 `spawn_blocking`，队列与偏好各自管理状态，偏好故障不会将队列置为故障。

`desktop/src/platform/preferences.ts` 提供独立类型校验与控制器，复用现有格式/选项契约。首次读取完成前不写默认值；保存期间禁止其他偏好写入。失败时保留未保存草稿与旧 revision，支持重试保存或重新读取已保存值。应用退出或界面卸载后的异步响应不再更新 UI。

若写入已成功但 IPC 回复丢失，第一次重试会因 revision 过期被拒绝。此时点击“重新读取已保存偏好”，以磁盘上的实际记录恢复状态。该入口会放弃当前窗口未保存的偏好草稿，按钮文案明确指向“已保存偏好”。

## Review 发现与修正

| 问题                                               | 修正与证据                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 原界面重启后语言和批量参数丢失，语言固定从中文开始 | 接入原生偏好，默认跟随系统；真实 WebKit 测试覆盖语言、刷新和完整应用重启                                                          |
| 直接 `structuredClone` Svelte 响应式对象会抛异常   | 首轮真实 GUI 测试复现语言/目标格式没有保存；改为复制通过校验的标量字段，构造普通 IPC 对象；新增 Proxy 回归测试，再次 GUI 验证通过 |
| 启动时默认值可能先覆盖尚未读取的用户选择           | 初始化只读、未取得有效记录前禁止写入；测试延迟读取期间的保存请求不会写盘                                                          |
| 保存失败后 UI 可能假装已持久化                     | 保留 pending 草稿、显示失败、revision 不前进；真实 GUI 用独立测试目录模拟目标路径不可写入，恢复路径后重试成功                     |
| 旧窗口、并发提交或丢失响应后的重试可能覆盖新选择   | 原生 revision 比较与 Mutex；测试并发同 revision 只有一个成功、旧请求被拒绝、丢失响应后重新读取                                    |
| 损坏偏好或未来 schema 被默认值覆盖                 | 读取和写入均先校验原记录；原始字节保持不变；Rust、前端和真实 GUI 均覆盖相应失败路径                                               |
| 偏好误包含路径或授权                               | 严格字段结构；真实 IPC 拒绝 `output_path`，重启后的队列输出授权仍为 false                                                         |
| 旧 GUI 脚本依赖语言选项的数字位置和固定中文默认值  | 改为稳定语言值，转换回归脚本显式选择中文并等待保存完成；同时修正旧独立 smoke 脚本仍检查 schema 1 的过时断言                       |

独立旧 `desktop:gui:smoke` 脚本的选择器/断言已更新并通过 lint，本轮运行的是新的偏好 GUI 与现有 Phase 2 GUI 回归，不将旧独立 smoke 记为已重新执行。

## 验证

| 检查                                                | 结果                  | 范围                                                                                                            |
| --------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0                              | 各 138 项通过         | 新增 8 项偏好契约、恢复、并发交互和 Proxy 测试；其余桌面工具测试继续通过                                        |
| Rust preferences 定向测试                           | 7 项通过              | 首次只读、重启恢复、坏/未来/超大记录、非法参数、目录恢复、并发和 Unix 符号链接                                  |
| Rust native / no-default-features                   | 54 通过，1 ignored    | ignored 为既有进程子测试 fixture，并非本轮新增未测功能                                                          |
| Rust native / development-engines                   | 53 通过，1 ignored    | 功能开关导致测试集合与 no-default 不同                                                                          |
| Rust app                                            | 3 项通过              | 应用元信息诊断的既有回归                                                                                        |
| Svelte 类型检查                                     | 0 errors / 0 warnings | 桌面入口                                                                                                        |
| 构建、Clippy、rustfmt、ESLint、Prettier、actionlint | 通过                  | 当前开发应用、桌面 UI、脚本和 CI 配置                                                                           |
| 原生偏好 GUI                                        | 通过                  | 实际 Tauri/WebKit 窗口，语言、批量格式/质量/DPI、刷新、结束后重启、失败重试、坏记录保留、过期/额外字段 IPC 拒绝 |
| 坏偏好对工作区的影响                                | 通过                  | 坏记录时原生选文件按钮仍可用、队列快照可读；不把这个检查写成坏记录期间已完成一整轮转换                          |
| 原生转换 GUI 回归                                   | 通过                  | 批量 AVIF、2 个保存结果、5 页 PDF 部分取消和刷新后续转、重复请求、权限拒绝、单实例及清空保留输出                |
| Windows/macOS、MSIX、Snap strict 安装               | 未执行                | 当前主机为 Linux ARM64；旧平台待办保留                                                                          |
| 所有 76 条路线重新运行                              | 未执行                | 本轮改偏好与 IPC，没有重跑整个编码矩阵；本轮实际转换范围见上方 GUI 回归                                         |

GUI 使用新的隔离 XDG 数据/配置目录、仓库样本和自建 PDF，没有读取用户转换文件或修改真实用户偏好。D-Bus 输出含无桌面会话下的 portal/PipeWire 提示，有限 GUI 测试仍完成并成功退出。首次 Proxy 缺陷的失败日志与最终成功证据分开归档。

新偏好存储测试已随 native CI 的全量测试运行，前端偏好测试也加入 Windows job。远端工作流未在本轮触发；本机结果不是 Windows/macOS 实测结果。

## 复现

```bash
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol

# 依照 M0 文档准备本机原生引擎，使用新建的隔离测试配置目录
Z8_DEV_ENGINE_MANIFEST=/home/ivmm/VERT/.desktop-local/engines.json \
  xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- bun run desktop:test:preferences
```

偏好 GUI 脚本自行启动/关闭 tauri-driver，需要本机已有 WebKitWebDriver、Xvfb、D-Bus 和开发引擎。上述路径是本机实际路径，在其他开发机上应替换。原生转换回归继续使用 `desktop:test:gui:phase2`，需要按此前文档设置 xdotool 与配套库。

偏好记录损坏时工具保留原文件。先关闭应用，备份该记录，再修正为兼容结构或移走备份后的损坏文件；下一次缺文件读取会使用默认值。不通过“清空文件列表”删除偏好或磁盘结果。

## 当前交付边界

本轮应用源码和开发二进制已经变化；Phase 13 的未签名 MSIX 与此前 Snap 候选不包含本次偏好功能，后续需从当前源码重新构建候选并重新验收。没有覆盖旧候选或复用其包哈希声称包含新代码。

Windows 原生签名/安装、WebView2、系统菜单激活、升级与 WACK；Snap strict 实机；macOS 原生候选；原生依赖许可与源码闭包仍未完成。当前完成的是本机产品功能及相应回归，不代表桌面 V1 已可正式发布。
