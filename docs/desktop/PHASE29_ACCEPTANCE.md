# Phase 29 验证复现与候选交接

日期：2026-09-10。范围和结论见 [实施记录](PHASE29_IMPLEMENTATION.md)。命令在仓库根目录执行，每次使用新的输出目录；不要覆写历史报告。

## 构建及隔离故障验证

需要对应架构的原生 Linux、已组装并通过清单验证的引擎包、Docker，以及 Node 22/24、Rust 工具链。当前运行使用 ARM64；不是 AMD64 strict Snap 验收。

```bash
cargo build --locked --release --manifest-path src-tauri/Cargo.toml \
  -p z8-native --features engine-validation --bin fault-check
node scripts/desktop-faults.mjs \
  --engines .desktop-local/phase28/engines-reviewed \
  --verifier src-tauri/target/release/fault-check \
  --output .desktop-local/phase29/faults-recheck --sudo
```

`--sudo` 仅适用于当前账户通过 `sudo -n docker` 访问 Docker 的环境；有普通 Docker 权限时省略。执行器使用限额 tmpfs 和生成的样本，不需要用户文件。挂载不合格、根用户、输入变动、失败的检查或未完成清理均返回失败。报告明确 `installerAcceptance: false`。

本轮修复前失败保存在 `faults-before/`，最终通过保存在 `faults-final/`。同名中间目录仅是调试历史，正式引用最终记录。

## 当前 Linux 候选

```bash
cargo build --locked --release --manifest-path src-tauri/Cargo.toml \
  -p z8-desktop --no-default-features \
  --features packaged-engines,custom-protocol,gtk-dialog
node scripts/desktop-candidate-linux.mjs \
  --binary src-tauri/target/release/z8-desktop \
  --engines .desktop-local/phase28/engines-reviewed \
  --output .desktop-local/phase29/linux-candidate-recheck
```

实际本轮目录为 `.desktop-local/phase29/linux-candidate`，源代码提交为 `0b22fb5`。程序、包和引擎摘要由该目录的 `candidate.json` 及 `SHA256SUMS` 给出，副本归档在证据目录。候选组装器解包最终压缩包后验证原有 84 条转换路线、20 项质量与 240 次校准；这些检查不作为目标设备性能验收。

GUI 回归明确指定该目录下的 `z8-work/usr/bin/z8-desktop`，使用既有 `scripts/desktop-preview-gui.mjs --product-only`。本机通过 Xvfb/DBus 和 xdotool 操作正式 Release，报告为 `.desktop-local/phase27-gui-EOFBtw/report.json`；目录前缀沿用既有脚本，本轮应用摘要才是关联依据。脚本的开发引擎配置只用于生成样本，正式应用使用包内资源。`candidate.json` 中 `gui: not-run` 是组装时的原始记录，后续 GUI 结果独立保存在 `gui/report.json`，两者应用摘要必须相同。

本轮候选压缩包 SHA-256：`4439c4e722363dbe2c5407f5eba67c8a02ed66c2f1fcd66ff7ffa7f932d82bfa`；应用 SHA-256：`ff4e58f3c2b7d9b7347cb4a5a73a3e46711bcb421042d6e44e9337de59560561`。

源代码收据 `inputs-reviewed.json` 记录受审工作区字节和当时 HEAD。提交后的 `inputs-committed.json` 与受审收据 451 个文件的映射相同，核对结果见 `binding.json`。提交会改变 HEAD；若之后比对收据，应分别报告文件映射和 HEAD，不能把不同 HEAD 的收据直接写成同一个构建时点。

## 必须重建和继续执行的项目

Windows 与 Snap 的 Phase 28 包保持原样，不能复用旧应用摘要来覆盖本次共享 Rust 变更。对应目标具备原生环境后先重建，记录新包哈希，再复用既有验收工具。

| 目标        | 必需输入                                                       | 待执行                                                          |
| ----------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Windows x64 | 原生 Windows 测试入口、重建后的开发 MSIX、同身份较低版本测试包 | 实际安装、WebView2、离线转换、授权、退出、升级、卸载、适用 WACK |
| Linux AMD64 | Ubuntu 24.04 strict 桌面环境、重建 Snap、受控较低版本输入      | portal、路径授权、断网转换、refresh、用户数据及卸载             |
| macOS ARM64 | 原生入口、重定位并签名的引擎/应用、最低系统版本和干净账户      | 启动、转换、授权拒绝、取消退出、设置历史和版本替换              |

本轮本机 Snap 前置检查正确阻断，详细条件见 `snap-preflight/report.json`。未提供其他平台执行入口，未把交叉编译或合成 Mach-O 用例当作原生执行。

继续故障验收时区分：本轮已完成的发布前磁盘/inode/权限故障，与尚未完成的写入中断、配额、断盘、睡眠、强制退出和压力测试。危险测试只在专用限额磁盘、容器或可恢复测试账户执行，并为每个实际候选保留退出码、输出语义、进程树/工作区清理和恢复结果。
