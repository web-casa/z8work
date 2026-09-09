# Phase 12：Windows 实机验收交接与 WebView2 检测

日期：2026-09-09。本轮完成诊断入口、独立验收包、进程测试监督程序和 review 修复。**Windows 原生验收仍未完成**：当前宿主为 Linux ARM64。Wine 诊断中的大量日志测试出现 Rosetta 错误，验收流程如实失败，未把兼容层结果或成功退出码当成全部通过。

## 本轮实现

- 主程序新增 `--runtime-info-file ABSOLUTE_NEW_FILE`，通过已锁定 Tauri 的 `webview_version()` 检测 WebView2，不创建窗口、不启动转换队列。沿用只创建新文件的报告入口；缺失参数、相对路径和覆盖已有文件均拒绝。非 Windows 平台返回 `not-applicable`。
- `desktop:windows:handoff` 将主程序、Phase 11 引擎包、Windows 测试程序、测试监督程序、工作区输入回执及所需 Node 脚本放入独立目录。只有 Node 内置依赖，Windows 测试机不需要 `npm install`、Rust 或构建工具。Node 本身不随包提供。
- `desktop:windows:acceptance` 先验证所有文件和 PE 依赖，显式选择 `native` 后才执行 Windows 检查；Linux x64 可选择 `wine` 做诊断。检查构建信息、WebView2、8 项进程测试和 76 条转换，再核对输入未变。所有报告目录必须在验收包外，且必须不存在。
- `validation-run.exe` 是独立开发工具，复用转换引擎的 `process::run`，用 Windows Job Object / Linux watchdog 监督测试进程。只接受共享清单中的测试名称或 `--list`，没有注册到应用 IPC；普通桌面应用不启用其 `engine-validation` 功能。
- `packaging/desktop/windows/lifecycle-tests.json` 同时供 Rust 与 Node 使用。Node 要求恰好 8 个不重复名称；逐项检查列表确实包含该测试，结果确实是“1 项通过、0 项失败、0 项忽略”。
- Windows CI 增加验收工具单元测试及无窗口 WebView2 检测记录。本轮没有推送或触发远端工作流，因此不声称 GitHub Windows runner 已通过。

验收工具不会安装 WebView2、安装/卸载应用、创建证书或上传文件。检测到四段稳定版本号只说明 loader 找到了相应版本，不能代替 GUI、所需 API、GPU 或最低 Windows 版本兼容测试。缺少稳定 WebView2 时仍可完成核心检查，原生运行报告最后返回阻断状态；不会因缺少界面运行时而把转换能力直接判成失败。

## 最终本地交付

最终目录：`.desktop-local/phase12/delivery/`。此前 `handoff-draft`、`handoff-final`、`handoff-reviewed` 和 `handoff-ready` 是中间诊断输入，不替代最终交付。

```text
 delivery/
   candidate/z8-desktop.exe
   candidate/engines/...
   validation/native-tests.exe
   validation/validation-run.exe
   scripts/...
   packaging/desktop/...
   build-inputs.json
   LICENSE
   README.txt
   handoff.json
```

这是一份内部验收输入，共 42 个文件，约 510 MiB；没有 WebView2 Runtime、安装器、MSIX 或签名，仍使用开发身份。精确文件大小、SHA-256 及输入回执见 [handoff.json](evidence/phase12/handoff.json) 和 [环境记录](evidence/phase12/environment.json)。工作区基线是 HEAD `c554d15c578d54713d9ab0cf58e7a6ec221f35a9` 加回执中的 262 个未提交/已跟踪输入，构建前后核对一致。

Phase 11 的引擎与其 `bundle-check.exe` 保持原字节：引擎清单 SHA-256 为 `f13779a3a74bd365b5571a06d3b233f310e20d69d07a4f04c4e2b0917ba125f4`。它们的转换与来源证据见 [Phase 11](PHASE11_IMPLEMENTATION.md)，不把本轮在生命周期测试处停止的执行算成新一轮转换通过。主程序和测试监督工具另外构建，验收包记录各自的最终哈希。

