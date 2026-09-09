# Phase 9：已安装 Snap 的运行验收与证据校验

日期：2026-09-08。承接 [Phase 8](PHASE8_IMPLEMENTATION.md)，本轮实现面向 **Ubuntu 24.04 AMD64 已安装 Snap** 的验收工具。它补齐候选字节、真实挂载、运行环境、沙箱权限和转换结果之间的核对路径。

**本轮完成工具开发、本机预检、自动测试和 review；没有完成原生 AMD64 strict 安装验收。** 当前机器仍是 Debian 13 ARM64，snapd 2.76.3 的 confinement 为 partial；真实预检返回 blocked、退出码 2。没有可用测试机连接信息，因此没有把模拟数据的正向测试称为实机通过。没有重建 Phase 8 安装包，也没有安装、刷新、卸载、推送或发布 Snap。

## 开发内容

入口是 [desktop-snap-installed.mjs](../../scripts/desktop-snap-installed.mjs)，命令 `bun run desktop:snap:installed`；[独立模块](../../scripts/lib/desktop-snap-installed.mjs) 提供 snapd 查询、结果验证和有限子进程管理。

1. **真实环境预检。** 同时核对 Node 进程架构、内核架构、snapd 架构、普通用户身份、Ubuntu 24.04、strict confinement、AppArmor 和 seccomp 支持。不能通过 CLI 参数强制忽略这些条件。Ubuntu 24.04 是本阶段测试环境约束，不是声称 Snap 只能在该发行版运行。
2. **只读 snapd API。** 仅向本机 `/run/snapd.socket` 发送固定白名单 GET 请求；不提供外部 URL、凭据或写入接口。响应受大小上限和总期限约束，持续发送少量数据也不能延长期限。只保存本任务需要的字段，不列出无关软件。
3. **精确候选与已安装内容。** 复用 Phase 8 的最终包检查，固定准备记录的副本，再核对 snapd 的 active revision、版本、base、strict/devmode/trymode 状态。要求 `/snap/z8-work/current` 指向对应的只读 SquashFS 挂载，安装缓存中的 `.snap` 哈希必须与候选一致；再次核对已安装应用、元数据及完整引擎清单。
4. **运行环境与真实启动链。** 检查 home、desktop、opengl、显示接口及 GNOME/GPU/主题 content providers 的实际连接；拒绝额外连接的未审阅权限。记录 core24、GNOME、Mesa、主题的具体 revision。通过 `snap run z8-work --build-info` 调用真正的应用启动链，不从解包目录直接启动应用来替代。
5. **沙箱内有限验证。** 使用 `snap run --shell z8-work`，要求进程实际处于 `snap.z8-work.z8-work (enforce)`，Seccomp 为 2。在当前用户 home 中新建两份随机命名的测试目录，验证普通目录可读写、顶层隐藏目录不可读、只读目录不可写；校验每次运行独有的回执和输出内容，随后清理自己的目录。只读目录拒绝包含 Unix 文件权限的作用，不能全部归因于 AppArmor。
6. **已安装引擎转换。** 在同一 Snap 应用的沙箱下调用包内独立验证器，执行 76 条转换路线，验证平台、唯一转换组合、实际解码/文档正文检查、PDF 页数和必要语义检查。总期限 1200 秒，非零退出、超时、取消或输出超限均不能通过；结束时再次核对候选哈希和 active revision。
7. **分开记录验收层次。** 输出阶段结果、失败原因及引用文件哈希。工具不生成商店通过结论；GUI、portal 交互、外接盘、安装生命周期、升级、卸载和许可仍明确记为未执行。`--build-info` 成功只证明有限启动，shell 转换只证明包内引擎运行，不证明 WebView 窗口或文件选择器已通过。

没有在正式应用中加入测试 IPC、调试端口或新的运行权限。仅在 snapd 的缓存包为 root 专用文件时，用 `sudo -n /usr/bin/sha256sum -- /var/lib/snapd/snaps/z8-work_<revision>.snap` 读取固定路径的哈希；revision 严格校验，不能指定其他 root 文件，也不提权执行候选内程序。本轮工具不自动连接接口，不接管已有 Snap 的安装或用户会话。测试环境允许安装、升级和卸载时，分别按后文步骤执行并保留独立证据。

