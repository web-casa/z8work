# Phase 21：原生临时工作目录与异常退出清理

日期：2026-09-09。承接 [Phase 20](PHASE20_IMPLEMENTATION.md)，补齐 [V1 方案](V1_PLAN.md) 中“异常启动只清理可确认归属且不属于活动任务的临时数据”。本阶段覆盖桌面转换与原生预览的工作目录，不改变已保存结果和历史恢复的授权规则。

## 用户可见变化

桌面转换的输入副本、引擎配置和编码中间文件统一写入应用缓存中的私有工作目录。任务成功、失败或取消后仍会尝试立即删除；若程序被强制终止，后续启动或任务会检查遗留会话。

清理先取得会话文件锁。仍持锁的会话保留；首次发现已解锁的会话只记录发现时间，至少 60 秒后的下一次检查才删除。因此，立即重启并不意味着马上删除所有残留，应用空闲时也没有后台定时清理。该宽限期配合既有进程树监督机制，避免刚失去父进程的引擎还在收尾时就移除工作文件。

界面显示最近一次取得的清理摘要；有等待或失败时说明会再次检查。缓存根目录不可用时，界面明确提示检查权限和磁盘空间，预览与转换返回错误，不默默改用其他临时目录。界面摘要在挂载时取得，刷新后可重新读取，不是实时清理计数器。

[清理提示截图](evidence/phase21/temporary-cleanup.png)。本轮使用隔离测试配置，不操作用户日常应用缓存。

## 实现

- 新增 `native::workspaces::Store`，根目录由 Tauri `app_cache_dir()` 提供，再追加 `native-work-v1`。前端没有设置、枚举或删除任意路径的新 IPC。
- 每次运行创建随机 `session-*` 目录与 `lease.json`，整个会话持有排他文件锁。每个任务创建独立的 `job-*` 工作目录，任务持有 `Arc<Store>`，直到最后一个工作目录释放后才允许会话结束。
- Unix 根目录、会话与任务目录使用显式 `0700` 权限，检查根目录和待清理会话的所有者与权限。既有不安全根目录直接拒绝，不自动修改它的权限。Windows 使用用户应用缓存位置与继承的访问控制，尚未完成目标系统实测。
- 转换通过 `ConversionContext.workspace` 接入；预览通过复用原有授权、排队和取消逻辑的 `preview_with_workspace` 接入。图片、PDF、媒体共享此机制，不另建一套转换流程。
- 启动及创建任务工作目录前检查残留。每次最多查看 128 个根目录条目，归属标记最多读取 1024 字节，严格校验 schema、类别和会话名称，跳过未知目录、损坏标记及链接/特殊文件；Unix 还拒绝多硬链接标记。锁被占用计为活动会话，锁的 I/O 错误计为检查失败。
- 删除载荷时保留归属标记，最后才删除标记与会话目录。普通退出也采用这个顺序，避免部分删除失败后无法再次识别残留。清理全程持锁；时钟回拨只延后宽限期，不缩短它。
- 最终发布继续通过输出目录中的临时文件与 `persist_noclobber` 完成，保留原有校验、流式复制和禁止覆盖行为。缓存可以和输出位于不同文件系统，不将缓存路径直接跨盘 rename 为用户结果。