哈希验证字节一致性，不提供发布者身份或源码到二进制的密码学证明。输入回执需要结合构建日志审阅。SDK 缓存和诊断镜像也不是完整、可公开重建的发行工具链。

## 验证结果

| 检查                                                   | 结果与边界                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0                                 | 各 108 项通过，新增 5 项测试覆盖清单篡改、路径、错误测试结果和运行时状态                                        |
| Linux ARM64 Rust 核心                                  | `engine-validation`：48 项通过、1 项子进程 fixture 按设计忽略                                                   |
| Linux ARM64 应用单元测试                               | 3 项通过：运行时结果、相对路径和不覆盖已有文件                                                                  |
| Windows Release 构建                                   | 主程序、核心测试程序和监督程序交叉构建通过；编译不算 Windows 执行                                               |
| Svelte / ESLint / Prettier / fmt / Clippy / actionlint | 通过，见 evidence/phase12 日志                                                                                  |
| 最终验收包静态检查                                     | 通过；全部文件哈希、架构和 DLL 依赖核对                                                                         |
| Windows 原生运行入口                                   | 本机预检阻断，返回 2，见 [记录](evidence/phase12/native/report.json)                                            |
| 主程序诊断入口 / Wine                                  | 正常写入、不覆盖、参数缺失、相对路径和构建信息 5 个场景通过；GUI 未执行                                         |
| 生命周期 / Wine                                        | 7 项独立结果通过，1 项大量日志测试出现 Rosetta 错误；完整流程失败，见 [记录](evidence/phase12/wine/report.json) |
| WebView2 / Wine                                        | loader 报告未找到运行时，工具记录 `blocked`；没有宣称 GUI 可运行                                                |
| 本轮 76 条转换矩阵                                     | 完整流程在生命周期测试处停止，未执行；同字节引擎的 Phase 11 证据继续保留                                        |
| Windows GUI、权限、安装、升级卸载、MSIX/WACK           | 未执行；需要原生 Windows 实机与实际安装件                                                                       |

8 项生命周期检查分别是：应用异常退出后清理后代、父进程正常结束后的残留后代、取消/到期不启动、等待输出期间的取消和总时限、双管道日志内存上限、错误可观察、超时清理后代、取消正在运行的进程。7 项通过不意味着整个套件通过；程序始终保留 `acceptance: incomplete` 与 `redistributionApproved: false`。

## Review 修正与未关闭问题

1. **嵌套 Node 子进程的中断清理风险。** 初版通过另一个 Node 进程启动引擎检查，外层退出可能无法及时停止孙进程。改为直接运行 Rust `bundle-check.exe`；测试程序通过复用生产进程保护机制的 `validation-run.exe` 执行。
2. **测试筛选为空的假成功。** Rust 测试二进制可以在 0 项测试匹配时成功退出。工具现在检查真实测试列表、固定数量及每项完整成功结果；忽略、错名和缺失总结均失败。
3. **仅看退出码会吞掉兼容层崩溃。** 实际出现 `rosetta error: invalid gdt selector index 5`，有一次返回成功退出码但没有测试总结。内容校验正确拒绝，没有为 Wine 降低标准。
4. **崩溃转储污染候选。** Wine/Rosetta 在当前目录留下约 934 MiB 的 core 文件，导致“未列出文件”检查失败。已把执行工作目录改到报告目录；最终诊断另将交付目录只读挂载并禁用 core dump。早期转储已移出候选，保留在 `.desktop-local/phase12/`，不纳入交付。
5. **输出目录限制过宽。** 初版错误地禁止报告/交接目录与单个测试 EXE 共用父目录。改为禁止输出进入整个候选输入树；单个文件复制继续逐项复核，既保护输入又允许正常的同级目录组织。
6. **来源清单与最终测试字节。** 最终交付使用最终 Cargo 编译回执对应的测试 EXE，保留不同构建阶段的独立哈希；不借用旧测试文件冒充新构建。

大量日志测试先做一次有限重试，再直接运行未包装的测试程序，仍复现同一 Rosetta 错误；这说明新增监督层不是出现该现象的必要条件，但不足以确定 Windows 上的行为。此项保持未通过，需要原生 Windows runner 复核。没有因此修改生产日志上限或放宽断言。

