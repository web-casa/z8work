# Phase 20：批量导入容错与结果反馈

日期：2026-09-09。承接 [Phase 19](PHASE19_IMPLEMENTATION.md)，修正系统多选或拖放中一个无效文件导致整批导入失败的问题，并补齐 [V1 方案](V1_PLAN.md) 的原生导入反馈与界面重连要求。

## 用户可见变化

多选或拖入 PNG、Markdown 和未知格式文件时，有效文件进入待转换队列，未知格式单独显示跳过原因。导入不会自动启动转换。最近一次导入面板展示已添加数、已跳过数及各文件原因；提供中英文说明，文件名按文本显示。

跳过原因区分无法读取、不是普通文件、超过 512 MiB 导入限制、格式不支持或所需引擎不可用、队列已满。队列剩余容量不足时按传入顺序保留能容纳的有效文件，其他文件明确标为队列已满。

[真实系统多选后的中文截图](evidence/phase20/import-report-zh.png)。本轮截图包含名为 `ignored <b>.xyz` 的测试文件，确认文件名不会被解释为 HTML。

导入结果保存在本次应用运行的后端快照中。刷新 WebView 后仍可查看；关闭提示后刷新不会恢复。新一次非空导入会替换提示，取消文件选择保留原提示。清空队列会清除提示，完整退出再启动不会恢复它。

## 实现与边界

`Queue::import_files` 提供正常多文件导入，原有 `Queue::register` 继续用于严格登记和单任务重新授权。两者复用抽取后的文件校验：规范化路径、非阻塞普通文件打开、从实际句柄取得身份 Stamp、大小限制和真实引擎能力查询。重新授权仍要求单个有效文件，失败不修改原任务。

系统选择器和 OS 拖放入口接入 `import_files`，前端仍没有接受任意路径的登记 IPC。选择器返回后的校验和落盘移到 `spawn_blocking`，避免在异步运行线程执行整批同步文件操作。

批次先逐项校验，再在锁内复核队列空闲和容量。有效项只提交一次历史记录；提交成功后才登记内存授权并发布导入结果。历史写入失败时，任务、授权和原导入提示保持原状，不会宣称部分文件已经导入。

`Snapshot` 增加可选 `import_report`，包含后端生成的 ID、成功数和有限的跳过列表。历史 `Journal` 不含该字段，schema 继续为 2。前端验证数量、原因枚举和字符串上限，兼容没有该字段的旧快照。Rust/前端共同使用的 JSON 夹具已同步验证序列化。

新增 `dismiss_import_report` 命令仅接收报告 ID；只清除匹配的当前报告，迟到的旧 ID 不会清除后来生成的结果。该命令不修改任务和授权。Tauri handler、build manifest、自动生成权限和主窗口 capability 均已登记。

### 保留的限制

- 单次最多选择 100 个文件；超过该批次限制会整体拒绝，不悄悄截断。队列总数仍最多 100。
- 导入仍要求队列空闲，不在转换、预览或关闭期间新增任务。本阶段没有新增后台等待导入队列或启动参数打开文件。
- 导入只校验授权、文件类型、大小与引擎路线，不完整解码内容。带正确扩展名的损坏文件可能进入队列，随后预览或转换会报错。
- 512 MiB 是导入上限；PDF 转换、预览及其他流水线仍受更小的独立限制约束。
- 原生选择器返回路径转换失败、队列状态错误或历史写入失败仍是批次错误，不伪造逐项成功报告。
- 报告只保留文件显示名和原因枚举，不把拒绝文件完整路径写入历史。单个名称最多 256 个 Unicode 字符，一次报告最多 100 个条目。

## Review 与修正