文件锁错误分类依据 [Rust TryLockError](https://doc.rust-lang.org/std/fs/enum.TryLockError.html)。递归删除采用标准库实现，后代符号链接不会被递归跟随；参考 [Rust remove_dir_all](https://doc.rust-lang.org/std/fs/fn.remove_dir_all.html)。这些机制用于应用私有目录，并非抵御拥有同一用户权限的恶意进程持续替换目录的安全边界。

## Review 与修正

| 发现                                                           | 修正与验证                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 只依赖正常作用域退出，强制终止会留下输入副本                   | 受管会话与文件锁；真实子进程创建工作目录后被强制终止，再验证宽限期与回收       |
| 按目录创建时间判断可能过早清理仍在收尾的任务                   | 两次观察已解锁状态，间隔至少 60 秒；覆盖时钟回拨与活动锁                       |
| `tempfile` 默认目录权限不保证 `0700`，安全检查会跳过自己的会话 | 查阅本地依赖实现后显式设置目录权限；保留首轮失败日志，修复后测试通过           |
| 递归删除顺序可能先删标记，随后因权限问题留下无法识别的副本     | 载荷先删、标记最后删；正常退出也使用同一顺序；注入目录权限失败并验证随后可重试 |
| 标记链接可能改写目录外文件，后代链接可能指向原文件             | 拒绝链接标记及 Unix 多硬链接标记；验证外部哨兵文件内容保持不变                 |
| 将所有取锁错误都计为活动会话，会隐藏文件系统错误               | 分别处理 `WouldBlock` 和实际 I/O 错误，后者进入失败摘要                        |
| 新增上下文字段只在最小特性构建验证，遗漏开发 smoke 初始化      | 完整开发构建捕获缺项，改用默认字段补全；保留失败日志并验证完整构建             |
| GUI 测试此前只隔离数据与配置，新增缓存可能混入真实用户目录     | 四个相关原生 GUI 驱动补上 `XDG_CACHE_HOME`，本轮专项使用独立缓存和生成文件     |

最终 review 未发现本阶段尚未修复的阻断问题；下面的范围限制仍然保留。

## 边界与后续事项

- 不扫描系统 `/tmp`、用户输出文件夹或旧版本随机临时目录。无法确认归属的数据不按名称猜测删除。
- 输出发布、偏好及历史原子写入仍有各自的短期临时文件；在极窄写入窗口强制终止可能留下这些文件，本阶段未将它们纳入清理。用户已保存结果不会随队列或会话清理。
- 归属标记损坏、未来 schema、权限不合规或未知目录会保留。扫描达到 128 项上限会报告未完成；没有保证所有异常目录都能自动回收，也没有全局临时磁盘配额。
- 128 项是根目录扫描上限，不是递归删除耗时上限。大量小文件或慢盘可能延长启动或下一任务准备时间，尚未增加后台清理线程。
- 删文件不等于安全擦除，未承诺清除操作系统快照、备份或存储介质上的可恢复数据。
- 直接调用原生库且没有提供工作目录的 smoke/兼容入口仍保留旧临时目录行为；桌面生产命令入口强制接入新 Store。
- 这是 Linux ARM64 开发构建验证。Windows 文件锁与删除语义、macOS 原生运行、MSIX/Snap strict 安装、签名及商店验收仍需在目标系统验证。已有安装候选需重建。本轮不推送或发布。

## 验证与复现

```bash
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol

TMPDIR=/home/ivmm/VERT/.desktop-local/phase21/tmp \
Z8_XDOTOOL=/tmp/z8-m0-deps/extracted/usr/bin/xdotool \
Z8_XDOTOOL_LIBRARY_DIR=/tmp/z8-m0-deps/extracted/usr/lib/aarch64-linux-gnu \
Z8_DEV_ENGINE_MANIFEST=/home/ivmm/VERT/.desktop-local/engines.json \
  xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- bun run desktop:test:workspaces
```

先创建临时目录，路径按本机配置调整。真实 GUI 需要原生引擎、tauri-driver、WebKitWebDriver、Xvfb、D-Bus、xdotool 与 Python 3。`--workspaces` 包含原有图片、PDF、媒体预览和导入回归。

| 检查                                    | 结果                                                            |
| --------------------------------------- | --------------------------------------------------------------- |
| Svelte                                  | 0 errors / 0 warnings                                           |
| Node 22.22.2 / 24.18.0                  | 各 145 项通过                                                   |
| Rust native / no-default-features       | 80 通过、2 ignored（由其他测试启动的子进程 fixture）            |
| Rust native / development-engines       | 79 通过、2 ignored                                              |
| Rust app                                | 7 项通过                                                        |
| 前端与原生构建                          | 通过                                                            |
| Clippy、rustfmt --all、ESLint、Prettier | 通过                                                            |
| linux-portal                            | 编译通过，不代表 strict Snap 安装验收                           |
| 真实 Linux WebKit GUI                   | 49 项通过，含 8 项临时目录专项；20 个有效预览样本与既有导出回归 |

原生专项共新增 10 项普通测试及 1 个由测试启动的强制退出 fixture，覆盖会话锁、最后一个任务的生命周期、异常进程退出、宽限期、时钟回拨、未知与损坏标记、扫描上限、链接、私有权限和部分删除失败重试。实际强制终止发生在原生子进程测试；GUI 的启动残留使用预置夹具，不将其表述成 GUI 应用崩溃实测。

GUI 额外验证启动清理提示、活动会话保留、目录外哨兵保留、运行中的输入副本位于缓存、成功和失败任务清空工作目录、保存目录没有转换工作目录，以及不安全缓存根目录的可见错误和预览拒绝。所有输入、输出和缓存都位于本轮生成的隔离目录。

[环境与二进制摘要](evidence/phase21/environment.json)、[源码收据](evidence/phase21/inputs.json)、[最终 GUI 报告](evidence/phase21/workspace-gui.json)和[证据清单](evidence/phase21/inventory.json)归档本轮验证。源码收据覆盖未提交的桌面实现；初始失败日志与最终通过日志分开保存。最终 GUI 使用审查修正后的构建，退出码为 0。新增原生测试随既有桌面 CI 测试入口运行，本轮未触发远端 CI。
