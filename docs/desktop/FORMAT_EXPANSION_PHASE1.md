# 原生格式扩展第一步：统一路由与六平台能力盘点

日期：2026-09-13。承接 [格式扩展调研](FORMAT_EXPANSION_RESEARCH.md)。

本阶段建立可验证的扩展基础：前后端共用产品格式范围，盘点六个平台实际交付包中的引擎能力，并在图片输出发布前校验真实编码。当前产品仍是 20 个输入扩展名、10 个输出格式、84 条转换路线；本阶段没有开放新的格式，也没有替换已有下载安装包。

## 实现

- `packaging/desktop/v1-scope.json` 作为已有产品范围的共同来源。Rust 转换路由、引擎就绪检查、图片预览识别及前端输出列表/就绪判断从它派生；未知输入明确失败，避免空引擎依赖被视为已经就绪。
- ImageMagick 输出增加 PNG、JPEG、WebP、AVIF 文件头检查，然后仍执行原来的解码及尺寸检查。PDF 页面经过相同编码路径。避免引擎回退为其他编码但沿用目标扩展名；AVIF 检查限定在文件开头的 `ftyp` 品牌字段内，拒绝 HEIC 冒充 AVIF。
- `bundle-check --capabilities` 只在引擎验证构建中启用，不增加桌面 IPC 接口。它校验引擎包完整性，在私有工作目录和清理后的环境中读取 ImageMagick 格式、FFmpeg 解码器/编码器/解复用器/复用器、Pandoc 输入/输出格式，共七份清单。
- 复用原有子进程取消、超时与进程树清理机制；每项最多 15 秒，总预算 120 秒。清单完整捕获上限为 1 MiB，超限或空输出视为不可用，不能静默截断后宣称某格式不存在。普通转换日志仍保留原有 8 KiB 尾部策略。
- 新增 GitHub Actions `capabilities` 目标，在 Linux、Windows、macOS 的 AMD64/ARM64 原生 runner 上，读取固定来源与 SHA-256 的完整包。报告记录包哈希、验证器哈希、源码提交、原始输出及精选格式摘要。Windows ARM64 包中部分 x64 引擎仍通过系统兼容层运行。

清单里的读、写和多图标志分别记录；探测失败是 `unknown`，成功清单中未列出才是 `not-listed`。清单并不证明外部 delegate、硬件、字体、动画帧、色彩或实际转换路线可用。摘要不把 `GRADIENT` 等伪格式自动加入产品支持列表。

## 验证与 review

- 前端检查：0 errors / 0 warnings。
- 桌面 Node 测试：193 项通过。
- Rust 原生测试：119 项通过，3 项按既有规则忽略。
- Linux ARM64 完整转换回归：84 条路线、20 项质量检查、240 项图片校准，另含 PDF 色彩检查；本次使用完整包，`missing_pandoc_keeps_images` 开发环境缺引擎检查未执行，不属于该验收通过项。通过现有 `validateQuality` 验收函数。
- 修改文件的 ESLint、Prettier、Rustfmt、工作流 actionlint 和差异空白检查通过。

Review 修正了以下问题：Windows x64 来源产物名称过期；未知格式被当作就绪；空清单被当作有效结果；通用日志尾部截断清单；Windows ImageMagick 无 Module 列导致解析遗漏；FFmpeg 含连字符的编码器名称被过滤。补充了对应边界测试。前两轮 CI 只作为排查记录，其中第二轮进程运行成功但输出不完整，不能作为格式能力依据。

## 六平台实际报告

最终 [CI 34760328610](https://github.com/web-casa/z8work/actions/runs/34760328610) 六项全部成功，验证器源码提交为 `50bdaba`。[原始报告和校验和](evidence/format-phase1-20260913/SHA256SUMS) 已归档；每份报告含固定来源包、七份完整清单及摘要。本地完整质量回归在后续盘点专用修正之前执行，后续进程捕获修正由 Rust 测试及六平台实跑验证。

下表仅列出精选图片格式中引擎声明的读写能力，**不是产品已开放或已实测的转换范围**。

| 平台          | 清单声明可读写的精选格式                                                      | HEIC |
| ------------- | ----------------------------------------------------------------------------- | ---- |
| linux-amd64   | PNG, JPEG, WEBP, AVIF, HEIC                                                   | 读写 |
| linux-arm64   | PNG, JPEG, WEBP, AVIF, HEIC                                                   | 读写 |
| windows-amd64 | PNG, JPEG, WEBP, AVIF, BMP, GIF, TIFF, ICO, TGA, QOI, JXL, JP2, EXR, SVG, PSD | 只读 |
| windows-arm64 | PNG, JPEG, WEBP, AVIF, BMP, GIF, TIFF, ICO, TGA, QOI, JXL, JP2, EXR, SVG, PSD | 只读 |
| macos-amd64   | PNG, JPEG, WEBP, AVIF, BMP, GIF, TIFF, ICO, TGA, QOI, SVG, PSD, HEIC          | 读写 |
| macos-arm64   | PNG, JPEG, WEBP, AVIF, BMP, GIF, TIFF, ICO, TGA, QOI, SVG, PSD, HEIC          | 读写 |

Linux 的图片范围受已打包 coder/delegate 限制；Windows 的 HEIC 仅列出读取能力，不能直接承诺跨平台 HEIC 输出。六平台 FFmpeg 均列出 libx264、libx265、libvpx-vp9、libaom-av1，视频输出扩展主要还需要产品路由、参数、许可与真实转换验收。

## 范围边界与下一步

下一阶段先补齐常用图片的实际引擎包能力与输入/输出路由。每个格式必须有真实编码、再解码、尺寸/透明度/多页或动画语义测试，随后才能出现在 UI 中。TIFF、JPEG XL、RAW、SVG 等带额外依赖或渲染差异的格式单独验收；FFmpeg 视频输出和 Pandoc 文档输出也不能只依据格式名称放开。

本次盘点使用 GitHub Actions 有保留期限的历史产物。未来更新引擎包或产物过期时，需要更新固定来源及哈希，重新获取证据；这份报告只描述本次记录的包，不代表系统安装的引擎或任意未来版本。
