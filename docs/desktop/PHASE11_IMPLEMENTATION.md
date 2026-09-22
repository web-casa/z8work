# Phase 11：Windows x64 原生引擎随包与转换验证

日期：2026-09-09。本轮完成 Windows 引擎组装工具、版本和 DLL 来源固定、检查入口及本地 review。实际执行使用 Linux ARM64 宿主上的 AMD64 转译容器与 Wine 9.0，不能替代原生 Windows 验收。Windows GUI、WebView2、MSIX、安装权限、升级卸载和商店审核尚未完成。

## 实现与包内布局

新增 `packaging/desktop/windows/engines.lock.json`，固定五份下载归档和选取资源的 URL、SHA-256、字节数、版本与包内位置。`desktop:bundle:windows` 校验原始归档及私有副本后解压，再逐文件核对内容；支持已有解压目录，但不能绕过归档和资源哈希。输出必须是新目录。符号链接、Windows 保留名、大小写冲突、非 x64 PE、缺少私有 DLL 和未列出的文件均会拒绝。

继续复用 Rust 的 schema 2 引擎清单和 `packaged-engines` 模式，不搜索宿主 PATH、不回退到 WASM。Windows 的 Tauri 资源目录是主程序所在目录，候选布局为：

```text
candidate-final/
  z8-desktop.exe
  engines/
    engines.json
    provenance.json
    bin/
      magick.exe, ffmpeg.exe, ffprobe.exe, pandoc.exe, mutool.exe
      vcomp140.dll, msvcp140.dll, vcruntime140.dll, vcruntime140_1.dll
    magick-config/colors.xml
    licenses/
    validation/bundle-check.exe
```

`engines.json` 列出 23 个资源文件；它自身不递归收录。验证器仅为开发验收工具，普通桌面程序不启用 `engine-validation`。随包 DLL 与引擎 EXE 相邻；没有将 VC runtime 或 OpenMP 当作必然存在的系统 DLL。Pandoc 的官方 Windows 程序包含其数据资源，本轮真实 DOCX 转文本验证通过。

新增 `desktop:windows:engines:check`：默认只做静态检查；`--runtime native` 仅允许 Windows x64，`--runtime wine` 仅允许 Linux x64 诊断环境。执行前后检查清单和全部 PE，验证五个引擎版本、Rust 完整性检查，`--full` 再验证 76 条转换路线。保存原始结果、哈希、运行方式与缺项。版本探测/完整性检查各有 30 秒上限，完整矩阵有 20 分钟上限，退出和中断不会变成通过。

静态 PE 解析只覆盖导入关系，不能证明最低 Windows 版本、全部动态加载或导出函数兼容。哈希证明字节一致，不等于发布者签名或分发许可。

## 固定的 Windows 来源

| 组件                 | 选用版本 / 来源                      | 说明                                                                               |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| ImageMagick          | 7.1.2-31，官方 portable Q16 HDRI x64 | 实测 HEIC/AVIF、透明度、16 位像素与 XMP；需要 OpenMP                               |
| FFmpeg / ffprobe     | Gyan 9.0.1 essentials                | FFmpeg 官方下载页所链接的 Windows 构建提供者；不是把第三方二进制称为上游自行发布   |
| Pandoc               | 3.11，官方 Windows x86_64 ZIP        | 保存 COPYRIGHT 与 COPYING，验证内嵌数据的真实转换                                  |
| MuPDF / mutool       | 1.28.0，Artifex 官方 Windows ZIP     | 核查时已有 1.28.3 源码版本，但未找到对应 Windows ZIP；不声称此二进制是最新源码版本 |
| Microsoft VC runtime | 14.51.36247.0，官方 x64 redist       | 仅取四个 AMD64 DLL；不安装 runtime、不混入归档内 ARM64 文件                        |

