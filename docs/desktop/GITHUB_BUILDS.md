# GitHub 桌面构建（2026-09-12）

新增工作流 `.github/workflows/desktop-builds.yml`。推送 `desktop-ci/**` 分支触发；工作流进入默认分支后，也可在 Actions 手动 Run workflow。产物在运行页面的 Artifacts 下载，不创建 GitHub Release，不提交商店。

## 默认 application-only 构建与完整包入口

2026-09-13 已新增完整包工作流，最终文件、下载链接和验证范围见 [完整桌面测试包交付](COMPLETE_PREVIEW_PACKAGES.md)。选择 `macos`、`macos-arm64`、`macos-amd64`、`linux`、`linux-amd64`、`linux-arm64` 或 `windows-arm64` 会构建对应完整预览包。`all` 仍运行下面的六架构主程序矩阵及 Windows x64 完整包流程。

以下表格描述主程序归档，不代表完整包开发状态。

| 产物          | 执行主机         | 内容                                      |
| ------------- | ---------------- | ----------------------------------------- |
| Linux amd64   | ubuntu-24.04     | 原生主程序、许可证材料、构建信息、SHA-256 |
| Linux arm64   | ubuntu-24.04-arm | 同上                                      |
| Windows amd64 | windows-2025     | 同上；继续组装完整 x64 引擎与开发包       |
| Windows arm64 | windows-11-arm   | 原生主程序；完整兼容包使用独立入口        |
| macOS amd64   | macos-15-intel   | 原生主程序；完整 DMG 使用独立入口         |
| macOS arm64   | macos-15         | 原生主程序；完整 DMG 使用独立入口         |

六个 `*-application-only` 归档均明确注明**不含转换引擎，不能独立完成转换**。不是六个平台的完整发行版；Linux 完整 deb/Snap 使用上述独立入口。归档为 tar.gz，保留 Unix 可执行权限。

`windows-x64-preview-and-development-msix` 才包含完整 Windows x64 体验 ZIP 和开发 MSIX：

1. 原生 Windows 构建应用、验证器和生命周期测试，收集实际前端/Cargo 图的许可材料。
2. Linux 从锁定 URL 下载归档，逐个验证长度和 SHA-256；复用既有组装器、交接包和 MSIX 布局验证器。
3. Windows 运行现有生命周期与转换矩阵验收；失败则不上传体验包。
4. Windows SDK MakeAppx 打包、解包并校验最终 MSIX，再生成体验 ZIP 和 SHA256SUMS。

所有构建记录实际源码输入，原生主程序执行 `--build-info-file` 检查 OS、架构及功能开关。`application-only` 保留 14 天，中间引擎包保留 7 天。引擎转换测试不能替代窗口、系统文件对话框、安装升级卸载的人工验收。

## Microsoft Store

当前 MSIX 使用 `Z8Work.Desktop.Dev` / `CN=Z8.Work Development` 隔离身份，是未签名开发包，**不能提交 Store**。正式候选需要用户提供 Partner Center 的 Package Identity Name、Publisher、Publisher Display Name，以及确认已有包版本；还需独立接入正式身份与版本校验、WACK、WebView2 缺失路径和安装升级验收。ARM64 开发 MSIX 已产出；其中部分引擎使用 Windows 11 的 x64 模拟执行，正式 Store 验收尚未完成。

Microsoft Store 会在认证通过后为 MSIX 重新签名；这不代表开发 MSIX 可以用虚构身份提交，也不等于可直接侧载安装。macOS 公开下载另需 Developer ID 签名、公证及实际系统验收。许可来源审查仍沿用现有未完成状态，不因为 Actions 构建成功自动变为允许公开发行。

## 本地验证与 review

- `actionlint .github/workflows/desktop-builds.yml`
- `bun run desktop:test:ui`（含六架构矩阵及上传前置条件回归）
- ESLint / Prettier 检查新工作流和辅助脚本。
- 远端执行结果以实际 Actions 日志为准；本地 YAML 检查不代表跨平台构建成功。

新增 Windows ARM64 的静态 CRT 配置；扩展许可收集器支持两个新增 target。上传主程序归档与完整体验包采用不同名称，开发 MSIX 的身份检查及 `storeSubmissionAllowed: false` 保持有效。打 ZIP 使用交接包副本，避免污染已校验的原件。

## 官方资料

核对日期：2026-09-12。

- [GitHub Runner 系统与架构](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [MSIX Store 包要求与签名](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)
- [Bun 平台安装支持](https://bun.com/docs/installation)
