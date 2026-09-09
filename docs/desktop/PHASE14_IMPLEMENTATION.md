# Phase 14：MSIX 签名副本与安装后验收工具

日期：2026-09-09。完成开发、失败路径测试、代码 review 和本机预检。**Windows 签名、安装、安装目录转换及卸载尚未执行**：本机为 Linux ARM64，没有可用的原生 Windows x64 测试桌面。本阶段没有生成新的签名 MSIX，也没有创建证书、修改系统信任或上传产物。

## 交付与范围

新增 `desktop:msix:acceptance`，默认只校验输入；显式 `--execute` 才在原生 Windows x64 测试账户执行签名副本、侧载、已安装载荷检查、原生转换及卸载。核心状态机和 Windows 适配层分离，复用既有 MSIX 内容校验、PE 依赖检查、构建信息检查和 76 条转换路线，未修改或重编译应用、引擎、前端。

本轮使用 Phase 13 的确切未签名字节：

| 项目             | 值                                                                 |
| ---------------- | ------------------------------------------------------------------ |
| 本地包           | `.desktop-local/phase13/package-final/z8-work-development.msix`    |
| 大小             | 171,320,297 字节                                                   |
| SHA-256          | `6116490e6a00735064d32cbef7358a33c1aa520d2b41dcfbf1df3d150fda288d` |
| 准备回执 SHA-256 | `03dce88d7306f040fca8e76caab4687745881ff4bad8771ea7a58311bc1a5b88` |
| 开发身份         | `Z8Work.Desktop.Dev` / `CN=Z8.Work Development` / `1.0.0.0` / x64  |

[本轮预检](evidence/phase14/preflight-report.json)、[原生平台拒绝记录](evidence/phase14/native-guard-report.json)、[解包目录的载荷复核](evidence/phase14/payload-check.json)。这些证据都不是 Windows 安装通过记录。

## 工具行为

1. 要求显式提供独立核对的包 SHA-256；校验准备回执、固定开发配置和标准清单哈希，再运行 Python ZIP/BlockMap 检查。新输出目录必须位于源包和回执所在目录之外，不覆盖已有输出。
2. `--execute` 拒绝 Linux/Wine、Windows ARM64 及 ARM 上的 x64 模拟运行。Windows 适配层要求非提升权限的测试账户，避免把管理员文件访问能力当成普通用户验收。
3. 检查当前账户不存在同名开发包，并创建账户内的运行锁。已有开发安装会导致拒绝，不使用强制更新、强制关闭应用、降级或 `-AllUsers`。
4. 仅对输出目录中的副本调用 `signtool sign /fd SHA256 /s My /sha1 ...`。使用测试账户 `CurrentUser\My` 中已有、未过期、含私钥且 Subject 匹配开发 Publisher 的证书。再用 `signtool verify /pa /v` 与 `Get-AuthenticodeSignature` 核对有效签名及确切签名者。工具不创建、导出、导入或删除证书，不向任何商店提交。
5. Python 检查器新增显式 `--signed` 模式：必须存在签名成员，允许签名工具新增的确切 `AppxMetadata/CodeIntegrity.cat` 元数据并记录其哈希，其余应用载荷仍匹配原始准备回执和全部块哈希。报告只写 `present-not-verified`；数字签名信任由 Windows 工具另行检查。默认未签名检查仍拒绝签名文件，Phase 13 门禁未被放宽。
6. 调用 `Add-AppxPackage` 后读取 `Get-AppxPackage` 的真实安装位置、完整包名、Publisher、版本、架构和状态。只从这个安装目录校验和运行，不以手工解压目录替代安装。逐文件检查只允许明确列出的容器/系统元数据：BlockMap、Content Types、签名及 `AppxMetadata/CodeIntegrity.cat`；多出的其他成员会失败。
7. 从已安装目录运行应用构建信息、WebView2 Runtime 检测和包内 `bundle-check.exe --full`。复用 76 条路线的解码/像素、PDF 页数、文档文本及引擎版本检查；子进程环境移除开发机 PATH 等可替代引擎的变量。转换结束再次核对安装内容。
8. 取得确切安装记录后，无论转换成功或失败，均尝试只卸载该记录，并验证当前账户已无该开发包。若安装调用失败/超时，无法取得并验证归属，则不猜测卸载对象，在报告中写出人工恢复说明。原包、源回执、回执副本、SignTool 和签名副本在结束时复核。

有限任务设有超时和输出上限：Python 内容检查 300 秒，PowerShell/SignTool 操作 180 秒，应用诊断 30 秒，完整引擎矩阵 1200 秒；单次子进程输出上限 2 MiB。中断会失败并尝试清理已经确认属于本轮的安装。强制杀进程、系统重启或 AppX 部署服务在超时后继续工作，不能保证自动回滚，必须检查报告和测试账户状态。

