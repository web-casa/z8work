# R5 补充：Windows 当前候选同步与 ICC 验证修复

日期：2026-09-12。基线 `71beee7`，修复提交 `5660d46`。本轮重建 Windows x64 应用、验证器、交接目录和两份开发 MSIX，同步此前保存失败分类等共享修复，并实测锁定 Windows 引擎的 PDF 色彩。R5/R6 整体验收继续保留；没有签名、安装、推送或商店发布。

## 最终候选

| 对象              | 本地位置                                                                  | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 当前开发 MSIX     | `.desktop-local/windows-icc/msix-reviewed/z8-work-development.msix`       | `654639ab58d6e64387d8b63b6282eed903627b7729097e8ebbc6ff083dd8260b` |
| 合成较低版本 MSIX | `.desktop-local/windows-icc/msix-reviewed-lower/z8-work-development.msix` | `de109f9edd1ab3baf5173295dfcef9e2debe7e23884a175ddeab4e14aed74b5c` |
| 当前 Windows 程序 | `.desktop-local/windows-icc/candidate-final/z8-desktop.exe`               | `54a8c439370a3fe2a30c6b02a920e24024c029a1f69a0cbd0a378c46dadbd576` |
| 引擎清单          | `.desktop-local/windows-icc/engines-final/engines.json`                   | `1bccb81d8067e0b7ac7b0fe6aaaffcf25cc8497187826456e0774d192a0fcc8b` |

两份包均为 172,865,022 字节，约 165 MiB。开发身份仍为 `Z8Work.Desktop.Dev` / `CN=Z8.Work Development`，应用版本 `0.1.0`；当前包 `1.0.1.0`，合成较低包 `1.0.0.0`。两份包均未签名。较低包使用当前应用代码，仅供同身份包版本升级测试，不是历史发行版，也不证明旧数据迁移。

独立 Windows 交接目录 `.desktop-local/windows-icc/handoff-reviewed/` 包含最终程序、引擎、测试 EXE、监督程序、源码收据和验收脚本。未把先前 Phase 28 的应用或验证器冒充本次构建。中间包保存在其他输出目录，其哈希不作为最终候选。

## 定位与修复

Windows 锁定 MuPDF 已通过独立 PDF ICC 检查，无需替换引擎版本。PNG/JPEG/WebP/AVIF 最大通道误差为 **7/8/6/8**，固定阈值为 8/255；关闭 ICC 的负对照误差为 **51**，超过要求的 30。原始数据见 [PDF 色彩报告](evidence/windows-icc-20260912/pdf-color.json)。该独立探测使用修复前的验证器，最终验证器结果另以最终完整矩阵绑定，不借用不同清单的整包证据。

完整矩阵首次运行在图片 ICC 元数据导出步骤失败：`C:\users\wine\…\output.icc` 的盘符被 ImageMagick 当作 coder，报错路径丢失 `C:`。小型探测进一步证明，普通 `C:` 输出也可能成功退出却生成 12,288 字节的 cyan 原始数据；显式 `ICC:C:…` 才导出与原配置完全一致的 **480 字节**。此前普通 `Z:` 路径探测不能重现，因此保留了 C 盘和扩展输入路径探测，未仅根据报错猜测。

[phase27_smoke.rs](../../src-tauri/native/src/phase27_smoke.rs)仅为 ICC **输出**增加显式 `ICC:` 前缀。没有把 `.icc` 加入通用参数转换，因为 `-profile` 输入仍需普通文件路径。已有栅格验证参数及生产转换的 coder 路径处理保持原有设计。Linux 上也执行了相同导出并逐字节比较通过。未放宽色彩、尺寸、透明度或编码质量门槛。

Review 还处理了两个交付问题：历史预解压目录名字与现有组装器约定不同，改从锁定归档重新解压并校验；修复后重新链接产生不同应用字节，故重建最终交接和 MSIX，并核对最终 EXE 的运行信息，不假定重新构建必然得到相同哈希。

完整矩阵还暴露了旧诊断预算不足：修复后的第二轮在校准中被原 20 分钟控制器结束，完整性报告到失败报告的时间差为 **1200.040 秒**，末尾仍处理 16 位渐变图。保留[该轮失败](evidence/windows-icc-20260912/wine-final/report.json)，不把没有完整输出算作通过。[Windows 引擎检查器](../../scripts/desktop-windows-engines-check.mjs)及[交接验收脚本](../../scripts/desktop-windows-acceptance.mjs)现仅为 Wine 诊断采用 60 分钟总上限；原生 Windows 仍为 20 分钟，各条引擎命令的上限不变。该调整不是原生性能验收通过，也没有放松质量断言。

## 验证与限制

