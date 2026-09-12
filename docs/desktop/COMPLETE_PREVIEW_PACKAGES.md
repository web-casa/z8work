# 完整桌面测试包交付

开始日期：2026-09-13。基线 b9bd4bf，延续已有测试包和 GitHub 构建授权；本轮不提交商店。

| 平台          | 目标                                  | 状态   |
| ------------- | ------------------------------------- | ------ |
| macOS ARM64   | 原生引擎、签名后的 app、DMG、转换验收 | 开发中 |
| macOS Intel   | 原生引擎、签名后的 app、DMG、转换验收 | 开发中 |
| Windows ARM64 | 完整引擎与便携包、开发 MSIX           | 待实现 |
| Linux AMD64   | 完整 deb / Snap 自动构建及验证        | 待实现 |
| Linux ARM64   | 更新 deb 自动构建及验证               | 待实现 |

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

构建和转换验收与 GUI、文件授权、安装升级卸载、公开签名、公证、商店审核分别记录。测试包不表示正式发行或商店批准。此文档的最终产物表将在实际包完成后填写，失败运行不计作交付。
