# 完整桌面测试包交付

开始日期：2026-09-13。基线 b9bd4bf，延续已有测试包和 GitHub 构建授权；本轮不提交商店。

| 平台          | 目标                                  | 状态         |
| ------------- | ------------------------------------- | ------------ |
| macOS ARM64   | 原生引擎、签名后的 app、DMG、转换验收 | 已完成测试包 |
| macOS Intel   | 原生引擎、签名后的 app、DMG、转换验收 | 已完成测试包 |
| Windows ARM64 | 完整引擎与便携包、开发 MSIX           | 已完成测试包 |
| Linux AMD64   | 完整 deb / Snap 自动构建及验证        | 已完成测试包 |
| Linux ARM64   | 更新 deb 自动构建及验证               | 已完成测试包 |

每种架构核对实际引擎依赖和最终字节，不使用 application-only 产物代替完整包。保留原生转换、GUI、安装和正式签名的独立状态。

## 实现与执行入口

完整包通过已注册的 `Desktop binaries and Windows development MSIX` 工作流调用，新增的独立 workflow 在尚未合并到默认分支时也可以执行：

```sh
gh workflow run 356599594 --repo web-casa/z8work --ref fix/windows-pdf-path -f target=macos-arm64
gh workflow run 356599594 --repo web-casa/z8work --ref fix/windows-pdf-path -f target=macos-amd64
gh workflow run 356599594 --repo web-casa/z8work --ref fix/windows-pdf-path -f target=windows-arm64
gh workflow run 356599594 --repo web-casa/z8work --ref fix/windows-pdf-path -f target=linux
```

- macOS：收集实际安装的 Homebrew 公式收据和依赖；Pandoc 使用官方 3.11 ZIP 的固定 SHA-256。原生 Mach-O 与 dylib 全部检查架构，重定位私有副本，先 ad-hoc 签名再生成引擎清单。DMG 内放完整 `.app` 和 Applications 链接；挂载最终 DMG 后再次核对 app 文件和签名。最低系统版本从实际引擎的部署信息计算，不沿用原来仅主程序的 macOS 11 声明。
- Linux：复用已验收的 ImageMagick、MuPDF ICC 源码与补丁 SHA-256，使用 Ubuntu 24.04 的对应原生 runner。补齐 AMD64 deb 及 ARM64 deb；AMD64 同时打包 core24 Snap。转换引擎随包携带，deb 的 GTK/WebKit 依赖由 `dpkg-shlibdeps` 生成；这次新包的构建基线是 Ubuntu 24.04，不能沿用旧 Debian 13 包的安装结论。
- Windows ARM64：原生 ARM64 主程序、验证器、ImageMagick 和 OpenMP DLL；FFmpeg、FFprobe、Pandoc、MuPDF 暂时保留经过校验的 x64 子进程。依赖检查禁止跨架构 DLL 装入同一进程。开发 MSIX 明确声明 ARM64、最低 Windows 11，并继续使用开发身份。

Windows ARM64 不是全部引擎原生化。当前 Pandoc 3.11 官方 Windows 产物只有 x64；[Microsoft 文档](https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation)确认 Windows 11 ARM 支持 x64 模拟执行，Windows 10 ARM 不支持此方案。它是完整功能测试包的兼容路线，不是完成纯 ARM64 引擎移植的声明。

## Review 中修复的问题