## 运行方式

需要 Node 22+、Python 3.11+ 和当前工作区的脚本/配置。本轮改动尚未提交到远端，因此不能用旧远端 checkout 代替当前工具。使用完整当前工作区副本或经哈希核对的文件传输；运行脚本本身不需要 `npm install`。

跨平台只读预检（输出目录必须尚不存在）：

```bash
node scripts/desktop-msix-acceptance.mjs \
  --package .desktop-local/phase13/package-final/z8-work-development.msix \
  --prepared .desktop-local/phase13/package-final/prepared.json \
  --sha256 6116490e6a00735064d32cbef7358a33c1aa520d2b41dcfbf1df3d150fda288d \
  --output .desktop-local/msix-preflight-next
```

Windows 测试环境还需要 Windows PowerShell 5.1、实际安装的 Windows SDK SignTool，以及已准备好信任关系的开发测试证书。证书 Subject 必须是上述开发 Publisher；正式 Partner Center 身份仍未配置。使用独立测试账户/可恢复测试机，不在测试期间用其他工具并发安装同名包。测试证书信任配置由测试机管理员单独完成，按[微软测试证书说明](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing)操作；不要把私钥、PFX 或密码放入仓库、命令参数或证据目录。

下面的路径与证书指纹必须换成测试机上的真实值，再在**非管理员**终端运行。Node 调用系统 Windows PowerShell，不自动改变执行策略；若企业策略阻止脚本，应按测试机策略解决并保留失败记录。

```powershell
node scripts/desktop-msix-acceptance.mjs `
  --package C:\Z8Test\input\z8-work-development.msix `
  --prepared C:\Z8Test\input\prepared.json `
  --sha256 6116490e6a00735064d32cbef7358a33c1aa520d2b41dcfbf1df3d150fda288d `
  --output C:\Z8Test\run-next `
  --python python `
  --execute `
  --signtool 'C:\实际WindowsSDK目录\x64\signtool.exe' `
  --thumbprint '替换为CurrentUser-My中开发测试证书的40位SHA1指纹'
```

这里的 `/sha1` 用于选择证书；包内容签名算法明确使用 SHA-256。签名副本保留在输出目录供追溯，不覆盖原始包。测试包会在有限检查后卸载，**此命令不启动交互式 GUI，也不用于手动体验**。

报告退出码：0 为本次请求的检查通过，1 为失败，2 为原生检查完成但缺少可用稳定 WebView2 Runtime。无论退出码为何，`acceptance` 均为 `incomplete`，`storeSubmissionAllowed` 与 `redistributionApproved` 均为 `false`。默认预检的 0 不代表安装通过。

恢复时先阅读 `report.json` 和逐步骤请求/响应日志，核对当前账户 `Get-AppxPackage -Name Z8Work.Desktop.Dev` 的确切包名、Publisher 和版本。只在确认属于本轮测试后处理残留；禁止用通配符批量卸载。异常终止可能保留 `%LOCALAPPDATA%\Z8Work-MSIX-acceptance.lock`，确认没有正在运行的验收进程后才可手工移除这个空目录。工具没有新建测试信任；单独配置的证书及信任应由配置者按测试计划清理。

## 验证结果

| 检查                           | 结果   | 实际范围                                                                                                                                        |
| ------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0         | 通过   | 各 130 项；含状态机、失败注入、原生平台与安装身份约束                                                                                           |
| Python 归档测试                | 通过   | 11 项；包含可选 CodeIntegrity 目录与未知元数据拒绝、假签名成员、内容篡改、缺签名、路径/块校验；作为上述 Node 测试中的一个入口调用，不能重复相加 |
| Phase 13 真实 MSIX 预检        | 通过   | 原包哈希、29 个载荷文件和 8,129 块仍一致                                                                                                        |
| 安装载荷检查函数               | 通过   | 对 SDK 解包目录运行：29 个载荷、11 个 PE、缺失依赖 0；没有把目录宣称为已安装                                                                    |
| Linux 上显式请求执行           | 通过   | 测试预期为拒绝；工具退出 1，报告 `failed`，未签名/安装，原包未变                                                                                |
| PowerShell 解析                | 通过   | 本机官方 PowerShell 7.6.6 ARM64 解析，0 错误；不是 Windows 5.1 cmdlet 实测                                                                      |
| ESLint / Prettier / actionlint | 通过   | JS、文档、工作流；PowerShell 不由 ESLint/Prettier 检查                                                                                          |
| Windows PowerShell 5.1 CI 解析 | 未执行 | 已接入 Windows CI，但本轮没有推送或触发远端工作流                                                                                               |
| Windows 签名、安装、运行、卸载 | 未执行 | 缺原生 Windows x64 测试桌面、SDK 与测试证书环境                                                                                                 |
| Rust/GUI/76 路线新运行         | 未执行 | 本轮不改应用二进制；不将以前阶段结果重复报告为新通过                                                                                            |

