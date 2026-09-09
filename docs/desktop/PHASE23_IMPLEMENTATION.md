# Phase 23：可预览与保存的脱敏诊断报告

日期：2026-09-09。承接 [Phase 22](PHASE22_IMPLEMENTATION.md)，实现 [V1 方案](V1_PLAN.md) 中诊断信息保护的要求。新增可分享的有限运行摘要，帮助排查桌面问题；原有界面错误和本地历史不是该报告的数据导出接口。

## 用户可见变化

桌面底部增加“帮助排查问题”。用户点击“预览诊断报告”后，可以查看完整 JSON、选择全部文本自行复制，或通过系统保存对话框保存报告。报告展示中英文说明，沿用现有像素图标和界面风格。

[中文诊断预览截图](evidence/phase23/diagnostics-zh.png)。报告先预览再保存，不主动上传、发送邮件、创建 issue，也不自动写入剪贴板。保存完成只表示文件已经写入本机，不表示已经发送给维护者。

重新生成会取得新快照，并使上一个预览的后续保存请求失效。界面刷新不恢复旧报告；后端仅在本次运行中保留最后一个预览，完整退出后不会保留该缓存。保存取消后可以再次操作，已有文件不覆盖。

## 数据边界

采用固定字段白名单生成报告，不依赖从原始日志中查找并替换路径。当前报告 schema 为 1，最大 8192 字节。

| 包含                     | 含义                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| product / native_version | 固定产品名与编译时的原生核心版本                                                    |
| os / arch / debug        | 操作系统类型、架构和调试构建标志                                                    |
| workspace_initialized    | 本次启动时工作目录 Store 是否初始化成功，不是当前可写或剩余空间保证                 |
| engines                  | 五个固定引擎 ID、初始化时的可用状态、已知时的开发引擎标志，以及可识别的数字版本片段 |
| queue                    | 当前任务总数、各状态数量、是否处理中、历史持久化是否报错；无法取得队列时为 null     |

**不包含文件正文、文件名、输入/输出路径、任务 ID、文件大小、结果哈希、原始错误文本、导入文件列表、环境变量、用户名、主机名或 URL。** 报告预览 ID 只用于本次保存授权匹配，不写入 JSON 文件。

引擎版本只从已知版本前缀中取得有限数字、点和连字符片段；不导出版权行、发行版后缀、构建路径或整段版本输出。不认识的版本格式显示 null。例如 FFmpeg `7.1.5-0+deb13u1` 在报告中为 `7.1.5-0`，不能用它确认完整发行包、编译参数、codec 能力或具体二进制来源。

报告没有源码提交或二进制哈希，不能单凭原生版本号区分所有本地开发构建。任务数量和状态仍属于用户运行信息，所以提供完整预览，由用户自行决定是否分享。

## 实现与 review

`native::diagnostics` 使用独立的可序列化结构。队列快照只用于提取计数和布尔值，不直接序列化 `Snapshot`、任务或引擎原始错误。版本字段也不直接复用完整版本字符串。单元测试在文件名、路径、ID、错误、结果哈希、导入报告等字段中注入敏感哨兵，并检查它们没有进入输出。

`preview_diagnostics` 在阻塞任务线程中取得队列快照并生成有限摘要，避免在界面事件线程克隆可能较大的任务历史。报告状态分别取自已有后端对象，不再次扫描磁盘或执行引擎探测。

后端 `diagnostics::Store` 只保留一个预览 ID 与对应文本。前端只能用该 ID 请求保存，不能提交保存路径或修改后的报告正文。保存命令在打开系统对话框前验证 ID；使用的是后端保存的预览字节，不在保存时重新生成可能已经变化的任务统计。已打开保存窗口的操作持有其开始时的预览副本。

报告保存与现有文件选择、退出确认共享对话框占用状态，但不要求队列可用或空闲。退出流程开始后禁止新报告保存窗口；保存窗口打开时，退出请求沿用现有处理方式等待用户结束对话框。取消、错误与完成都会释放占用。

只有系统保存对话框返回的路径进入原生写入逻辑。报告先写目标目录中的随机临时文件并同步，再使用 `persist_noclobber` 发布；保存失败不覆盖已有文件。新增命令已登记到 handler、build manifest、自动生成权限以及仅限主窗口的 capability，没有启用通用文件系统或 shell 权限。