归档的精确哈希与最终 URL 见 [锁文件](../../packaging/desktop/windows/engines.lock.json)，复制资源的最终哈希见 [引擎清单](evidence/phase11/engines.json)。VC runtime 的滚动下载入口已解析为固定 `download.visualstudio.microsoft.com` 地址。

许可状态保持 `redistributionApproved: false`。ImageMagick delegates、Gyan FFmpeg 实际构建选项、Pandoc、MuPDF/AGPL、VC runtime 及其静态/动态依赖都需要候选级许可与对应源码材料核对。VC redist 包内 WXL 是许可链接资源，**不是完整许可正文**；本地保存了官方许可网页另作材料。Microsoft 关于 Visual Studio 使用者再分发资格的条件尚未完成核对。MuPDF 的 Windows 二进制升级/自行构建与安全修复差异也仍待确认。本轮没有上传这些二进制或宣称可公开分发。

## 本地产物和证据

最终开发候选目录：`.desktop-local/phase11/candidate-final/`。它包含主程序和引擎，未包含 WebView2 Runtime，也没有安装器或签名。使用开发身份 `work.z8.desktop.m0`，不作为面向普通用户的正式下载包。

- 主程序：11,610,624 字节，SHA-256 `0e6b5c9fd9d95e14033633ac77ee5ad5a1ee0d5c319782cad935bb9182dd44ba`。
- 引擎清单：SHA-256 `f13779a3a74bd365b5571a06d3b233f310e20d69d07a4f04c4e2b0917ba125f4`。
- Rust Windows 验证器：SHA-256 `16e1595afcff567df6fa378421ca61547d76fb68268c37abf46e24d16b7a6182`。
- [候选逐文件清单](evidence/phase11/candidate-inventory.json)覆盖最终目录；[输入回执](evidence/phase11/inputs.json)记录 HEAD `c554d15c578d54713d9ab0cf58e7a6ec221f35a9` 上的 255 个工作区输入。构建前后输入一致，未提交修改不能只用 HEAD 表示。
- Rust 1.96.0、cargo-xwin 0.23.1、LLVM 19.1.7；复用 Phase 10 SDK 缓存。主程序与验证器为 x64 MSVC Release，静态 CRT；引擎用各自锁定的第三方构建。

执行矩阵使用 `engines-reviewed`，其完整内容复制到最终候选后再次检查，清单哈希一致。`engines-draft`、旧 VC runtime、失败日志和 Wine prefix 都是中间诊断材料，不属于最终候选。

## 验证与 review

| 检查                                    | 结果与边界                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0                  | 各 103 项通过，包含新增 7 项 Windows 包与检查入口测试                                     |
| Rust 原生核心                           | Linux ARM64：46 项通过、1 项子进程 fixture 按设计忽略；Clippy / fmt 通过                  |
| Windows Release 主程序和验证器          | 交叉构建通过；未将 Windows 测试程序的编译算作原生执行                                     |
| Windows 引擎静态完整性                  | 五个引擎及四个 DLL 为 x64；缺少私有 DLL 0；23 项资源哈希通过                              |
| Wine 版本 / Rust 完整性 / 76 条转换     | 通过；网络禁用、非 root、移除宿主 PATH；[检查报告](evidence/phase11/wine/report.json)     |
| Linux ARM64 共享验证器回归              | 使用已有 Phase 5 引擎包的 Release 验证器；[结果](evidence/phase11/linux-conversions.json) |
| Svelte、ESLint、Prettier、CI actionlint | 通过，见 evidence/phase11 日志                                                            |
| 原生 Windows 检查                       | 本机被环境预检阻止，返回 2；[记录](evidence/phase11/native-host-blocked.json)             |
| Windows GUI、WebView2、MSIX、WACK       | 未执行；需要 Windows 实机及最终安装件                                                     |
| Linux strict Snap / macOS               | 本轮未扩大覆盖；此前实机缺项继续保留                                                      |

