# R5 补充：PDF ICC 渲染、候选与 review

日期：2026-09-10。实现提交 `1a53dd1`。本轮归属 R5 / Phase 28，并补 R4 的 PDF 色彩样本与 R6 本机回归，不新增阶段。Linux ARM64 已完成修复、完整候选验证与 review；Windows、AMD64 strict Snap、macOS 的对应原生验证仍未完成。没有推送、上传或发布。

## 修复内容

此前 Linux 候选使用 Debian MuPDF `1.25.1+ds1-6+deb13u1`，构建规则明确关闭 `FZ_ENABLE_ICC`。旧引擎在 Display P3 PDF 上直接按 DeviceRGB 处理，实测色块中心平均值的单通道最大偏差 **51/255**。[原始失败记录](evidence/phase28-pdf-icc/before.stderr)保留实际像素。

新增 [MuPDF 构建脚本](../../packaging/desktop/linux/build-mupdf-icc.sh)和[隔离构建环境](../../packaging/desktop/linux/Dockerfile.mupdf-icc)。沿用原 Debian 源码和补丁归档，恢复同版本上游的 `lcms2mt 2.14` 与原始字体，显式启用 `FZ_ENABLE_ICC=1`、`USE_SYSTEM_LCMS2=no`。这一选择来自[上游 Makethird](https://raw.githubusercontent.com/ArtifexSoftware/mupdf/1.25.1/Makethird)，其系统依赖组合也优先使用 patched LCMS。其余 C/C++ 依赖使用构建容器的发行版库。

保留全部适用 Debian 补丁，包括 `0010-Bug-708990-Avoid-overflow-src_stride-calculation-in-.patch`。只跳过改用 Debian Charis TTF 的字体打包补丁：本次保留原始 CFF 和配套字体表。未关闭 CJK 字体。MuPDF / LCMS / 字体许可、版本清单、补丁清单、归档摘要随本地引擎材料保存；这不等于完整对应源码、依赖安全审计或再分发许可已批准。

新增 [PDF 像素检查](../../src-tauri/native/src/pdf_color_checks.rs)，通过现有 `convert_source`，以均衡预设 / 72 DPI 完成 PDF → PNG/JPEG/WebP/AVIF，再解码结果。其他预设未单独进行 PDF ICC 计量。样本不含用户文件，嵌入现有 CC0 Display P3 配置；6 个色块各检查中心 16 × 16 像素、尺寸和透明度。参照颜色独立取自 [W3C 色彩矩阵](https://raw.githubusercontent.com/w3c/csswg-drafts/main/css-color-4/conversions.js)的计算，不把本引擎渲染结果作为正确答案。

`bundle-check --pdf-color` 可单独运行；`--quality` 在原有 84 条路线、20 项质量及 240 次校准之外，必须通过这 4 项。JS 候选门禁也要求实际像素和固定阈值，拒绝旧报告、漏项、重复格式、NaN、改写参照值/阈值及不一致误差。单元测试里拼接历史格式报告仅用于测试解析器，不作为新候选证据。

## Review 修正和验证边界

1. **不能只保留 ICC 字节**：旧 PDF 引擎在读取时已忽略配置，后续 ImageMagick 无法恢复。修复必须落在 MuPDF 构建，验证必须落在颜色像素。
2. **不得以移除安全补丁换取构建成功**：沿用 Debian 安全修复，只恢复匹配版本的 LCMS 与字体；补丁清单与构建日志均保存。
3. **阈值不是“像素完全一致”**：首次试验给 PNG 设 4/255 阈值，新引擎仍出现 7/255 最大差异。源码 `source/fitz/color-lcms.c` 使用 `cmsFLAGS_LOWRESPRECALC`，渲染包含近似变换。本轮新样本的最终阈值明确为所有格式 8/255，保留第一次失败和原始色块；未修改样本或既有 R4 图片 RMSE/透明度阈值。关闭 ICC 的负对照仍须至少 30/255，实测 51/255。这是检测 ICC 被禁用的质量门禁，不是印刷级色彩认证。
4. **动态依赖失败必须退出**：ShellCheck 发现独立的 `! grep` 不受 `set -e` 保证，修正为明确条件分支和 `exit 1`，重新构建验证。
5. **字体和依赖也属于产物**：原始字体已编入新 CLI，字体许可独立保留；随包 loader / 动态库必须在 scratch、断网、只读根目录中完成转换，不能只凭开发机 `ldd` 成功。
6. **安装证据不能跨平台借用**：Linux ARM64 候选与 GUI 是本机开发回归；Windows/macOS 的 Rust 交叉检查只证明编译兼容。Windows 原生、AMD64 strict Snap、macOS 原生 ICC/安装仍待补齐；当时 core24 仍使用发行版 MuPDF，旧包不能通过新增质量门禁。2026-09-12 已完成 [core24 ICC 候选重建及仿真检查](PHASE28_CORE24_ICC.md)，strict 原生安装仍未验收。

本轮运行文件差异见 [runtime-delta.json](evidence/phase28-pdf-icc/runtime-delta.json)：434 项不变，更换 MuPDF 和独立验证器，移除旧共享 libmupdf；`libgraphite2` 更新至 `1.3.14-2+deb13u1`、`libjbig2dec` 更新至 `0.20-1+deb13u1`。两组新增版本的对应源码已通过既有下载/DSC 校验工具补齐，见 [changed-sources.json](evidence/phase28-pdf-icc/changed-sources.json)。构建器动态库字节和 dpkg 来源另外逐项核对，不借用旧 170 组来源的结论。

本轮 MuPDF C 构建有上游 `maybe-uninitialized` / `ftruncate` 返回值编译警告，记录在日志中；不能称整个第三方源码“零警告”或已完成安全审计。

## 原件与源码

- Debian 原始归档：`mupdf_1.25.1+ds1.orig.tar.xz`，SHA-256 `0c2fb34812a8f470ba4f8581bf1c8fd6de0c31feb64020edd4e541400fce1dc9`。
- Debian 补丁归档：`mupdf_1.25.1+ds1-6+deb13u1.debian.tar.xz`，SHA-256 `9dcaeec03493204b647e3d030874cce55f0f69db95235de2cf1405e5d194eeef`。复用 Phase 7 已校验的本地源包。
- [上游完整 1.25.1 源码](https://mupdf.com/downloads/archive/mupdf-1.25.1-source.tar.gz)：SHA-256 `81aa1361252418cc45347b4ac075532096957a7ab772e20e046f3bb418d7263c`。只从中恢复 LCMS 与字体。
- 构建容器：`sha256:fdd70a0a99ed075cf0cb538bce6e2998b8e350891e41279363026fa4e250ca5e`，ARM64。基础镜像固定 digest；apt 依赖实际版本另存 `packages.tsv`。未来重新执行 apt 不保证取得相同字节，需依据清单恢复或使用已记录镜像。
- 新 MuPDF CLI：SHA-256 `ea34e716c886fb9de87b8182c7c81e80e2f60646439d3f6856f3b40aac05a2fd`。
- 复用 R6 已验证的应用二进制：SHA-256 `38771e1466c6a04834c4fcd81b908427f4ee006e97b6526eb461a96c64d42c08`。本轮没有修改应用运行时/前端代码，只更换引擎并更新独立验证器；原应用构建证据见 [R6 写入修复](PHASE29_WRITE_FAILURES.md)。

复审后的脚本在全新 `build-reviewed` 目录断网重编译，MuPDF 字节与候选一致；PIE、RELRO、BIND_NOW 已检查。构建与 GUI 绑定见 [build-record.json](evidence/phase28-pdf-icc/build-record.json)。源码收据是在编译后采集；提交前后的 454 项源码字节一致，不把它写成编译前收据。

本地工作目录为 `.desktop-local/phase28-pdf-icc/`。`.desktop-local/engines.json` 已指向新引擎，旧配置备份为 `previous-development.json`。完整源树、输入归档和镜像留在本机，未公开分发。

## 重跑命令

在仓库根目录执行。`review-next` 必须是新目录；源码路径来自现有 Phase 7 缓存。首次构建镜像需要网络，实际编译禁止网络、以当前用户写入独立输出，仓库只读挂载。

```sh
mkdir -p .desktop-local/phase28-pdf-icc
sudo -n docker build -f packaging/desktop/linux/Dockerfile.mupdf-icc \
  -t z8-mupdf-icc-builder:local packaging/desktop/linux
sudo -n docker run --rm --network none --cpus 4 --memory 4g \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/work:ro" -v "$PWD/.desktop-local/phase28-pdf-icc:/output" \
  z8-mupdf-icc-builder:local sh packaging/desktop/linux/build-mupdf-icc.sh \
  '/work/.desktop-local/phase7-sources-final/mupdf_1.25.1%2Bds1-6%2Bdeb13u1/mupdf_1.25.1+ds1.orig.tar.xz' \
  '/work/.desktop-local/phase7-sources-final/mupdf_1.25.1%2Bds1-6%2Bdeb13u1/mupdf_1.25.1+ds1-6+deb13u1.debian.tar.xz' \
  /output/mupdf-1.25.1-source.tar.gz /output/review-next

cargo build --locked --release --manifest-path src-tauri/Cargo.toml \
  -p z8-native --features engine-validation --bin bundle-check
src-tauri/target/release/bundle-check \
  .desktop-local/phase28-pdf-icc/engines-final --pdf-color
```

组装引擎沿用 `desktop-bundle-linux.mjs`，其开发清单的 `mutool` 路径和 library_dir 必须指向新输出；HEIF 插件路径应为 `/usr/lib/aarch64-linux-gnu/libheif/plugins`。试组装误用上级目录被完整性检查拒绝，失败日志保留，没有纳入候选。

## 实际验证结果

| 验证                                        | 结果                                                   | 证据                                                  |
| ------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| 旧 MuPDF + 同一 PDF 色块                    | 失败，偏差 51/255，验证器退出 1                        | `before.stderr`                                       |
| 新 MuPDF，PNG/JPEG/WebP/AVIF                | 通过，最大偏差分别 7/8/6/8；负对照 51                  | `pdf-color.json`                                      |
| 原生核心测试                                | 114 通过，3 个需显式引擎的测试忽略                     | `native-tests.log`                                    |
| Node 22 / 24 桌面测试                       | 各 183 通过                                            | `node22.log` / `node24.log`                           |
| Rustfmt、Clippy、ESLint、ShellCheck         | 通过；第三方 C 警告另记                                | 对应日志                                              |
| Windows x64 MSVC / macOS ARM64 核心交叉检查 | 通过；没有原生安装结果                                 | `windows-msvc-check.log` / `macos-check.log`          |
| Linux ARM64 scratch，断网/只读/UID 1000     | 通过：84 路线、20 质量、240 校准、4 PDF ICC，473.07 秒 | `isolated/conversion.json` / `isolated/evidence.json` |
| 生产桌面 GUI                                | 67 项通过，包含 PDF/音频预览、导入、保存重试、诊断     | `gui.json` 与截图                                     |

首次候选归档验证进程收到 SIGTERM（退出 143），未生成成功报告，原因未确认；该中断不记为通过，原始记录保存为 `candidate-interrupted-exit.txt` / `candidate-interrupted.log`。独立重跑已对最终解包字节执行完整矩阵，退出码为 0，中断未复现。两份归档摘要完全一致，先前 GUI 证据通过应用、引擎清单及归档摘要关联；不改写 GUI 报告原有字段。错误的 GNU Windows 目标探测因本机未安装该 target 失败，随后按已有 MSVC 工具链完成交叉检查；没有为此新增系统工具链。

core24 接入已于 2026-09-12 完成，见[新 Snap 候选](PHASE28_CORE24_ICC.md)。Windows 锁定引擎已完成 [Wine PDF 色彩诊断与候选同步](PHASE28_WINDOWS_ICC.md)。下一步继续 R5：取得 macOS ARM64 的原生候选，并补齐 Windows 原生验证；随后完成 R6 目标系统安装与 R7 交接。新质量门禁已阻止以没有 PDF 色彩证据的历史报告关闭这些项目。

## 最终本地候选

归档：`.desktop-local/phase28-pdf-icc/linux-reviewed/z8-work-0.1.0-linux-arm64-validation.tar.gz`（177,226,700 字节），SHA-256 `6c7a5683fb097071bfcaed7e08aa9525f4b2919bc3b9056ff43ab3c96d56fb18`。

引擎清单 SHA-256 `9f12291d03708117f8c44dc30138f17c9c0e161c303d21a62d410c2c164bc90c`。最终解包的 **84 条路线、20 项既有质量、240 次校准及 4 项 PDF ICC** 均通过；见[候选记录](evidence/phase28-pdf-icc/linux-reviewed/candidate.json)和[完整结果](evidence/phase28-pdf-icc/linux-reviewed/quality.json)。GUI 报告单独归档，候选生成器里的 GUI/安装字段仍保留其实际未执行范围。未执行目标商店安装、升级、卸载或发布。

源码实现提交 `1a53dd1`；本记录及证据作为后续文档提交保存。证据目录的 `SHA256SUMS` 绑定原始文件，包括失败与中断日志。R5 / R6 / R7 整体验收仍未关闭。
