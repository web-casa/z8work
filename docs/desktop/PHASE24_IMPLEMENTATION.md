# Phase 24 / R1：首版能力、源码基线与平台准备

日期：2026-09-09。**R1 开发、review、修复及本机验证完成。** 本阶段完成基线与条件清点；Windows/macOS 原生环境、AMD64 strict Snap、正式账号字段与候选级许可仍按 R5/R6/R7 追踪，不表示安装或发行验收完成。

## 交付

- [首版能力矩阵](../../packaging/desktop/v1-scope.json)：20 个输入扩展、84 条声明路线，关联所需引擎、实现、样本/生成器、语言、产物和验收阶段。首版格式没有扩展。
- Rust 契约测试实际调用路线和引擎能力函数，逐个移除所需引擎验证禁用；Node 测试核对前端格式、语言、产物身份和 CI 边界。这些不是 84 次真实编码。
- 根目录 `rust-toolchain.toml` 固定 1.96.0；桌面 CI 同步固定 Rust，并给缺少显式 Node 的 packaged-app job 补 22.22.2。
- CI 触发范围覆盖共享 `src`、根构建/检查配置、测试样本、脚本和静态材料；前端 job 保存源码收据，并在检查后验证未变化。
- 复用 `desktop-windows-inputs.mjs`，抽出共用输入路径清单；增加测试样本、工具链、检查配置、Git attributes 和静态隐私/支持页。保留旧命令名称及参数，兼容已有 Windows 工具。
- [环境、引擎来源风险和性能测量计划](PHASE24_READINESS.md)：明确已检查、失败、未执行和后续入口。
- 现有 Phase 1–23 的桌面代码、文档及新门禁已整理为本地提交；原有网页改动保留。没有推送、上传或商店写操作。

## 可复现源码基线

| 提交                                       | 内容                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `820a5d1e0aee8d132a632ffe6455e98ab0d71c50` | 将此前未提交的桌面实现、资料及 Phase 24 能力/CI/收据门禁整理为基线            |
| `5be9a93bf4c2eebafbecc27e4b74345e27195871` | review 补齐静态政策页面及 Svelte 配置输入，增加页面变更检测；本轮最终代码基线 |

在 `.desktop-local/phase24/checkout` 创建独立 Git worktree，检出最终代码基线；没有复制原工作区的 `node_modules`、Rust target 或构建产物。Bun 通过锁文件重新安装 416 个包，使用本机包缓存；Rust 复用工具链/依赖下载缓存并在独立 target 编译。此验证不等于无缓存下载或首次离线安装测试。

[输入收据](evidence/phase24/inputs.json)记录 368 个构建/验证输入，隔离安装、测试、构建后核对不变。收据绑定该代码提交；本实施记录及证据在后续文档提交中归档，不冒充原代码提交自带的验证报告。代码没有修改转换或保存路径，仅新增原生测试。

原始 498 份历史证据保留字节。[历史证据摘要](evidence/phase24/historical-evidence-hashes.json)可用于核对；`.gitattributes` 禁止对这些证据自动转换换行，仅对原始 `.txt` 日志关闭空白告警。源码和普通文档仍检查空白。基线检查排除了 `.env`、引擎/安装件、构建产物和缓存；常见凭据模式扫描无匹配，此启发式扫描不能证明不存在所有形式的秘密。

## Review 与修正

| 问题                                          | 影响                                      | 处理与验证                                                                                        |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 共享像素组件/样式和根配置未触发桌面 CI        | 网页共享改动可能破坏桌面却不执行检查      | 扩展两类事件的 paths，新增每个收据入口都由 CI 覆盖的契约测试                                      |
| 原生 `include_bytes!` 样本未纳入旧收据        | HEAD 未变、样本已变时，旧报告可能被误复用 | 纳入 tests；隔离小仓库测试样本修改、增加、删除、配置漂移与拒绝覆盖收据                            |
| 只补编译源码，仍漏静态材料校验输入            | 隐私/支持页变化不能被收据识别             | 第二轮加入 static/desktop-info 与 Svelte 配置，真实篡改页面后验证收据拒绝                         |
| CI Rust 使用浮动 stable，部分 job 未固定 Node | 本机与 CI 工具链可能不同                  | 根工具链与四个 Rust job 固定 1.96.0，各安装依赖 job 固定 Node 22.22.2；契约测试与 actionlint 通过 |
| 新记录可能把声明路线数或 CI 配置当实测结果    | 高估格式/平台完成程度                     | 区分路线契约、样本质量、目标包；远端 CI、Windows/macOS 原生和商店状态明确未执行                   |
| 首次归档历史日志触发空白检查                  | 修改原始日志会使已有证据哈希失效          | 保留原始输出，attributes 限定到证据日志；重新检查全部暂存差异通过                                 |
| 仅记录 HEAD 不能识别此前大量未提交桌面代码    | 隔离 checkout 无法复现功能                | 整理本地提交并从真实提交重建；复核收据及历史证据字节                                              |