1. 干净 CI 在 Vite 构建前缺少生成的 TypeScript 配置：补上既有 `desktop:check` 步骤。
2. Homebrew [ImageMagick 配方](https://raw.githubusercontent.com/Homebrew/homebrew-core/HEAD/Formula/i/imagemagick.rb)会去除模块目录中的版本号；兼容 `ImageMagick/` 与 `ImageMagick-*/`，保留 `.la` 并清空构建机绝对 `libdir`。必须存在 PNG 模块及 colors.xml，否则在组装阶段失败。
3. Windows ARM64 ImageMagick 的 `vcomp140.dll` 必须同为 ARM64；从已有固定版 Microsoft VC redist 的 ARM64 CAB 提取，独立核对文件 SHA-256、大小和 PE 架构。
4. Windows ARM64 的新主程序许可证替换旧主程序目录；保留所有引擎许可证，避免重复条目超出 UI 上限。
5. OGG 解码验收使用固定合成 Vorbis 输入，避免要求产品未提供的 Vorbis 输出编码器。保留完整转换路线和质量阈值。
6. 新增 Intel Mach-O、混合架构 DLL 拒绝、ARM64 MSIX 身份及版本声明测试；空目标选择直接失败。

## 验收边界

构建和转换验收与 GUI、文件授权、安装升级卸载、公开签名、公证、商店审核分别记录。测试包不表示正式发行或商店批准。以下仅记录成功产物；失败运行不计作交付。

## 已完成的 Linux 产物

来源：[GitHub 原生双架构构建 34711315368](https://github.com/web-casa/z8work/actions/runs/34711315368)，源码提交 `0a4e979`。两种架构均通过 84 条转换路线、20 项质量检查、240 组图片校准及 4 项 PDF 色彩检查；最终 deb 解包载荷与源候选一致，下载后 SHA-256 复核通过。

| 文件                             |    字节数 | SHA-256                                                            |
| -------------------------------- | --------: | ------------------------------------------------------------------ |
| z8-work_0.1.0~preview1_amd64.deb | 135857252 | `0e1c8d58fd0a0f67cb9ec06a13af6e0a45f2d76b8df56b6094470b089d30962b` |
| z8-work_0.1.0_amd64.snap         | 203567104 | `654b578d5081b7f5a59e58a984d9fcbacb80bdf3d43e6d01cfc8fd811cd47b58` |
| z8-work_0.1.0~preview1_arm64.deb | 126734220 | `803ec9939c3e7018840abfaab223862006c94a00b1b3ac5eed8b6be8a3c36e8e` |

[AMD64 下载](https://github.com/web-casa/z8work/actions/runs/34711315368/artifacts/10303438694) · [ARM64 下载](https://github.com/web-casa/z8work/actions/runs/34711315368/artifacts/10303194648)。本地文件位于 `.desktop-local/complete-downloads/linux-amd64/` 和 `.desktop-local/complete-downloads/linux-arm64/`。

ARM64 deb 在本机 Debian 13 ARM64 上解包启动，8 项实际 GUI 检查通过；这是对最终 deb 内程序的界面检查，另在干净 Ubuntu 24.04 ARM64 容器完成 deb 安装、非 root 运行及 PDF 色彩检查、卸载；完整桌面安装/升级仍未执行。Snap 下载后补执行最终解包检查，预期摘要来自同次构建的独立 candidate.json，应用和全部引擎匹配；相同检查已补进后续 CI 的上传门禁，strict 安装、portal 与升级仍单列为未执行。

证据位于 [本轮交付记录](evidence/complete-previews-20260913/)。OGG 测试样本修改另在本机执行完整矩阵，84 / 20 / 240 / 4 全部通过，用时约 458 秒；其验证器源码对应 `b1c0079`，不改变这些已完成 Linux 包的应用字节。

## 已完成的 Apple Silicon DMG

来源：[原生 macOS ARM64 构建 34712238836](https://github.com/web-casa/z8work/actions/runs/34712238836)，源码 `b1c0079`。84 条转换路线、20 项质量检查、240 组图片校准、4 项 PDF 色彩检查通过，转换检查约 707 秒。最终 DMG 挂载后检查 906 个应用文件，签名和字节校验通过；下载后再次校验 SHA-256。

[下载 Apple Silicon DMG](https://github.com/web-casa/z8work/actions/runs/34712238836/artifacts/10303289906)。文件 `Z8.Work-macos-arm64-preview.dmg`，117680827 字节，SHA-256 `11c6aed579f39c2cbfd3a2122110e979272ae17f4d3e587c849bc44d6181941e`。最低 macOS 15.0，临时 ad-hoc 签名、未公证；GUI、真实安装和授权流程未执行。

## 已完成的 Intel Mac DMG

来源：[原生 Intel 构建 34712242360](https://github.com/web-casa/z8work/actions/runs/34712242360)，源码 `b1c0079`。84 / 20 / 240 / 4 全部通过；最终 DMG 只读挂载后核对 904 个应用文件和签名，下载 SHA-256 复核通过。

[下载 Intel DMG](https://github.com/web-casa/z8work/actions/runs/34712242360/artifacts/10303664426)。文件 `Z8.Work-macos-amd64-preview.dmg`，102805496 字节，SHA-256 `216b32ea76757e45b40586552221232adaddc6eb9cf1f6d2bce86c24728df84d`。最低 macOS 15.0，临时 ad-hoc 签名、未公证；GUI、真实安装和授权流程未执行。

## 本地代码验证

桌面 Node 测试 189 项通过，MSIX Python 测试 20 项通过；Rust 原生测试 116 项通过、3 项既有忽略。Rustfmt、修改文件 ESLint / Prettier、Linux 脚本 ShellCheck 及 deb 脚本语法检查通过。

Review 还移除了 Windows ARM64 对旧 Actions 交接包的依赖：现在从固定 SHA-256 的上游归档重新组装引擎，中间归档过期不会阻断后续构建。Snap 最终字节检查已接到上传之前。

两个 deb 均补测干净 Ubuntu 24.04 容器中的依赖安装、应用 SHA-256、普通用户 build-info、普通用户 PDF 色彩转换和卸载清理，全部通过。ARM64 为本机原生执行，AMD64 容器使用 QEMU 模拟；AMD64 的完整转换矩阵仍以 GitHub 原生 runner 结果为准。这不覆盖实机桌面安装、升级或 Snap strict 权限。

## 已完成的 Windows ARM64 兼容包

最终来源：[构建 34712677526](https://github.com/web-casa/z8work/actions/runs/34712677526)，源码 `3449e66`。从锁定上游归档重新组装引擎，通过原生 Windows 11 ARM64 主机的 84 / 20 / 240 / 4 转换矩阵，约 1060 秒。前一次成功运行 `34711977669` 使用旧交接归档，本次已消除该依赖；旧产物本地保留，以下指向最新完整包。

[下载 ARM64 ZIP 与开发 MSIX](https://github.com/web-casa/z8work/actions/runs/34712677526/artifacts/10303858150)。下载后逐一验证 SHA-256，ZIP 中 535 个文件与独立 MSIX 准备记录一致；最终 MSIX 再验 539 个载荷文件、8599 个数据块及 12 个 FileHash。

| 文件                                   |    字节数 | SHA-256                                                            |
| -------------------------------------- | --------: | ------------------------------------------------------------------ |
| Z8.Work-windows-arm64-development.msix | 171948420 | `3c8f60e8617364481477937d932bc7c1b987e760eb6ec8bf21008299d18d1aab` |
| Z8.Work-windows-arm64-preview.zip      | 169937208 | `6efa8a02a3946e19fcf5334e7e1cb57894165f45d254fc6843292415f01ddcbf` |

需要 Windows 11 ARM64 和 WebView2 Runtime。ZIP 整体解压后运行 `z8-desktop.exe`，保留旁边的 `engines`。MSIX 使用 `Z8Work.Desktop.Dev` / `CN=Z8.Work Development`，未签名，不能直接作为 Microsoft Store 正式提交包。GUI、安装升级卸载和 WACK 尚未执行。

所有本轮完整包的下载归档已保存在 `.desktop-local/complete-downloads/`；最新 Windows ARM64 位于 `windows-arm64-final/`。Actions 产物保留 14 天，需要登录 GitHub 下载。本轮没有创建 GitHub Release 或提交商店。
