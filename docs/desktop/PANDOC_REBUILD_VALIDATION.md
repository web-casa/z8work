# Pandoc 源码重建与替换验收：2026-09-21

应用中的旧 Pandoc WASM 已替换为从固定 Pandoc 3.5 源码构建的新文件。所选文件 SHA-256 为 `e12460b4b7ae74829da41b77b97531ca2eeebbcaf2362d0e1912948b59c21e09`，源码提交为 `336228bb8d5e9bf35750cfe6b546ffb4bcd86c15`。

构建输入固定了 8 个 Git 源码树、127 个 Hackage 包、GHC 9.12.0.20241115、WASI SDK、Cabal、Node、Binaryen 119、Debian 镜像及 apt 包版本。两次正式构建均在 Docker `--network none` 下运行。

## 非确定性结论

两次独立构建没有得到逐字节相同的 WASM。加入 `SOURCE_DATE_EPOCH`、固定时区和 locale，并使用 GHC `-fobject-determinism` 后，原始文件大小相同但摘要仍不同；Binaryen 优化后的文件相差 5 字节。WAT 对照显示 GHC 运行时静态数据布局顺序仍有变化。

因此证据将本次结果标为 `verified-rebuilt-replacement`，不会宣称 bit-for-bit reproducible。发布门禁要求至少两次断网构建、完整输入绑定、非确定性记录、所选产物摘要绑定和真实运行验证，缺少任一项都会失败。

## 运行验收

两份独立产物分别注入构建后的桌面网页应用，均完成 Markdown→DOCX。测试解开输出并检查 `[Content_Types].xml`、`word/document.xml`、英文文本及中文“文档转换。”。两轮同时通过图片、音频、HTML 和 PDF 的离线转换回归。

对应源码归档位于 `.desktop-local/pandoc-rebuild-20260921/pandoc-corresponding-source-final.tar.gz`，SHA-256 为 `0d71a58d3440e62227ef5212f4b5ad484e735014fd4117a9fd638e8ee95b101e`。归档含源码、工具链下载件、Hackage 缓存、解析计划、固定 builder 镜像及重建脚本。

当前技术源码闭环已经完成；归档仍只在本地，GPL 分发义务的最终人工批准和公开源码地址仍未完成。Windows 最终 MSIX/WACK 和 macOS 直发签名验收也不属于本轮结果。
