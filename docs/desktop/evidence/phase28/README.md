# Phase 28 原始证据索引

这些文件保留工具输出及原始声明/源码片段，不做统一格式化。完整安装包、引擎和大体积源码留在本机 `.desktop-local/phase28`。

- `linux-reviewed/`：最终 Linux ARM64 包及完整质量报告；`isolated-reviewed/`：同引擎清单在 scratch、断网、普通 UID 下运行。
- `gui-report.json`、`product-licenses-en.png`：与 Linux 候选应用摘要一致的正式构建，8 项产品检查。
- `msix-reviewed/`、`msix-synthetic-reviewed/`：当前及合成低版本开发 MSIX，独立 BlockMap 和 SDK 解包检查。`msix-prepared/`、`msix-synthetic/` 记录实际身份、版本及载荷；没有原生安装证据。
- `snap-final-check.json`、`snap-package/`：修复 LCMS 前的包，仅结构检查通过；`amd64-quality-failure.json` 和 `amd64-quality-before-lcms.stderr` 记录真实 ICC 失败。
- `amd64-lcms-evidence.json`、`amd64-lcms-quality.json`、`amd64-emulated-command.txt`：修复后的同一引擎完成 84/20/240 检查，退出码为 0；显式 AMD64 仿真、scratch、断网、普通 UID，未执行原生安装。
- `snap-lcms-final-check.json`、`snap-lcms-package/`：修复后的确切 Snap 文件检查，仍没有 strict 原生安装/portal 证据。
- `core24-lcms-*`、`core24-rebuild-lcms-phase28.sh`、`Dockerfile.lcms`：此次 LCMS 构建和 builder 记录。历史及修复脚本中的 `/work` 指当时的隔离副本；不要在共享源码目录直接运行其 Git 操作。
- `inputs-archive.json` 是最后的文件收据，相对 `inputs-handoff.json` 仅增加原始日志空白保护属性，见 `archive-source-delta.json`。
- `inputs-handoff.json`：最终源码 `b62fa70` 的文件收据，验证日志是在文档提交之前生成。`inputs.json`、`inputs-reviewed.json`、`inputs-final.json` 和 core24 收据保留各自捕获时点；`*-handoff-delta.json` 解释差异。收据工具同时比较 HEAD 与文件，文档提交后的 HEAD 变化不能被误判为应用源文件变化。
- `core24-license-source.json`：早期 core24 输入 allowlist 漏收 LICENSE，补用该次 Git 源对象核对原文字节；后来源码收据和 CI 已补 LICENSE。
- `*-notices-final/dossier.json`、`core24-notices.json`：材料收集范围，不代表完整链接、对应源码或分发许可批准。
- `engine-sources/audit.json`：Linux ARM64 确切引擎映射至已保存的 170 组源码，不覆盖全部应用依赖。
- `mupdf-*`：确切 Debian 源码摘要及 ICC 禁用的规则/补丁片段；PDF 色彩管理尚未修复。
- `node*-final.log`、`native*.log`、`app-tests.log`、`python-final.log`、静态检查日志：结果和已忽略测试详见实施记录。macOS 核心仅交叉检查，CI 任务未远端执行。

`SHA256SUMS` 列出此目录其余文件的最终摘要。公开发布、安装或商店验收没有被这些本地证据替代。
