# Debian ARM64 本地测试包

日期：2026-09-12。按用户新增要求，将现有 Linux ARM64 候选打包为 `.deb`。这是本地试用交付，不改变既有 MSIX / strict Snap / macOS 验收状态，未上传或发布。

## 下载与安装

本机文件：`.desktop-local/deb-arm64/reviewed/z8-work_0.1.0~preview1_arm64.deb`。

支持范围：Debian 13 ARM64 图形桌面。此包不适用于 Intel/AMD x86_64；其他发行版尚未验证。转换引擎已随包携带，GTK/WebKit 等界面依赖由 apt 安装。

```sh
sudo apt install ./z8-work_0.1.0~preview1_arm64.deb
z8-desktop
# 或从应用菜单打开 Z8.Work
```

卸载：`sudo apt remove z8-work`。本包没有执行用户目录清理的维护脚本。

SHA-256：`f4b77f6e9673db2726340cb00e118453b31309dbe563e671d3fd2bd12ccce568`。包版本 `0.1.0~preview1` 对应应用 `0.1.0`，使未来正式 `0.1.0` 可以按 Debian 版本顺序升级；升级行为未在本轮验收。

## 打包与 review

[打包脚本](../../scripts/desktop-deb.py)复用 [PDF ICC 候选](PHASE28_PDF_ICC.md)，校验源归档、应用和每个引擎文件。保留 Tauri 的实际资源路径 `/usr/lib/Z8.Work Desktop Dev/engines`，添加应用菜单、192 × 192 图标、包说明和版权入口。`dpkg-shlibdeps` 按应用实际符号生成依赖；引擎使用随包 loader 和动态库，未错误地要求用户额外安装系统 ImageMagick/FFmpeg/Pandoc/MuPDF。

首次 GUI 检查发现源候选有 1079 份许可文件，超过应用 1024 项上限，导致许可列表不可用。打包时将 MuPDF 构建材料里的 239 份 UTF-8 说明合并为 5 个不超过 1 MiB 的卷，保留文件名标题与完整原文字节，最终 845 项。更新引擎清单和来源转换记录，保留原候选不动。复核已确认全部原文一致、438 项运行资源及应用二进制不变。该修复应用于本次 deb，不能推断历史 tar/Snap 包也已修复。

最终 deb 解包逐文件比对通过；许可原文、所有引擎文件及哈希再次验证。没有重新编码或改编译选项，也没有重跑与本次元数据调整无关的 240 次图片校准。既有转换证据的适用范围是未变化的运行字节；新清单摘要另存，不能借用旧清单摘要。

## 本轮验证

- `.deb` 控制信息、root 所有权、ARM64、自动依赖、菜单语法、图标尺寸和解包文件校验通过。
- 从最终 `.deb` 解包目录启动生产应用，8 项 GUI 检查通过，包含离线许可列表与正文、语言、隐私/环保和布局。
- 干净 Debian 13 ARM64 容器安装、非 root 应用构建信息及 PDF → PNG/JPEG/WebP/AVIF 色彩验证，随后卸载并检查菜单/应用/引擎文件删除；结果见原始日志。容器安装检查不冒充完整图形桌面的原生安装/升级验收。
- 完整再分发许可、跨平台安装和正式发行仍按 R5–R7 缺项保留。本包为本地 preview。

证据：[包与摘要](evidence/deb-arm64-20260912/package.json)、[载荷复核](evidence/deb-arm64-20260912/payload-review.json)、[GUI 报告](evidence/deb-arm64-20260912/gui.json)、[安装/转换/卸载日志](evidence/deb-arm64-20260912/install-reviewed.log)。首轮许可错误日志一并保留。

## 重建

在 Debian ARM64 构建机的仓库根目录执行，需要 Python 3.11+、dpkg-dev、desktop-file-utils，以及源候选所依赖的系统界面库。输出目录必须尚不存在。

```sh
python3 scripts/desktop-deb.py \
  --candidate .desktop-local/phase28-pdf-icc/linux-reviewed \
  --output .desktop-local/deb-arm64/rebuild-next
```

脚本仅写入独立输出，不安装到构建宿主机、不推送远程。实际安装验证也只在临时容器中执行。
