# Phase 5：发行前进程生命周期加固与 review

日期：2026-09-08。本轮承接 [Phase 4](PHASE4_IMPLEMENTATION.md)，补齐 [Phase 3](PHASE3_IMPLEMENTATION.md) 已记录的“主进程异常终止时，转换子进程缺少兜底”问题。V1 原计划只定义 M0–M4；这里的 Phase 5 是后续实施批次，**不是新增一个已经通过的商店里程碑**。M3 安装验收与 M4 可提交候选仍未齐备。

## 问题与实现

转换中的桌面程序被强制结束时，不会执行 Rust `Drop`。原来的主动取消/超时清理因此无法保证执行。新增回归测试先等待真实后代进程就绪，再对父进程调用 `kill()`（Unix SIGKILL / Windows TerminateProcess）；旧实现中，后代仍在父进程消失后写出了文件，测试失败。

### Unix：私有管道与独立进程组

[watchdog.rs](../../src-tauri/native/src/process/watchdog.rs) 使用当前可执行文件的内部启动模式创建监视进程。它先成为新的进程组长，完成就绪握手，再让转换引擎加入该组。主程序独占控制管道的写端；程序退出导致管道关闭，监视进程收到 EOF 后终止自己的整个进程组，包括自身和仍在组内的引擎后代。

- 使用 `Command::process_group` 和正常 exec；没有在多线程程序 fork 后执行 Rust 分配、锁或业务逻辑。
- 正常完成、取消、超时及启动失败均由作用域守卫清理。正常退出的引擎如果留下持有 stdout/stderr 的后代，也会被停止。
- 在发送组信号之前不回收组长 PID，避免已回收的进程编号被其他进程复用后误杀。重复清理不会再次发送信号。
- 私有模式不接收 PID、文件路径或待执行命令；验证自身为独立组长、stdin 为管道。手动带该参数在调用者进程组或无控制管道时，会直接失败。
- 握手有数据量上限，最多等待 3 秒，且受原任务更短的期限和取消控制；监视进程未就绪时不启动引擎。
- 桌面主程序、开发 smoke 和包内 bundle-check 都在其他初始化之前分派该模式，不启动额外 WebView、不进入单实例注册、不打开队列或用户文件。
- 对通过包内 ELF loader 运行的 bundle-check，保留其 loader、相邻库目录与绝对程序路径重新启动监视模式；没有新增 PATH 或开发引擎回退。

### Windows：最后一个句柄关闭时终止任务

逐行检查锁定的 process-wrap 10.0.0 后发现，`std::JobObject` 调用 `make_job_object(handle, false)`，默认没有启用 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`。拥有 Job Object 不等于已具备父进程异常退出保护。

[windows_job.rs](../../src-tauri/native/src/process/windows_job.rs) 复用现有 suspended-spawn / resume / 等待逻辑，在恢复引擎线程之前，将它先加入另一个启用了上述标志的生命周期 Job。其句柄匿名、不可继承，由应用持有；应用被终止时，系统关闭句柄并终止已登记的引擎及其后代。设置或登记失败会终止并等待子进程，不恢复执行。

不复制或修改第三方依赖源码。新增 Windows 测试核对真实 Job 的限制位与句柄不可继承属性；通用强制退出回归测试也在 Windows CI 中运行。本轮本机执行的是 Windows 交叉编译/Clippy，不能记为 Windows 实机测试通过。

### 取消、输出与候选检查

[process.rs](../../src-tauri/native/src/process.rs) 继续分别排空 stdout/stderr，各保留最多 8 KiB 原始尾部数据。两个管道的收尾共用最多 2 秒预算，并继续检查取消及原任务总时限；不再各自额外等待 2 秒。

`--build-info` 新增编译策略 `processLifetime`：Unix 为 `watchdog-pipe-v1`，Windows 为 `job-close-v1`。[候选检查](../../scripts/lib/desktop-artifacts.mjs) 拒绝缺少该字段或平台策略不匹配的构建。字段描述编译内容，不是安装/运行验收证据；旧 Phase3 候选不会因材料重新生成而自动成为本轮候选。

## Review 修复记录

| 严重性 | 触发条件与影响                                                | 修复及证据                                                                        |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 高     | Unix 主程序被强制结束，转换后代继续写文件                     | 测试先复现失败，修复后强制退出测试通过；管道关闭触发整组终止                      |
| 高     | Windows 默认 Job 没有 kill-on-close，无法依靠 OS 关闭句柄清理 | 增加不可继承的生命周期 Job，在线程恢复前登记；API/测试交叉编译通过，原生执行待 CI |
| 高     | 引擎 PID 回收后再次按旧 PID 发信号，可能命中复用编号          | Unix 只向尚未回收的监视组长所代表的组发信号；不再调用裸引擎 PID 的 start_kill     |
| 中     | 包内 ELF loader 被识别为 current_exe，直接重启会启动错误入口  | 在此运行方式下显式保留 loader/library-path/绝对 argv[0]，以空容器真实转换验证     |
| 中     | 监视器启动失败或手动调用私有参数                              | 就绪握手与限时检查；组长/管道检查；失败不启动转换                                 |
| 中     | 引擎正常退出，但后代持有日志管道；收尾阶段取消延迟            | 正常退出后清理整个组；两个输出共享期限并轮询取消；后代存活与取消测试通过          |

## 验证与复现

所有平台 CI 已有 `cargo test`，新增测试随原套件进入 Linux、Windows、macOS 作业；本轮未推送，远程 CI 未运行。

```bash
# 专门复现进程生命周期回归（包含实际子进程，不需要转换引擎）
bun run desktop:test:lifecycle

