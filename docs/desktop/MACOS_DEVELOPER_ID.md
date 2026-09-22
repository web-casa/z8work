# macOS Developer ID 签名与公证

2026-09-14 新格式包及最新下载入口见 [格式扩展后的跨平台预览包交付](FORMAT_EXPANSION_DELIVERY.md)。实际安装与基础 GUI 使用进展见 [macOS 安装验收](MACOS_INSTALLED_ACCEPTANCE.md)。下文保留前批次产物与验证历史，不能用旧包代表当前 167 条路线。

核对日期：2026-09-13。用于 Z8.Work 官网 / GitHub 直接分发的签名预览包，不是 Mac App Store 构建或提交。

## 凭据

工作流通过 `secrets: inherit` 使用可供 `web-casa/z8work` 访问的组织 Secrets：

- `MACOS_CERTIFICATE_P12_BASE64`：Developer ID Application 身份，包含私钥。
- `MACOS_CERTIFICATE_PASSWORD`：可选；缺失按空字符串导入，本次用户提供的空密码证书已在两个原生 runner 验证。
- `APPLE_ID`、`APPLE_TEAM_ID`、`APPLE_APP_SPECIFIC_PASSWORD`：公证认证。

私钥仅写入 runner 临时文件，并导入独立临时钥匙串；导入后立即删除 p12。钥匙串使用运行时随机密码，任务结束时清理。密码不写入脚本、日志、报告或归档。签名身份必须是有效的 Developer ID Application，并与指定 Team ID 一致。

组织 Secret 的 `Public repositories` 表示仓库访问范围，不是公开 Secret。使用 `Selected repositories` 的 Secret 必须选择 z8work。本地 GitHub 身份没有组织 Secret 管理权限；凭据可用性由工作流实际验证。

## 执行

```sh
gh workflow run 356599594 --repo web-casa/z8work --ref fix/windows-pdf-path -f target=macos-signed
```

目前是对本轮已审阅 DMG 的签名入口：ARM64 来源运行 `34712238836`、Intel 来源 `34712242360`，应用源码均为 `b1c0079`，原始 DMG SHA-256 固定在脚本中。工具源码另记录实际 `GITHUB_SHA`。未来签署新版本必须更新经过验收的来源和摘要，不能自动签署任意最新归档；原 Actions 归档过期后应使用保留的原文件或重新构建并验收新候选。

流程在原生 macOS 15 runner 上：

1. 验证组织 Secrets、证书私钥和公证账户。
2. 验证输入 DMG SHA-256，只读挂载并复制 app，保留原件。
3. 核对架构、依赖闭包，逐个对引擎、动态库与模块执行 Developer ID 签名、时间戳和 Hardened Runtime 检查。
4. 重新生成引擎完整性清单后签署外层 app，运行完整转换质量矩阵。
5. 打包并签署 DMG，提交 Apple 公证；立即记录提交 ID 和提交文件摘要。
6. 等待 Accepted，执行 staple、票据验证、Gatekeeper 检查、只读挂载最终 DMG 并核对 app 全部文件。
7. 上传最终包和独立报告，重新计算最终 SHA-256。

等待超时不能当作失败后自动重传。保留原提交 ID 和确切 DMG，查询同一次提交继续处理。失败候选与成功产物使用不同归档名称。`signed-notarized` 只在全部门禁通过后上传。

## 验收边界

签名和公证不会把开发身份转换为正式产品身份；本轮保留 `work.z8.desktop.m0` 和 `Z8.Work Desktop Dev.app`。最低 macOS 15，与原生引擎依赖一致。GUI、系统安装升级卸载和用户文件授权仍需实机验收；不因公证通过而标记完成。没有创建 GitHub Release、提交 MAS 或自动修改官网下载入口。

首次运行 `34757128696` 的证书导入及公证凭据验证成功，但 codesign 查找临时钥匙串失败；修复为将临时钥匙串加入用户搜索列表，再执行原生验证。

本地验证：既有桌面测试 189 项通过，新增脚本 ESLint / Prettier / Node 语法检查及工作流 actionlint 通过。实际签名和公证以远端结果为准。

## 官方来源

- [Developer ID 证书](https://developer.apple.com/help/account/certificates/create-developer-id-certificates)
- [定制公证工作流](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)
- [公证问题排查](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)

## 最终结果

[GitHub 构建 34757200403](https://github.com/web-casa/z8work/actions/runs/34757200403) 的两个原生任务均成功。签名工具提交 `119150763596c519b1fb2bf19a3b446af865ef8d`；应用原始源码 `b1c0079`。组织凭据、空密码 p12 和临时钥匙串修复均经实际运行验证。

| 架构                | 签名引擎对象 | 转换质量矩阵                                    | Apple 公证 | Gatekeeper | 下载                                                                                          |
| ------------------- | -----------: | ----------------------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------- |
| Apple Silicon ARM64 |          171 | 84 路线 / 20 质量 / 240 校准 / 4 PDF 色彩，通过 | Accepted   | 通过       | [签名 DMG](https://github.com/web-casa/z8work/actions/runs/34757200403/artifacts/10317408073) |
| Intel AMD64         |          170 | 84 / 20 / 240 / 4，通过                         | Accepted   | 通过       | [签名 DMG](https://github.com/web-casa/z8work/actions/runs/34757200403/artifacts/10317569412) |

转换回归分别约 735 秒和 706 秒。DMG 已签名、staple 并验证公证票据；只读挂载后 app 文件集合、全部文件摘要、深度签名验证及 Gatekeeper 执行评估均通过。GUI 与实机安装升级仍未执行，不把原生 runner 的评估等同于用户桌面验收。

| 文件                           |    字节数 | 最终 SHA-256                                                       |
| ------------------------------ | --------: | ------------------------------------------------------------------ |
| Z8.Work-macos-arm64-signed.dmg | 119449613 | `a2be7d8006fe15a53a14a5bdc22429d8cc0a2322a47ae695e563c6f35750151a` |
| Z8.Work-macos-amd64-signed.dmg | 101899973 | `7737f6baf7f7c32f0965b3017881e77cef0273979982c93a32e1f4ab3dda243c` |

公证提交 ID：ARM64 `684ddd95-a1f4-4435-8a78-ff91ed662f7e`；Intel `8f2c45b7-de35-433a-bb6f-5303e522364b`。原始提交摘要与 staple 后最终摘要分别保存在 [证据目录](evidence/macos-developer-id-20260913/)，不能混用。

本地最终包目录：`.desktop-local/mac-signed-downloads/arm64/` 和 `.desktop-local/mac-signed-downloads/amd64/`。下载后的两个文件已对照最终报告和下载归档中的 SHA256SUMS 独立核验通过；Actions 归档保留 14 天。