| 问题                                           | 修正与证据                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| 一个不支持的文件使有效同批文件也丢失           | 正常导入收集逐项结果，真实系统多选导入两个有效文件、跳过一个未知文件   |
| 容错导入逐文件落盘可能部分成功却返回笼统失败   | 先验证，再一次提交历史；模拟写入失败验证没有任务或授权残留             |
| 增加容错后意外放松重新授权                     | 独立严格入口；多文件和无效替换均拒绝，原任务保持不变                   |
| 错过导入事件后无法知道发生了什么               | 报告作为快照字段返回；真实 WebView 刷新恢复结果                        |
| 旧关闭请求覆盖新提示                           | 比较报告 ID；Rust 和真实 GUI 验证旧 ID 不生效                          |
| 跳过原因难以翻译、文件名可能被当作 HTML        | 原生返回有限原因枚举，Svelte 文本输出；中英文和特殊文件名实测          |
| 仅前端接受新增字段，Rust 夹具没有同步          | 首轮契约测试捕获差异；补真实报告结构并验证双向序列化                   |
| 系统多选测试错误地假设位置栏支持多个带引号路径 | 改为进入生成样本目录，在原生文件列表中全选；不增加测试专用任意路径 IPC |
| GUI 文本断言依赖源码格式产生的空白             | 按可见文案语义匹配空白，不修改产品文案迎合测试                         |

## 验证与复现

```bash
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol

TMPDIR=/home/ivmm/VERT/.desktop-local/phase20/tmp \
Z8_XDOTOOL=/tmp/z8-m0-deps/extracted/usr/bin/xdotool \
Z8_XDOTOOL_LIBRARY_DIR=/tmp/z8-m0-deps/extracted/usr/lib/aarch64-linux-gnu \
Z8_DEV_ENGINE_MANIFEST=/home/ivmm/VERT/.desktop-local/engines.json \
  xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- bun run desktop:test:imports
```

临时目录需先创建，路径按本机环境调整。GUI 需要已有原生引擎、tauri-driver、WebKitWebDriver、Xvfb、D-Bus 与 xdotool；使用隔离 XDG 配置和生成的输入。`--imports` 在导入专项之后执行图片、PDF、媒体预览和转换回归，原有专项入口继续保留。

最终 review 未发现本阶段尚未修复的阻断问题。结果如下：

| 检查                                    | 结果                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0                  | 各 145 项通过                                                  |
| Rust native / no-default-features       | 70 通过、1 ignored（既有进程 fixture）                         |
| Rust native / development-engines       | 69 通过、1 ignored                                             |
| Rust app                                | 7 项通过                                                       |
| Svelte                                  | 0 errors / 0 warnings                                          |
| 前端和原生构建                          | 通过                                                           |
| Clippy、rustfmt --all、ESLint、Prettier | 通过                                                           |
| linux-portal                            | 编译通过，不代表 strict Snap 实机验收                          |
| 真实 Linux WebKit GUI                   | 41 项检查通过，含 7 项新增导入专项                             |
| 既有预览与转换回归                      | 20 个有效预览样本，三页 PDF 原分辨率导出、三类媒体完整音频输出 |

新增 Rust 测试覆盖混合文件、全部拒绝、容量、取消保留报告、迟到关闭、历史写入失败、严格重新授权及完整重启失效；Node 测试覆盖报告契约上限和缺少新字段的兼容情况。GUI 验证真实 GTK 多选、有效文件原生预览、特殊文件名、中英文、刷新与关闭提示。这些单元测试纳入既有测试入口；GUI 为本机专项，本轮没有触发远端 CI。

最终开发二进制 SHA-256：`c323011e4c8904a7be0c9bbe1ea93c52fe5b386afb5a76c0c00e9173aae48eeb`。[环境摘要](evidence/phase20/environment.json)、[源码收据](evidence/phase20/inputs.json)、[GUI 报告](evidence/phase20/import-gui.json)与[证据清单](evidence/phase20/inventory.json)已归档。初始契约夹具、多选驱动和空白断言失败日志与最终通过证据分开保存；最终 GUI 退出码为 0。

拖放与多选共享此次后端入口，真实 GUI 专项验证的是 Linux GTK 系统多选，不把它扩写为所有桌面环境的原生拖放验收。Windows/macOS 原生运行、MSIX/Snap strict 安装、签名及商店发行仍待目标系统验证；旧安装件需重建。本轮不执行推送、发布或商店上传。