PowerShell 7.6.6 仅用于 Linux 上的解析检查，来自 Microsoft 的 [PowerShell 官方发布](https://github.com/PowerShell/PowerShell/releases/tag/v7.6.6)。下载归档 SHA-256 为 `924829e54c983648f6f1419a2dc7f9433c861b2fb5bd57736ff096c24f133729`，已对照官方 GitHub Release API 的资产摘要；位于 `.desktop-local/phase14/powershell/`，不进入应用包、不替代 Windows PowerShell 5.1。

## Review 与修正

| 问题                         | 影响                                               | 本轮处理                                                                         |
| ---------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| 签名后只看退出码             | 有签名成员不等于可信签名，签名副本也可能不是原载荷 | 分离 Windows 签名检查与 Python 内容检查，保存新包哈希，测试假签名不被描述为可信  |
| 安装失败后按名称卸载         | 可能删除已有或无法确认归属的安装                   | 安装前两次检查无现有包；只卸载返回并验证过的完整安装记录，歧义失败留恢复说明     |
| 原生运行报错时跳过清理       | 留下开发包，后续测试状态不干净                     | `finally` 执行归属明确的卸载；保留业务错误和清理错误两个字段；失败注入覆盖各阶段 |
| PowerShell 5.1 默认文本编码  | 中文路径被当成本地代码页读取                       | JSON 请求明确 `-Encoding UTF8`，响应以 UTF-8 无 BOM 独占写入                     |
| 已尝试但失败的步骤显示未执行 | 误导安装/签名诊断                                  | 检查开始即置失败，成功后改为通过；未调用的步骤保持未执行                         |
| 子进程成功退出但结果缺项     | 错把未完成的运行检查计为成功                       | 状态机要求 buildInfo、转换和 WebView2 检查有完整结果，另有缺结果测试             |
| 容器元数据与应用载荷混用     | 为兼容安装目录而放松原始包验证                     | 单独导出安装载荷检查入口，只忽略四个明确元数据路径；原始布局仍要求严格成员一致   |
| 清理运行锁方式不适用于目录   | 成功验收后遗留锁或误报失败                         | 使用只删除空目录的 `rmdir`；不递归删除用户目录或其他运行的锁                     |

另在最终 review 对照微软文档和 MSIX SDK 源码时修正了一个签名兼容问题：SignTool 会生成 `AppxMetadata/CodeIntegrity.cat`，不能假定签名只新增 `AppxSignature.p7x`。签名内容模式允许这个明确的可选 footprint、读取其 CRC 并记录哈希，但不将其当作原始应用载荷或自行声称目录信任通过；未知元数据仍拒绝，未签名模式不放宽。[微软对 SignTool 生成目录的说明](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/usage#create-external-catalog)、[SDK 签名摘要结构](https://github.com/microsoft/msix-packaging/blob/25a65f5c1690930813bcc10cdf1d59fa865f2bb1/src/inc/internal/AppxSignature.hpp)。

目前没有在已覆盖路径中发现未修复的阻塞缺陷，但 Windows 适配层仍需要原生环境执行。Node 的模拟适配器测试和 PowerShell 解析不能证明 AppX 部署、证书信任或实际 GUI 成功。

## 尚未关闭的验收项

- Windows 原生执行本工具，归档签名前后哈希、安装注册、全部转换结果和卸载证据。
- 菜单/包身份激活、WebView2 GUI、中文/空格路径的真实文件选择、拒绝/取消、重启保存设置、升级及 WACK。直接执行安装目录的诊断 EXE 不等于验证菜单激活和完整交互。
- Phase 12 的八项 Rust 进程测试仍需 Windows 原生复核；Rosetta 大量日志测试失败未被本轮关闭，报告保留 `lifecycle: not-run`。
- 正式 Store 身份、源码闭包与许可证、Snap strict 实机、macOS 原生候选仍未完成。

本阶段交付的是可复核的验收工具和本机预检证据。要推进安装验收本身，下一步需要原生 Windows x64 测试桌面；继续增加本机静态检查不能替代这一条件。

官方接口核对日期：2026-09-09。[SignTool 包签名](https://learn.microsoft.com/en-us/windows/msix/package/sign-app-package-using-signtool)、[SignTool 参数](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool)、[Add-AppxPackage](https://learn.microsoft.com/en-us/powershell/module/appx/add-appxpackage?view=windowsserver2025-ps)、[Remove-AppxPackage](https://learn.microsoft.com/en-us/powershell/module/appx/remove-appxpackage?view=windowsserver2025-ps)、[MSIX 签名排查](https://learn.microsoft.com/en-us/windows/msix/msix-troubleshooting-guide)。
