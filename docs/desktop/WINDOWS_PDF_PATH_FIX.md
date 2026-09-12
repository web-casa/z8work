# Windows PDF 暂存路径修复

## 问题与实现

原生路径对照已确认：普通绝对路径通过，`\\?\` 路径报错，相对文件名通过，预览 PNG 成功生成。

GitHub 原生 Windows 验收曾在 MuPDF 读取 PDF 页数时失败，报告 `cannot open \\input.pdf`。此前普通路径的对照渲染已成功，随后生产转换流程对输出目录调用 Rust `canonicalize()`，从中创建暂存目录并传递绝对路径。

Rust 在 Windows 上会返回 `\\?\` 形式的路径，[官方文档](https://doc.rust-lang.org/stable/std/fs/fn.canonicalize.html)明确指出该格式传给外部程序可能不兼容。Wine 中同一 MuPDF 可接受普通、verbatim 和相对路径，所以 Wine 测试不能替代原生 Windows 对照。

本次改动保留所有 Rust 文件系统操作的完整路径，只让 MuPDF 在既有私有工作目录内使用应用生成的文件名。`Job::work_file()` 要求文件的直接父目录与任务目录一致，拒绝父目录跳转和子目录。覆盖 PDF 页数读取、逐页渲染及 PDF 预览；没有修改用户输入授权、保存目录授权、转换质量或超时阈值。

新增 Windows 原生对照脚本 `scripts/desktop-windows-pdf-paths.mjs`：在含中文及空格的目录中比较普通绝对路径、verbatim 路径和相对路径，要求相对路径页数读取成功，并实际生成 PNG 后检查文件签名。完整转换验收仍由原有质量矩阵执行。

## 验证记录

- Linux ARM64：116 项原生测试通过，3 项原有忽略项；Rustfmt、Clippy 通过。
- 新增单元测试在实际 canonicalize 后的临时目录中验证相对文件名及目录边界。
- Windows x64 验证器交叉编译通过。
- Wine PDF 色彩回归：PNG/JPEG/WebP/AVIF 四项通过，最大通道误差分别为 7/8/6/8，原有阈值为 8；关闭 ICC 的负对照误差为 51。
- 原生 Windows 和最终打包结果见 [GitHub 验证运行](https://github.com/web-casa/z8work/actions/runs/34706876972)，对应代码提交 `a0e7b44`。完整安装、GUI 和 Store 验收独立于这次流水线。

## 最终结果（2026-09-13）

原生 Windows 验收通过：84 条转换路线、20 项质量检查、240 组图片校准、4 项 PDF 色彩检查，以及生命周期、WebView2 和包完整性检查。转换验证用时约 410 秒；Linux ARM64 的实际 PDF 色彩回归也全部通过。

原生验收通过后，Windows SDK 10.0.26100.8249 生成的 MSIX 暴露了校验器兼容问题：`http://schemas.microsoft.com/appx/2021/blockmap` 命名空间的 `FileHash` 是整文件 SHA-256，旧校验器只接受 `Block`。现已同时验证该字段、64 KiB 分块及候选字节，并拒绝未知扩展、重复和不正确的 FileHash。19 项 ZIP/BlockMap 回归测试通过。

[最终重打包运行](https://github.com/web-casa/z8work/actions/runs/34708127226)全部通过，复用 `a0e7b44` 的确切原生候选，打包工具代码为 `ae300bd`。重打包入口核对 handoff 哈希、所有原生报告引用和质量阈值，不将不同构建的证据混用。

- Windows ZIP：171,584,989 字节，SHA-256 `10c3e21b1b675d7a0f4841f61c4c25513ac85a96113830b96e084d157171facd`。
- 开发 MSIX：173,638,001 字节，SHA-256 `12ab8e4f7a7d1580ad144d91b71bdbba3d28083415116fb203130a882ec7c5f0`。
- 最终 MSIX 验证：538 个载荷文件、8,662 个分块、12 个整文件哈希；SDK 解包及逐文件比对通过。
- 最终 ZIP 逐文件校验及下载后的 SHA-256 校验通过。
- [下载产物](https://github.com/web-casa/z8work/actions/runs/34708127226/artifacts/10301858549)包含 ZIP、开发 MSIX 和 SHA256SUMS。
- [证据摘要](evidence/windows-pdf-path-20260913/summary.json)和相邻的 SHA256SUMS 保留实际验证记录。

这些结果不代替 Windows GUI、安装升级卸载、WACK 或 Store 认证。已有其他架构的 application-only 产物没有因这次 Windows x64 验证自动更新。

## 重新运行

工作流增加了手动 `target` 选项：`all` 为六架构主程序，`windows-amd64` 为 Windows x64 主程序、引擎及开发包。分支推送的默认六架构行为保持不变。

```sh
gh workflow run 356599594 --repo web-casa/z8work --ref fix/windows-pdf-path -f target=windows-amd64
```

开发 MSIX 仍使用隔离的开发身份，不是可提交 Microsoft Store 的正式包。

仅重打包已通过原生验收的候选：

```sh
gh workflow run 356599594 --repo web-casa/z8work --ref fix/windows-pdf-path -f source_run=34706876972
```

来源 run 必须保留 `windows-x64-assembled-inputs` 和 `windows-x64-package-reports` 两个 artifact；后者的原生验收必须通过。GitHub artifact 有保留期限，过期后需重新构建并验收。
