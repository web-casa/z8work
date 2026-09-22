# Phase 22：磁盘空间与保存目录预检

日期：2026-09-09。承接 [Phase 21 私有工作目录](PHASE21_IMPLEMENTATION.md)，补齐 [V1 方案](V1_PLAN.md) 的执行前空间与输出权限检查。目标是在明显无法完成写入时提前停止，避免长时间编码后才发现保存目录不可写。

## 行为

转换建立受管工作目录并尝试回收符合条件的旧会话后，先检查保存目录，再检查输入副本所需的缓存空间；通过后才复制输入和调用编码引擎。预览同样检查工作目录空间，但不要求用户选择保存目录。

保存目录检查使用系统报告的可用空间，再创建一个随机 `.z8-write-check-*` 文件，写入少量内容、同步并删除。它不使用输入名或结果名，不能覆盖用户文件。检查失败时任务进入可重试失败状态，不标为保存成功。

每个结果发布前重新读取保存目录的可用空间，按该文件实际编码后的字节数进行检查。PDF 逐页执行，原有已保存页、部分成功、重试与同名避让规则保留。检查通过后，创建、复制、同步和最终提交仍处理真实写入错误。

错误文案区分临时工作目录与保存目录，提供中英文空间不足、文件条目耗尽、权限失败及容量查询失败说明。修复权限或释放空间后，可以使用既有重试操作。非空间相关的错误保留原诊断，不按关键词猜测分类。

[真实桌面保存目录权限错误截图](evidence/phase22/storage-error-zh.png)。测试先通过系统选择器授权目录，再修改其权限，验证转换时会重新检查。

## 最低要求与实现边界

| 检查位置               | 已知写入量             | 额外最低余量 | 文件条目检查                |
| ---------------------- | ---------------------- | ------------ | --------------------------- |
| 输入副本暂存，包括预览 | 原始输入字节数         | 16 MiB       | 系统报告时至少 4 个可用条目 |
| 转换开始前的保存目录   | 尚未知最终输出大小     | 16 MiB       | 系统报告时至少 1 个可用条目 |
| 每个结果的最终发布     | 当前结果实际编码字节数 | 16 MiB       | 系统报告时至少 1 个可用条目 |

这些数值是最低预检要求，**不是预留空间，也不是输出大小或编码中间文件峰值的预测**。输出和缓存可以位于同一卷或不同卷，检查分别针对实际目录；其他程序仍可能同时占用磁盘。16 MiB 是当前原型的固定余量，可能阻止剩余空间更少的小任务，不宣称精确预测是否一定能够完成。