## 本轮验证与交付

| 检查                         | 结果                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| Node 24 / Node 22 桌面测试   | 各 85 项通过，本轮新增 17 项；合成平台字段不算实机验收         |
| 真实宿主预检                 | blocked，退出码 2；架构、发行版与 strict 支持均不满足          |
| 已安装模式的本机尝试         | 在预检处退出 2，没有执行安装或候选程序                         |
| 独立验收目录                 | 从复制后的脚本执行最终包检查通过；完整校验列表通过             |
| 独立目录预检                 | 正确返回 blocked、退出码 2，证明依赖与入口可独立加载           |
| 静态检查                     | 桌面类型检查 0 错误/0 警告；ESLint、改动文件格式和文档链接通过 |
| 候选保护                     | Phase 8 Snap 哈希未变；原生应用及引擎未重建                    |
| 真正安装/GUI/portal/升级卸载 | 未执行，需要合适的原生 AMD64 测试机及不同版本的升级输入        |

证据：[构建与候选绑定](evidence/phase9/build.json)、[测试汇总](evidence/phase9/tests.json)、[本机预检](evidence/phase9/preflight/report.json)、[已安装模式的本机阻塞记录](evidence/phase9/installed-attempt/report.json)、[验收目录清单](evidence/phase9/handoff.json)。清单中的文件路径针对本机交付目录，不是 evidence 目录。

新增 `desktop:snap:handoff`，将候选、准备记录、固定版本 YAML 依赖、所需脚本和许可文件复制到新目录；在该目录中重新执行最终包检查，并生成 `handoff.json` 与 `SHA256SUMS`。不会复制 `.env`、凭据或整个工作区。Node 与操作系统工具不随包携带。

```bash
bun run desktop:snap:handoff \
  --artifact .desktop-local/phase8-snap/z8-work_0.1.0_amd64.snap \
  --prepared .desktop-local/phase8-input/snap-prepared/prepared.json \
  --output .desktop-local/new-snap-test-inputs
```

本轮最终目录为 `.desktop-local/phase9-handoff-ready/`，内含使用说明。复制到测试机后先在该目录运行 `sha256sum --check --strict SHA256SUMS`，再按说明执行预检。此目录是本地开发验收材料，仍未获得分发许可或商店批准；内容哈希不证明发布者身份。

## 使用方法

先运行只读预检，输出目录须不存在：

```bash
bun run desktop:snap:installed \
  --preflight --output .desktop-local/snap-host-preflight
```

退出码 0 表示这个预检/已执行子集通过；1 表示检查或命令失败；2 表示宿主环境不满足本阶段要求。**退出码 0 仍不代表完整发行验收通过。** 详细状态见输出目录的 `report.json`。

在专用 Ubuntu AMD64 桌面测试机中，先通过预检，复制 Phase 8 的确切候选和 `prepared.json`，确认不存在需要保留的同名安装。安装动作应使用本地包模式，保留 confinement：

```bash
# 仅在专用测试机中执行；不能用 --devmode 替代权限验证
sudo snap install --dangerous /path/to/z8-work_0.1.0_amd64.snap

# 以已登录的普通桌面用户运行，不要 sudo 运行验证器
bun run desktop:snap:installed \
  --artifact /path/to/z8-work_0.1.0_amd64.snap \
  --prepared /path/to/prepared.json \
  --output .desktop-local/snap-installed-acceptance
```

若缓存哈希步骤报告权限不足，需要测试机管理员提供上述只读命令的既有 sudo 权限；工具不会弹出密码提示或改用 root 运行应用。

依赖 Node 22/24、项目依赖、snapd、`unsquashfs` 和 `desktop-file-validate`；从仓库根目录执行。工具若报告缺少 provider 或连接，先检查该机器的安装变化与 `snap connections z8-work`，不要为了通过检查增加 broad filesystem/network 权限。

收到失败结果后使用新的输出目录重试，避免覆盖历史结果。验证期间不要刷新候选。测试程序接到 SIGINT/SIGTERM 会中止正在管理的有限子进程并记录失败；超时会结束其进程组，应用内新建进程组的引擎仍依赖此前实现的 watchdog 管理。操作系统强制断电/SIGKILL 不保证 Node 能写完报告或清理测试目录，残留随机目录应人工核查后删除。