## Windows 实机使用

将 `delivery/` 复制到 Windows x64 测试桌面，安装 Node 22+。先将 `handoff.json` 的 SHA-256 与独立保存的生成报告比对，再从交付目录运行：

```powershell
Get-FileHash .\handoff.json -Algorithm SHA256
node scripts/desktop-windows-acceptance.mjs --root . --output ../z8-static-check
node scripts/desktop-windows-acceptance.mjs --root . --output ../z8-native-check --runtime native
```

无需 npm 安装；输出目录必须是新的兄弟目录。默认命令只检查字节，`--runtime native` 才执行测试与转换。返回值：0 表示该执行模式下已请求的检查通过；1 表示失败；2 表示主机不匹配或原生核心检查后仍缺稳定 WebView2。即使返回 0，仍需分别查看 GUI、权限、安装和许可缺项。

读完报告后，在有 WebView2 的 Windows 桌面继续人工检查：窗口首启、文件选择及拒绝/取消、中文和空格路径、输出目录授权、批量转换与退出取消、重启授权、断网 GUI。后续用实际 MSIX 检查安装、升级、卸载和 WACK；本工具不会替代这些步骤。

## 重建交接目录

主程序继续使用 [Phase 10 的构建脚本](PHASE10_IMPLEMENTATION.md)。测试监督程序使用同一 Windows MSVC 静态 CRT 配置：

```bash
env PATH="/usr/lib/llvm-19/bin:/home/ivmm/VERT/.desktop-local/phase10-tools/bin:$PATH" \
  XWIN_CACHE_DIR=/home/ivmm/VERT/.desktop-local/phase10-xwin XWIN_ARCH=x86_64 \
  cargo xwin build --locked --manifest-path src-tauri/Cargo.toml \
  --config packaging/desktop/windows/cargo-config.toml -p z8-native \
  --release --target x86_64-pc-windows-msvc --features engine-validation --bin validation-run
```

原生 Windows 上将 `cargo xwin build` 换为 `cargo build`。核心测试 EXE 用 `cargo test ... -p z8-native --release --target x86_64-pc-windows-msvc --no-default-features --no-run --message-format=json` 生成；从 JSON 的 `compiler-artifact` 中选择 `target.name == z8_native` 且 `profile.test == true` 的 `executable`，不要猜带哈希的文件名。Windows cargo config 仍必须传入。

当前本机已生成以下输入，可在新目录复现组装：

```bash
bun run desktop:windows:handoff \
  --candidate .desktop-local/phase12/delivery-candidate \
  --tests .desktop-local/phase12/delivery/validation/native-tests.exe \
  --supervisor .desktop-local/phase12/delivery/validation/validation-run.exe \
  --inputs .desktop-local/phase12/build-delivery/inputs.json \
  --output .desktop-local/windows-handoff-next
```

这里复用的是已冻结的测试文件。新构建必须使用其实际编译产物，并重新组装、运行检查，不能沿用旧结果。Wine 诊断只允许显式 `--runtime wine`；本轮镜像沿用 Phase 11 的 Ubuntu 24.04 AMD64 / Wine 9.0，宿主通过 Rosetta 转译，断网、非 root，最终交付只读挂载。

## 下一阶段与依据

优先在原生 Windows x64 执行完整验收，解决日志测试的兼容层不确定性和 WebView2 GUI 缺项，再推进 MSIX。Partner Center identity/publisher 仍未配置，许可和对应源码材料仍未闭合；不编造正式包身份。Snap strict 实机与 macOS 缺项保持原状态。

本轮查证了锁定的 Tauri / Wry 源码：`tauri::webview_version()` 最终调用 `GetAvailableCoreWebView2BrowserVersionString`。官方依据：

- [Microsoft WebView2 分发与检测](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)：运行时来源、检测与 GUI 验证分别处理。
- [WebView2 版本查询](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2environment.getavailablebrowserversionstring)：非稳定通道会出现在版本信息中，不能将其默认为稳定运行时。
- [Rust 测试执行参数](https://doc.rust-lang.org/rustc/tests/index.html)：`--list`、`--exact`、忽略测试及成功结果的语义。
