# R6 补充：写入途中失败与 I/O 错误分类

日期：2026-09-10。代码提交：`7c00068`。本轮回到 Phase 29 的实际故障缺项，不增加 Phase 31。已完成 Linux 本机写入失败补测、生产错误映射和双语提示修复及 review；R5–R7 整体验收仍未关闭。

## 实际问题与修复

原先创建临时输出、写入和 `sync_all` 的错误均拼接为 `Cannot write to output folder`，稳定错误分类将它们一律视为输出权限问题。最终发布失败则使用 `Cannot save output`，没有对应类别，会落入普通转换错误。磁盘、文件大小或配额限制因此可能给出不准确的处理提示。

新增内部 `failure::output_io`，在格式化日志之前按 `std::io::ErrorKind` 分类：空间满、配额超限、文件过大归入 Storage；权限不足和只读文件系统归入 OutputPermission；其他输出 I/O 错误归入 Publish。复用于写入预检、输出工作目录、临时结果创建、写入、同步和最终发布。同步修正中英文存储提示，明确空间、配额和文件大小限制。公开枚举及 TS/Rust 契约不变，没有靠匹配操作系统本地化错误文字或跨平台 errno 来判断类别。

真实复现记录保留了 `File too large (os error 27)` 被错误归为权限问题的失败；修复后同一场景正确归为存储问题。额外单元测试覆盖不包含英文错误关键词的错误消息，以及 Unix ENOSPC、EDQUOT、EFBIG、EIO 的错误对象。除 EFBIG 场景外，这些错误对象测试不冒充真实配额、断盘或磁盘中途耗尽验证。

## 新增真实写入失败

沿用已有 `desktop:test:faults` 与限额 tmpfs 容器，增加 `file-size-limit`，故障报告升级为 schema 2，共六项必需检查。旧 schema 1 的五项报告仅作历史证据，不能通过当前故障套件校验。

独立验证器在编码与校验结束后，临时将自身 `RLIMIT_FSIZE` 的软限制设为 256 B，并忽略 SIGXFSZ，使写入返回 EFBIG。硬限制保持原样，生产应用不包含这个注入入口；它不是宿主服务器的磁盘配额设置。限制和原信号处理通过守卫恢复，正常恢复失败会使测试失败，提前返回也执行清理。恢复前不再启动引擎进程。

实际验证：

- 发布及原目录重试都返回 EFBIG，已编码结果保持暂存。
- 原文件和已有输出字节不变，目录中没有遗留部分发布文件。
- 恢复限制后移走原输入路径，仅保存 611 B 的结果成功；超过原限制的成功保存也验证了限制确实解除。
- 同名目标已有 `source-z8-1.png` 时生成 `source-z8-2.png`；对保存结果解码并比较像素，验证正常工作区清理。
- 保留原有只读挂载、inode 耗尽、发布前磁盘满、权限撤销和会话清理测试；容器和镜像均已清除。

依据 [Linux getrlimit 文档](https://man7.org/linux/man-pages/man2/getrlimit.2.html)核对了软/硬限制及 SIGXFSZ/EFBIG 行为，并依据 [Rust ErrorKind 文档](https://doc.rust-lang.org/std/io/enum.ErrorKind.html)核对错误类别。此处测试的是进程文件大小限制下的真实写入失败，不等同于真实用户配额、写入途中 ENOSPC、物理断盘或强制终止。

## Review 与验证边界

检查了限制只作用于专用验证器、硬限制不变、SIGXFSZ 恢复、异常返回守卫、已有文件保护，以及恢复后才运行解码。报告校验增加保存字节数要求，文件限制场景必须保存超过 256 B 的完整结果；缺少场景、旧报告、错误类别、零限制或未保存完整结果均拒绝通过。

Rust 核心 115 项通过、3 个既有 ignored 不计入通过；桌面 Node 22/24 各 182 项通过。原生核心 Windows x64/macOS ARM64 交叉检查、桌面 Rust 测试、Clippy/Rustfmt 与改动文件静态检查的原始结果保存在证据目录。交叉检查不是目标系统运行。Svelte 0 errors、0 warnings，桌面前端构建通过；旧兼容性数据集提示保留在日志中。

最终正式应用的八项产品 GUI 检查与 67 项保存恢复相关 GUI 回归通过，两个报告的应用 SHA-256 均为 `38771e1466c6a04834c4fcd81b908427f4ee006e97b6526eb461a96c64d42c08`。后者包含选择取消、退出提示、原输入消失后的仅保存、同名保护及工作区清理；属于本机 Tauri/GTK 正式应用验证，不是安装件验收。

本轮重建 Linux 正式应用并生成新候选，应用/压缩包哈希及对应 GUI 报告独立记录。原生引擎清单沿用 Phase 28；其中旧 `bundle-check` 仅用于引擎转换/质量回归，写入错误修复由本轮新核心故障验证器及新应用验证。不会把旧验证器说成包含本次修复。Windows/Snap 仍需重建并原生验证，不把旧候选报告换上新源码名称。

最终压缩包解包后，84 条转换路线、20 项质量检查、240 次预设校准通过。包 SHA-256 为 `0c9a3093c5017d4ced42f9b0aea374b5537139f2e4e6ca04b4fc1b6084b5a3ea`；具体报告保留安装、升级、卸载与许可未验收状态。

原始证据见 [evidence/phase29-write-faults](evidence/phase29-write-faults/)。本地大文件目录：`.desktop-local/phase29-write-faults`；最终候选位于 `linux-reviewed/`，最终故障记录为 `final/`。`before/` 保留复现失败，`fixed/` 为中间调试结果，不覆盖历史证据。首次候选 `linux-candidate/` 的质量回归在补齐双语提示后主动中断，保留中断日志；最终只引用 `linux-reviewed/` 的完整报告。

## 重跑

从仓库根目录运行，使用新的输出目录：

```bash
cargo build --locked --release --manifest-path src-tauri/Cargo.toml \
  -p z8-native --features engine-validation --bin fault-check
node scripts/desktop-faults.mjs \
  --engines .desktop-local/phase28/engines-reviewed \
  --verifier src-tauri/target/release/fault-check \
  --output .desktop-local/write-faults-recheck --sudo
```

仅在需要 `sudo -n docker` 的环境使用 `--sudo`。执行器拒绝现有输出目录、不合格的 tmpfs/平台或变化的输入；不需要真实用户文件。候选构建沿用 [Phase 29 交接](PHASE29_ACCEPTANCE.md)的命令，替换为新的输出目录。

仍待完成：目标平台安装/升级、实际配额与断盘、强制退出/睡眠恢复、剩余压力和性能、PDF ICC、许可/完整源码及线上桌面支持页面部署。此项修复不代表完整 `faults` 发行验收通过。