## 尚需实机完成的协议

| 项目          | 实机操作与证据要求                                                                            | 工具覆盖                                            |
| ------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 干净安装      | 保存安装日志、候选哈希、snapd revision 与 provider revision；运行已安装验收工具               | 读取已安装状态，不自动安装                          |
| GUI 与 portal | 在实际桌面中允许、取消、拒绝；分别选择输入和输出；验证非 ASCII 路径、隐藏目录、重启后重新授权 | 未执行；没有将 home 权限当作 portal 证明            |
| 外接盘        | 分别记录 removable-media 未连接与连接后的行为；使用真实挂载点及用户选择授权                   | 未执行；默认不连接                                  |
| 退出与取消    | 实际 GUI 转换、取消、异常关闭后检查进程残留及已保存结果                                       | 包内矩阵有 PDF 取消检查；GUI/主程序退出仍需单独验证 |
| 升级          | 需要两份不同的真实版本及各自准备记录；记录旧任务、设置与输出，升级后再验收                    | 本轮只有 0.1.0，不伪造版本或将同包重装称为升级      |
| 卸载          | 仅在专用测试机卸载自己的测试安装；检查应用移除、快照行为及用户导出文件保留                    | 不自动卸载，也不自动 `--purge` 用户数据             |
| 离线 GUI 首启 | 安装依赖后断网，从应用菜单启动并使用真实文件转换，保留界面与系统证据                          | shell 转换不能替代 GUI 离线首启                     |
| 分发许可      | 补齐 Ubuntu 候选的来源、源码、签名与许可证闭包                                                | `redistributionApproved` 仍为 false                 |

`--dangerous` 仅改变本地包的 assertion 检查；`--devmode` 会放松 confinement。两者不能互换。removable-media 的连接状态与 portal 选择授权是不同层次，不能从输入文件可读推导输出目录可写。

## Review 记录

- 实查本机 snapd 缓存权限为 root:root 0600，补固定目标的只读提权哈希及前后元数据检查；测试拒绝路径注入和错文件哈希响应。
- 修复 snapd 超大响应销毁连接时可能触发未捕获 socket 异常的问题；真实 Unix socket 测试覆盖大响应、HTTP 错误、坏 JSON 和持续慢响应。
- 修复 shell 回执换行被二次转义的问题；除了 shell 语法检查，还实际执行最终 printf 并核对输出。
- 处理 stdout/stderr 分块 UTF-8，防止文件名或 JSON 中的中文在跨数据块时损坏。
- 超时和输出超限时结束整组子进程；使用真实 Node 父/子进程验证后代已退出或等待 init 回收，不只检查父进程状态。
- 拒绝把另一架构的转换记录、重复的 76 行、缺少像素/元数据断言或未校验的文档正文当作完整矩阵。
- Node 22 回归发现进程回收时 `/proc` 可以返回 ESRCH，修正为只接受 ENOENT/ESRCH 或短暂 zombie，其他错误仍失败。
- 固定准备记录副本，避免父脚本与子检查器在不同时间读取不同版本的准备文件；检查候选及 revision 在运行期间没有变化。

这些测试覆盖校验逻辑、真实 Unix HTTP、进程与 CLI 预检；正向的 host/安装字段样本是合成数据，不是虚构的实机安装报告。

## 官方依据

核对日期：2026-09-08；CLI 参数使用本机 snapd 2.76.3 的 `snap run/install/remove --help` 核对，API 字段同时对照官方说明和实际只读响应。

- [Snapd REST API](https://staging-api.snapcraft.io/docs/snapd-api)：system-info、snaps 和 connections 的结构化读取。
- [home interface](https://snapcraft.io/docs/reference/interfaces/home-interface/)：home 文件访问边界。
- [removable-media interface](https://snapcraft.io/docs/reference/interfaces/removable-media-interface/)：外接介质访问接口。
- [Snap 安装模式](https://snapcraft.io/docs/explanation/snap-development/install-modes/)：本地候选与 devmode 的区别。
- [前一阶段固定候选与缺项](PHASE8_IMPLEMENTATION.md)：继续使用其约 205 MB 安装包和原始哈希。