76 条路线由 20 条图片互转、50 条音频输出（含视频提取音频）、4 条 PDF 转图和 2 条文档转文本构成，**不是 76 条视频格式互转**。输出重新解码检查；另测 PNG 透明像素/16 位、XMP 开关、音频时长/声道、PDF 页序/尺寸/200 页限制/取消与续转、输入和参数变化失效、Unicode 文件名预算、伪装播放列表拒绝。`missing_pandoc_keeps_images: false` 在 bundled 模式表示该开发回退场景不执行，不作为通过项。

AVIF/WebP/JPEG 三档参数在生成的纹理样本上满足 small < balanced < high；这只证明本样本参数生效，不保证每张 AVIF 都比 WebP 小。

Review 已修正：

1. 初次探测只有引擎 EXE 会遗漏 `vcomp140.dll` 及 MuPDF 的 VC runtime 依赖，补齐并真实执行。ImageMagick 标识为 Visual Studio 2026 构建，最终改用 14.51 runtime；未沿用旧 14.44 包。
2. Wine 对无显式 coder 的 `C:` 图片路径发生误解析。验证器改用 `PNG:` 等显式格式前缀，生产转换本就采用该机制。此为已复现的 Wine 验证路径问题，不声称原生 Windows 应用存在同样缺陷。
3. Wine 首次中文目录创建失败，诊断容器显式设置 `LANG=C.UTF-8`。随后 Unicode、多页保存和续转实测通过。
4. 归档先校验、复制到私有临时目录再复核解压；预解压输入仍逐项核对。新增损坏归档、资源篡改、错误架构、路径冲突及未列出文件测试。
5. Windows 和 Linux 复用相同转换断言，但平台参数显式指定；Snap 检查默认仍拒绝 Windows 报告，防止跨平台借用结果。
6. Snap 的超时子进程测试曾在负载下过早读取状态，改为最多 2 秒轮询，仍要求进程已消失或已终止待回收，不接受活进程。
7. Wine 报告始终保留 `nativeWindows: not-run`、`acceptance: incomplete`。原生验收需要可信 Windows 机器/CI 记录，单靠 OS 字段不能排除兼容层。

Linux 回归的首轮 Debug 验证器在每次执行前重复校验大文件，运行较慢，主动终止后改用 Release 完整重跑；被终止的一轮不计通过。

## 复现与 Windows 实机交接

在仓库根目录执行，Node 22+、Bun、Rust 及构建工具需预先就绪。所有输出目录必须不存在。构建源与发行许可分别处理。

Linux 上准备 Windows 验证器：

```bash
env PATH="/usr/lib/llvm-19/bin:/home/ivmm/VERT/.desktop-local/phase10-tools/bin:$PATH" \
  XWIN_CACHE_DIR=/home/ivmm/VERT/.desktop-local/phase10-xwin XWIN_ARCH=x86_64 \
  cargo xwin build --locked --manifest-path src-tauri/Cargo.toml \
  --config packaging/desktop/windows/cargo-config.toml -p z8-native \
  --release --target x86_64-pc-windows-msvc --features engine-validation --bin bundle-check
```

将锁文件中五个 `archive.url` 下载到 `archive.file` 指定的文件名，放在一个独立目录；不要从搜索结果任选近似版本。已准备归档后，安装了 7z 和 cabextract 的 Linux 主机运行：

```bash
bun run desktop:bundle:windows \
  --archives .desktop-local/phase11/downloads \
  --output .desktop-local/windows-engines-next \
  --verifier src-tauri/target/x86_64-pc-windows-msvc/release/bundle-check.exe
bun run desktop:windows:engines:check \
  --root .desktop-local/windows-engines-next \
  --output .desktop-local/windows-static-next
```

也可增加 `--extracted DIR`，目录下按锁文件 `source.id` 分别放解压树；来源文件路径必须和锁文件一致，VC DLL 需在 `vcredist/runtime/`。此模式免调用解压器，但原归档仍必须存在且通过校验。Windows 主机可直接验收已准备的候选目录，无需在那里安装 Linux 解压工具。