| 检查                                                  | 结果         | 范围                                                                                                |
| ----------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| Windows x64 Release / PE / DLL 静态检查               | 通过         | cargo-xwin + 固定 MSVC 配置；主机 Linux ARM64，非 Windows 原生构建                                  |
| Node 桌面脚本测试                                     | 通过         | 183/183                                                                                             |
| Rust 核心测试                                         | 通过         | Linux ARM64 115 项通过、3 项既有忽略；不计为 Windows 原生结果                                       |
| Rustfmt / Clippy                                      | 通过         | 本次改动及 engine-validation 编译路径，Clippy `-D warnings`                                         |
| 独立 PDF ICC 检查                                     | 通过         | Wine 9.0 + AMD64 仿真；4 格式和负对照                                                               |
| 最终完整转换矩阵                                      | 通过         | 84 条路线、20 项质量、240 次图片校准、4 格式 PDF ICC；Wine 仿真，不计原生性能验收                   |
| 最终生命周期诊断                                      | 通过（复测） | 最终首次 9/10；不并行复测 10/10 通过，保留 Rosetta 不稳定记录                                       |
| 两份最终 MSIX                                         | 通过         | 每份 538 个载荷文件、8,658 个 BlockMap 块、SDK 解包逐文件校验                                       |
| 许可文本组装                                          | 通过         | 286 个应用依赖组件无缺失文本，包内 520 个许可条目，最大 426,299 字节；完整许可/对应源码审查仍未完成 |
| Windows 原生安装、GUI、WebView2、权限、升级卸载、WACK | 未执行       | 没有原生 Windows x64 测试环境；Wine 与包结构检查不能替代                                            |

Wine 诊断中两次管道压力测试输出 `rosetta error: invalid gdt selector index 5`，有的进程仍返回成功退出码。既有 `validateTestResult` 拒绝没有“1 passed / 0 failed / 0 ignored”总结的输出，因此未误记通过。中间一次独立复测 10/10 通过；最终候选首次 9/10，随后不并行复测 10/10，见[独立复测](evidence/windows-icc-20260912/runtime-isolated/report.json)。这些结果仍不能关闭 Windows 原生缺项。这里没有认定兼容层错误的完整根因，也没有为 Wine 修改产品进程控制或放松断言。

最终完整矩阵以成功退出结束，耗时 **1525.614 秒（约 25 分 26 秒）**，超过旧的 20 分钟预算。[原始结果](evidence/windows-icc-20260912/wine-extended/conversions.json)由现有 `validateQuality` 复核；最终 PDF 误差同样为 7/8/6/8，负对照为 51。[候选绑定报告](evidence/windows-icc-20260912/candidate-evidence.json)再次核对测试引擎、handoff 与两份 MSIX 解包后的应用和完整引擎清单；另核对 handoff 内测试 EXE、监督程序与已执行文件的哈希一致。520 个许可文本均可严格按 UTF-8 解码；没有把静态检查当作 GUI 阅读通过。

## 来源、重跑和剩余工作

使用 [Windows 交叉构建脚本](../../packaging/desktop/windows/build-cross.sh)、[引擎锁定](../../packaging/desktop/windows/engines.lock.json)、已有 notices / handoff / msix prepare / pack 工具。引擎来源版本保持 ImageMagick 7.1.2-31、FFmpeg 9.0.1、MuPDF 1.28.0、Pandoc 3.11，原归档及所选文件均核对锁定哈希。Microsoft makemsix 工具 SHA-256 为 `4890d7d3e5257362f831695124665ff796eef83e1ea655390c910f1f2dae8710`。

[构建输入](evidence/windows-icc-20260912/initial-inputs.json)和[修复后输入](evidence/windows-icc-20260912/reviewed-inputs.json)各记录 455 个文件，仅 `phase27_smoke.rs` 不同；最终[工具输入](evidence/windows-icc-20260912/final-tool-inputs.json)另包含上述两处 Wine 时限修正；应用、引擎二进制和测试 EXE 未因诊断脚本改动再次编译，最终 handoff 和两份 MSIX 已重新组装。[提交后收据](evidence/windows-icc-20260912/handoff-inputs.json)与最终工具输入的 455 个文件完全一致。Wine 镜像 `z8-phase11-wine:local` 的 ID 为 `sha256:261b4b425a1f94e72cfc69f465fe7942b96e8727dbbddf0f1b944ab9013abeb8`，执行显式 AMD64、断网、普通 UID、移除 capabilities、4 CPU / 4 GiB。诊断使用任务专用 Wine prefix；未修改旧候选或系统安装。

在真实 Windows x64 机器复制最终 handoff 目录，并使用 Node 22+，从其根目录执行：

```powershell
node scripts/desktop-windows-acceptance.mjs --root . --output ../windows-native-new --runtime native
```

输出目录必须是新的兄弟目录。原生执行成功之后仍需分别完成 GUI、WebView2、MSIX 签名侧载、权限、升级卸载、WACK 和许可审查；本命令不进行安装或提交。

报告和失败日志保存在 [evidence/windows-icc-20260912](evidence/windows-icc-20260912/)，原始大文件保存在 `.desktop-local/windows-icc`。Windows 原生验收与 macOS ARM64 候选仍是后续工作；[新 AMD64 Snap](PHASE28_CORE24_ICC.md)仍待 strict 原生验收，R7 不冻结或宣布发布。