# 完整本机原生测试和前端检查
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
bun run desktop:test
bun run desktop:check
bun run desktop:test:ui

# 仅交叉编译代码与测试；不算目标平台实际运行
cargo check --locked --manifest-path src-tauri/Cargo.toml -p z8-native --all-targets --target x86_64-pc-windows-msvc
cargo check --locked --manifest-path src-tauri/Cargo.toml -p z8-native --all-targets --target aarch64-apple-darwin
```

重新组装引擎、打包、隔离转换和 GUI 复现方式沿用 [Phase3](PHASE3_IMPLEMENTATION.md) 的真实命令；输出应使用新目录，不覆盖旧候选。本轮最终结果：

| 检查                                     | 结果                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| Linux ARM64 原生默认 / engine-validation | 各 47 通过，1 个子进程夹具由监督测试调用                       |
| development-engines                      | 46 通过，1 个子进程夹具由监督测试调用                          |
| 进程专项（包含在原生测试中）             | 12 通过，1 个子进程夹具；包括强制退出与实际后代存活检查        |
| 桌面类型检查 / 单元测试                  | 0 错误、0 警告；25 项通过                                      |
| 网页原有测试                             | 180 项通过                                                     |
| Windows x64 / macOS ARM64                | 代码与测试交叉编译、Clippy 通过；原生执行未完成                |
| Release 应用、引擎组装与最终归档解包     | 通过                                                           |
| 最终包内引擎的隔离转换                   | 76 条路线通过；scratch、网络关闭、根文件系统只读、UID 1000     |
| 最终归档解压后的 Tauri GUI               | 文件选择、AVIF、PDF 部分取消/续转、刷新、单实例、受限 IPC 通过 |
| 格式、ESLint、rustfmt、Clippy            | 通过                                                           |
| 发行验收 / 商店提交检查                  | 如预期保持阻塞，未满足条件不放行                               |

证据：[构建与源码哈希](evidence/phase5/build.json)、[进程回归](evidence/phase5/lifecycle.json)、[候选记录](evidence/phase5/candidate.json)、[隔离转换](evidence/phase5/conversion.json)、[GUI](evidence/phase5/gui.json)、[材料状态](evidence/phase5/readiness.json)。早期隔离测试也通过了 76 条路线，随后因 review 增加私有入口检查而重建；本节只以最终构建的复测作为当前证据。

最终本地候选位于 `.desktop-local/phase5-candidate/z8-work-0.1.0-linux-arm64-validation.tar.gz`，189,868,302 字节。SHA-256：

```text
3a6fb4001b306a810a769fc0880a6d6912c836130f0c3f3dd584a912b3a18798
```

最终引擎在 `.desktop-local/phase5-engines-final/`；实际 GUI 使用 `.desktop-local/phase5-unpacked/z8-work/usr/bin/z8-desktop`，来自最终 tar.gz 解压。GUI 测试环境出现 document portal 的 FUSE 挂载权限警告，GTK 文件选择流程通过；不把该结果记为 strict Snap 或 document portal 授权验收。图形界面仍需要主机 GTK/WebKit，tar.gz 仍是本地验证包。

原始组装器的 `candidate.json` 保留组装时状态；本轮补充证据在上述文档目录，绑定同一归档哈希。源码仍有未提交改动；旧 Phase3/Phase4 报告保留历史哈希，不覆盖为新构建。

## 保护范围与剩余工作

这是进程生命周期清理，不是恶意代码沙箱。Unix 后代主动调用 `setsid`/更换进程组、外部程序单独杀死监视器、内核不可中断 IO，以及 Windows 在创建进程至 Job 登记之间的极短中断窗口，不能由本轮测试证明全部覆盖。Windows 线程在完成登记前保持暂停；测试验证的是已经启动转换后的应用强制退出。异常退出可能留下私有临时文件，已写出的结果与本地历史不会被监视器删除。

仍需完成 P0 Windows x64 MSIX、Linux amd64 strict Snap、macOS arm64 的原生安装、权限、升级/卸载，以及许可/对应源码审查；需要真实商店身份与设置、目标平台截图和隐私支持页上线证据。本轮不改变这些状态，也不执行上传或发布。

## 依据

本轮核对日期：2026-09-08。除官方资料外，核对了锁定版本 process-wrap 10.0.0 的 `std/job_object.rs`、`windows.rs`、`std/core.rs` 和有序 wrapper hook 实现。

- [Rust CommandExt::process_group](https://doc.rust-lang.org/std/os/unix/process/trait.CommandExt.html#method.process_group)：在执行新程序前设置进程组。
- [POSIX 进程组语义](https://man7.org/linux/man-pages/man2/setpgid.2.html)：进程组加入条件与子进程继承关系。
- [管道 EOF 语义](https://man7.org/linux/man-pages/man7/pipe.7.html)：所有写端关闭后读端收到 EOF；写端不会通过 exec 留给转换引擎。
- [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)：kill-on-close 与嵌套 Job 的进程树语义。