在 **原生 Windows x64、Node 22+** 环境复制当前仓库和最终候选，保持 EXE 与 `engines/` 相邻，然后执行：

```powershell
node scripts/desktop-windows-engines-check.mjs --root .desktop-local/phase11/candidate-final/engines --output .desktop-local/windows-native-next --runtime native --full
```

原生重建验证器时用 `cargo build` 代替上面的 `cargo xwin build`，沿用 target、features 和 Windows cargo config；主程序重建命令见 [Phase 10](PHASE10_IMPLEMENTATION.md)。改变任何二进制后都要重新生成清单并运行检查，不能借用本轮哈希或 Wine 结果。

本轮 Wine 诊断命令（仅本地已有 `z8-phase11-wine:local` 开发镜像）：

```bash
sudo docker run --rm --platform linux/amd64 --network none --cap-drop ALL \
  --user "$(id -u):$(id -g)" --memory 4g --cpus 4 \
  -e LANG=C.UTF-8 -e HOME=/tmp -e WINEPREFIX=/work/wine-prefix -e WINEDEBUG=-all \
  -v "$PWD:/repo:ro" -v "$PWD/.desktop-local/phase11:/work" \
  z8-phase11-wine:local /opt/node/bin/node /repo/scripts/desktop-windows-engines-check.mjs \
  --root /work/engines-reviewed --output /work/wine-next --runtime wine --full
```

该镜像来自 Ubuntu 24.04 AMD64 构建环境，加装 Wine 9.0；镜像 ID 和执行条件记录于 [环境说明](evidence/phase11/environment.json)。它是本地诊断工具，不是可公开复用的发行镜像或已冻结的完整构建工具链。Wine prefix 的所有者必须与容器用户一致。

最终主程序也在同一断网 Wine 环境执行了 `--build-info-file` 并正常退出，[结果](evidence/phase11/application-wine-info.json)确认 Release、bundled engines、原生文件对话框和 `job-close-v1` 编译配置；执行后 EXE 哈希不变。该入口不创建 WebView，不算 GUI 或 Job Object 生命周期行为测试。

Windows CI 已加入新打包单元测试；下载几百 MB 的第三方引擎和真实矩阵由上述单独入口执行。本轮未推送或触发 GitHub Actions，因此不声称远端检查通过。

## 下一阶段

Windows 原生机器上先完成版本与全部转换、Job Object 异常退出、WebView2 首启、文件选择/拒绝/取消/保存/重启授权，再推进 MSIX 的身份、运行时策略和候选安装。并行保留引擎许可/对应源码和 MuPDF Windows 更新检查；具备最终安装件后再做升级卸载与 WACK。Phase 9 的 strict Snap 实机验收仍需原生 AMD64 环境。

## 官方依据

核对日期：2026-09-09。

- [ImageMagick Windows 下载](https://imagemagick.org/download/)与[所选 release](https://github.com/ImageMagick/ImageMagick/releases/tag/7.1.2-31)。
- [FFmpeg 下载](https://ffmpeg.org/download.html)、[Gyan 构建说明](https://www.gyan.dev/ffmpeg/builds/)与[所选 release](https://github.com/GyanD/codexffmpeg/releases/tag/9.0.1)。
- [Pandoc 3.11](https://github.com/jgm/pandoc/releases/tag/3.11)。
- [Artifex Windows 1.28.0](https://github.com/ArtifexSoftware/mupdf-downloads/releases/tag/1.28.0)与[1.28.3 源码变更记录](https://github.com/ArtifexSoftware/mupdf/blob/1.28.3/CHANGES)。
- [Microsoft VC runtime 下载及适用条件](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170)与[当前许可条款](https://visualstudio.microsoft.com/license-terms/vs2026-ga-visualcpp-v14-redist-runtime/)。
- Windows Tauri 资源位置另经本机锁定版本的 `tauri-utils` `platform.rs` 源码核对；使用随 EXE 的 `engines/`。