本轮新增 3 项 Node 测试和 1 项原生测试。没有发现本阶段范围内未修复的阻塞代码问题。能力矩阵的预算是源码清点记录，并未改成运行时配置；未执行项目保留为后续门槛。

## 验证结果

| 检查                                          | 结果   | 覆盖边界                                                          |
| --------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0 桌面测试               | 通过   | 各 154 项；最终代码的隔离 checkout 运行                           |
| Rust native，无默认 feature                   | 通过   | 92 项、2 ignored（既有子进程 fixture）；隔离 target 运行          |
| Rust native，development-engines              | 通过   | 91 项、2 ignored；主工作区运行                                    |
| 桌面 Svelte                                   | 通过   | 0 errors / 0 warnings；另有依赖工具的 Browserslist 数据过期提示   |
| 桌面前端构建、冻结依赖安装                    | 通过   | 独立 worktree；不等于最终自包含桌面安装包                         |
| 静态商店材料字节检查                          | 通过   | 页面与源材料一致；报告整体提交状态仍为 blocked                    |
| rustfmt、Clippy、ESLint、Prettier、actionlint | 通过   | 相关源码、配置和新增文档                                          |
| Windows x64 / macOS ARM64 原生核心交叉检查    | 通过   | 含测试目标；不是原生 app、GUI 或安装验收                          |
| 本机 Snap 环境预检                            | 失败   | 退出码 2：架构、发行版与 strict 条件不符，保存失败报告            |
| Windows/macOS 原生运行、三端安装、远端 CI     | 未执行 | 目标执行入口或候选/账号条件尚未齐备；本轮未触发远端任务           |
| GUI 与真实引擎转换重新运行                    | 未执行 | 本阶段没有改运行路径，不把 Phase 23 的 GUI/转换证据重复计为新通过 |

证据：[环境与缺项](evidence/phase24/environment.json)、[隔离验证摘要](evidence/phase24/verification.json)、[Snap 预检](evidence/phase24/snap-preflight.json)、[完整文件清单及摘要](evidence/phase24/inventory.json)。本轮文档只使用本地检查和固定历史资料，没有宣称重新核对最新商店规则。

## 复现

从最终代码基线创建独立 checkout 后，在该目录运行：

```bash
bun install --frozen-lockfile
bun run desktop:check
bun run desktop:test:ui
bun run desktop:build
bun run desktop:store:check
cargo test --locked --manifest-path src-tauri/Cargo.toml -p z8-native --no-default-features
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -p z8-native --all-targets --features development-engines -- -D warnings
actionlint .github/workflows/desktop.yml
```

需要 Node 22.22.2 或本轮检查的 Node 24.18.0、Bun 1.4.0 与固定 Rust 工具链；部分既有打包测试使用平台工具，具体覆盖见测试报告。使用充足的临时目录；本机因 `/tmp` inode 紧张使用 `.desktop-local/phase24/tmp`，没有清除共享临时文件。

从仓库根目录创建及核对收据，输出必须是新文件：

```bash
node scripts/desktop-windows-inputs.mjs --output NEW_FILE.json
node scripts/desktop-windows-inputs.mjs --verify NEW_FILE.json
```

后续源码或提交变更需重新建立收据，不能直接复用本轮记录。完整代码基线不代表逐字节确定构建；系统依赖与目标引擎仍在 R5 收敛。

## 下一阶段

R2 / Phase 25：实现编码成功后仅重试保存，明确暂存所有权、预算/有效期、取消/退出和历史兼容。平台、身份和许可缺项不会阻止这部分开发，但仍阻止 R5/R6/R7 对应验收完成。