| Review 发现                                                  | 修正与证据                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 原始快照和版本输出可能包含用户路径、文件名或 URL             | 独立白名单结构与数字版本提取，敏感哨兵与字段集合测试                                 |
| 保存时重新生成会使文件内容不同于用户预览                     | 后端缓存预览副本，保存 ID 匹配；真实 GUI 比较预览和落盘文本逐字节一致                |
| 上一个报告的迟到保存请求可能保存错误快照                     | 重新生成替换 ID；旧 ID 在弹出对话框前即被拒绝                                        |
| 队列初始化失败时若复用导入门禁，会无法保存诊断               | 复用对话框占用而不复用队列授权门禁；真实损坏历史与缓存故障场景仍可预览并打开保存窗口 |
| 退出已完成的短暂窗口可能被新对话框打断                       | 增加退出状态检查，测试确认请求及完成状态都不接受新对话框                             |
| 主线程读取较大队列快照可能影响响应                           | 按既有异步命令模式移到阻塞任务线程                                                   |
| 初始化成功不等于缓存当前可用                                 | 字段明确命名为 workspace_initialized，并说明其时间范围                               |
| textarea 自闭合产生 Svelte 警告                              | 使用显式结束标签，最终 Svelte 检查 0 errors / 0 warnings                             |
| 预览 ID 格式校验过宽                                         | 验证 UUID 分组与字节上限，补全分隔符伪 ID 测试                                       |
| 完整回归出现一次媒体预览等待超时；驱动存在点击禁用按钮的竞态 | 等待按钮可用后再点击，保留失败记录，随后重跑完整 GUI；不把一次超时推定为编码器故障   |

最终 review 未发现本阶段尚未修复的阻断问题。

## 验证与复现

```bash
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol

TMPDIR=/home/ivmm/VERT/.desktop-local/phase23/tmp \
Z8_XDOTOOL=/tmp/z8-m0-deps/extracted/usr/bin/xdotool \
Z8_XDOTOOL_LIBRARY_DIR=/tmp/z8-m0-deps/extracted/usr/lib/aarch64-linux-gnu \
Z8_DEV_ENGINE_MANIFEST=/home/ivmm/VERT/.desktop-local/engines.json \
  xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- bun run desktop:test:diagnostics
```

先创建临时目录，路径按本机调整。GUI 需要原生引擎、tauri-driver、WebKitWebDriver、Xvfb、D-Bus、xdotool 与 Python 3。`--diagnostics` 使用隔离配置，包含既有存储、工作目录、导入与预览回归。损坏历史测试只改写本轮生成的隔离历史，测试结束后还原它。

| 检查                                    | 结果                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| Svelte                                  | 0 errors / 0 warnings                                    |
| Node 22.22.2 / 24.18.0                  | 各 151 项通过                                            |
| Rust native / no-default-features       | 91 通过、2 ignored（既有子进程 fixture）                 |
| Rust native / development-engines       | 90 通过、2 ignored                                       |
| Rust app                                | 7 项通过，包含退出状态断言                               |
| 前端与原生构建                          | 通过                                                     |
| Clippy、rustfmt --all、ESLint、Prettier | 通过                                                     |
| Windows x64 MSVC / macOS ARM64 原生核心 | 含测试目标交叉编译检查通过，不代表原生运行               |
| linux-portal                            | 编译通过，不代表 strict Snap 安装验收                    |
| 真实 Linux WebKit GUI                   | 60 项通过，含 6 项诊断专项；保留 20 个预览样本与导出回归 |

原生新增 4 项测试覆盖版本提取、敏感字段排除、预览 ID 生命周期、精确保存与禁止覆盖。前端新增 2 项测试覆盖原文保留、结构、UUID、schema 和 UTF-8 字节上限。GUI 验证只读可选文本、敏感路径和文件名排除、旧 ID 拒绝、原生保存取消、保存内容与预览一致，以及队列/缓存故障时仍可诊断。

[环境与二进制摘要](evidence/phase23/environment.json)、[源码收据](evidence/phase23/inputs.json)、[最终 GUI 报告](evidence/phase23/diagnostics-gui.json)、[实际保存的脱敏报告](evidence/phase23/sample-diagnostics.json)与[证据清单](evidence/phase23/inventory.json)记录本轮验证。最终 GUI 使用 review 修正后的构建，退出码为 0。

## 保留的限制

- 这是有限摘要，不替代用户对问题步骤和输入类型的说明，也不导出原始引擎日志。本阶段没有改变所有既有界面错误或本地队列历史的内容。
- 报告缓存不持久化，用户已另存的 JSON 由用户自行管理；清空转换队列不会删除另存报告。
- 用户可以编辑另存的文件并自行添加信息；应用不承诺外部编辑后的内容仍满足这里的白名单。
- 系统保存窗口可能先询问覆盖已有文件，应用最终仍拒绝覆盖，需改用新文件名。极窄写入窗口崩溃可能留下目标目录中的 `.z8-report-*` 临时文件，不按名称扫描删除用户目录。
- 原生 Windows/macOS 保存窗口、Snap portal 保存权限、实际安装和商店验收仍待目标环境验证。旧安装候选需重建，本轮不推送或发布。