Unix 使用 `statvfs` 的 `f_bavail × f_frsize`，而不是包含特权保留块的 `f_bfree`；对乘法和转换检查溢出。文件系统报告 `f_files == 0` 时不假定存在 inode 数量限制，其他情况下检查 `f_favail`。文件条目数与字节空间是两个不同限制。[Linux man-pages：statvfs](https://man7.org/linux/man-pages/man3/statvfs.3.html)

Windows 使用 `GetDiskFreeSpaceExW` 的调用者可用空间，保留 `u64` 精度，支持 UTF-16 路径，并给 UNC 根目录补结尾分隔符。该 API 的调用者空间可受用户配额影响；Windows 分支不假装能够查询 inode 数量。[Microsoft API 文档](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdiskfreespaceexw)

新增 `native::storage` 为原生库内部模块；Windows 复用已有 `windows` 依赖并开启 `Win32_Storage_FileSystem`，没有增加 shell 命令、任意路径 IPC 或在线服务。前端仅将有限的原生错误格式转换为本地化文本；`u64` 数值用 `BigInt` 处理，所需 MiB 向上取整、可用 MiB 向下取整，避免显示出来的数值误导用户认为空间够用。

## Review 与修正

| 发现                                                           | 修正与验证                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 输入副本迁到缓存后，输出目录不可写可能直到编码结束才发现       | 新增真实试写；使用空引擎注册表的原生测试验证权限错误先于引擎调用，输入副本未暂存         |
| 仅检查权限位无法覆盖 ACL、挂载只读或写入配额                   | 创建随机新文件、写入、同步、删除；仍保留最终写入错误处理                                 |
| 缓存与输出可能不在同一卷，不能只查一个路径                     | 输入暂存与结果发布分别查询各自实际目录                                                   |
| 系统仍有可用字节，但 inode 耗尽可能无法创建文件                | 在系统报告有效文件条目统计时增加独立检查；提供明确文案                                   |
| 容量计算或 UI Number 转换可能丢失大整数精度                    | 原生宽整数计算与 checked addition；前端 BigInt 处理，并测试 u64 上界及舍入方向           |
| 先检查空间再清理可能使可回收缓存持续阻止新任务                 | 调整为先执行受管目录回收；原生测试验证保存预检失败时，符合条件的残留也已回收             |
| 预检通过后权限仍可能改变                                       | 发布时复核并保留实际创建/写入/同步失败；原生测试验证旧结果保留，权限恢复后避让同名保存   |
| 新测试辅助函数仅在 Unix 使用，Windows 测试编译可能产生未使用项 | 将对应集成测试模块限定为 Unix；Windows/macOS 原生核心含测试目标均通过编译检查            |
| GUI 语言测试误用了网页语言标识                                 | 对照既有桌面偏好枚举改为 `zh_hans`；驱动遇到不存在的选择项立即报错，随后重新执行完整回归 |

最终 review 未发现本阶段尚未修复的阻断问题。

## 验证与复现

```bash
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
cargo fmt --manifest-path src-tauri/Cargo.toml --all --check
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo build --locked --manifest-path src-tauri/Cargo.toml --features development-engines,custom-protocol

TMPDIR=/home/ivmm/VERT/.desktop-local/phase22/tmp \
Z8_XDOTOOL=/tmp/z8-m0-deps/extracted/usr/bin/xdotool \
Z8_XDOTOOL_LIBRARY_DIR=/tmp/z8-m0-deps/extracted/usr/lib/aarch64-linux-gnu \
Z8_DEV_ENGINE_MANIFEST=/home/ivmm/VERT/.desktop-local/engines.json \
  xvfb-run -a --server-args='-screen 0 1280x900x24' \
  dbus-run-session -- bun run desktop:test:storage
```

先创建临时目录，路径按本机环境调整。GUI 使用隔离的 XDG 数据、配置与缓存目录，需要原生引擎、tauri-driver、WebKitWebDriver、Xvfb、D-Bus、xdotool 和 Python 3。`--storage` 包含前一阶段的工作目录、图片/PDF/媒体预览和导入回归。

| 检查                                    | 结果                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| Svelte                                  | 0 errors / 0 warnings                                                |
| Node 22.22.2 / 24.18.0                  | 各 149 项通过                                                        |
| Rust native / no-default-features       | 87 通过、2 ignored（由测试启动的既有子进程 fixture）                 |
| Rust native / development-engines       | 86 通过、2 ignored                                                   |
| Rust app                                | 7 项通过                                                             |
| 前端与原生构建                          | 通过                                                                 |
| Clippy、rustfmt --all、ESLint、Prettier | 通过                                                                 |
| Windows x64 MSVC / macOS ARM64 原生核心 | 含测试目标交叉编译检查通过，未运行目标系统测试                       |
| linux-portal                            | 编译通过，不代表 strict Snap 安装验收                                |
| 真实 Linux WebKit GUI                   | 54 项检查通过，含 5 项保存预检专项；保留 20 个有效预览样本与导出回归 |

新增 7 项原生测试覆盖容量边界、溢出、文件条目数、真实文件系统查询、中文目录、试写清理、不可写目录、引擎调用前停止、残留清理顺序和发布权限变化。新增 4 项前端测试覆盖两种位置、本地化、整数边界、舍入及错误透传。

GUI 在已有结果的目录中撤销写权限，验证失败提示、无新结果、中英文说明；恢复权限后重试并实际保存，逐个比较原有结果的 SHA-256，确认原输入和已有结果不变，同时检查试写文件已删除。空间不足通过向容量判断函数提供边界值，以及真实文件系统的超大需求检查验证，**没有通过填满共享磁盘进行测试**。

[环境与二进制摘要](evidence/phase22/environment.json)、[源码收据](evidence/phase22/inputs.json)、[GUI 报告](evidence/phase22/storage-gui.json)和[证据清单](evidence/phase22/inventory.json)保留本轮结果。最终源码收据与构建输入一致，GUI 使用本轮审查修正后的二进制，退出码为 0。

## 仍需验证的限制

- 预检后发生的空间竞争、编码中间文件膨胀、配额变化、断盘和磁盘 I/O 故障仍可能导致失败。未增加完整磁盘配额、空间预留或编码后结果暂存重试机制；普通单文件保存失败仍需重新转换。
- 文件系统容量查询失败时会停止任务并显示错误，不把未知容量当成无限空间。部分 FUSE/网络文件系统的统计含义可能不同，需目标环境验收。
- 随机试写文件正常清除；极窄窗口内强制终止或目录不允许删除文件时，可能留下该小文件。它位于用户输出目录，不纳入应用缓存清理，避免扩展删除边界。
- 预检包含同步文件系统调用；异常网络盘可能延长开始或取消等待，任务期限不能强制中止内核中的文件系统调用。
- Windows/macOS 原生运行、真实低配额与只读挂载、MSIX/Snap strict 安装和商店验收仍未完成。已有安装候选需重建，本轮不推送、发布或上传商店。
