# R5 补充：core24 AMD64 PDF 色彩修复与 Snap 候选

日期：2026-09-12。实现提交 `b6780f0`，基线 `a0d79e4`。本轮将已有 PDF ICC 修复接入 Ubuntu 24.04 AMD64 构建，重建当前应用和引擎，生成新的本地 Snap。属于 R5 / Phase 28 补充，**R5/R6 整体验收仍未完成**，没有上传或公开发布。此前的 [ARM64 Debian 预览包](LINUX_DEB_PREVIEW.md)保持不变。

## 候选及来源

文件：`.desktop-local/core24-icc/snap-package/z8-work_0.1.0_amd64.snap`，203,513,856 字节（约 195 MiB）。应用版本 `0.1.0`，开发身份 `work.z8.desktop.m0`，core24、AMD64、strict 配方、xdg-portal、内置引擎、无 updater。

| 对象      | SHA-256                                                            |
| --------- | ------------------------------------------------------------------ |
| 最终 Snap | `a8222124521b64f2ab982c06ecd8e7e51d0a3c2f64fee421b8d249a5af8b14ac` |
| 应用程序  | `887fc8d4a2a2544aed6212eb4f59cd46f96426057db9987d5cb5bbd23a8221cd` |
| 引擎清单  | `72748bc89e56903fe8ab229381dfca0b9657d6e9bb3ef2b2e865a93c12185bd8` |

应用包含此前 R6 的保存失败分类、重试等共享修复，不再复用旧 Snap 的应用。构建使用隔离源码副本和已缓存的 Rust 目标/依赖；ImageMagick、MuPDF 在本轮从校验过的归档重新编译。builder 复用历史 Ubuntu 镜像并补构建依赖，不声称完成全新系统零缓存重建。

隔离副本 Git HEAD 仍为历史值，不能单凭该值识别新应用。[构建前输入](evidence/core24-icc-20260912/builder-inputs.json)记录 454 个文件，前后复核一致；[主工作区输入](evidence/core24-icc-20260912/host-inputs.json)与[提交后收据](evidence/core24-icc-20260912/handoff-inputs.json)的 455 个文件完全一致。两处副本的差异只涉及 4 个静态支持/隐私页面和 CI 配置，不参与该本地桌面构建；应用、原生核心、前端和引擎打包输入一致，详见[逐项比较](evidence/core24-icc-20260912/input-comparison.json)。

builder 为 `z8-core24-icc:local`，镜像 ID `sha256:0092563e258fe7a6b24038169c7aac05135666f17969652570ad89a800130feb`。应用/引擎编译显式使用 `--platform linux/amd64 --network none`，在 ARM64 主机上仿真执行。恢复使用的 Cargo registry 是本机已有缓存的任务专用副本，不修改宿主缓存。

## 修复与 review

1. [core24 构建脚本](../../packaging/desktop/linux/build-core24.sh)改用[已有 MuPDF ICC 构建器](../../packaging/desktop/linux/build-mupdf-icc.sh)，不再选择发行版 `/usr/bin/mutool`。MuPDF 1.25.1、上游线程安全 LCMS 分支、原字体及 Debian 安全补丁的选择保持与 [ARM64 修复](PHASE28_PDF_ICC.md)一致。ImageMagick 7.1.1-43 保持显式启用 LCMS。
2. [builder 配方](../../packaging/desktop/linux/Dockerfile.core24)补齐 MuPDF 系统开发依赖。实际编译成功；没有修改质量阈值或新增产品格式。
3. 许可证组装只附加自编译 MuPDF/LCMS/字体许可及构建来源；发行版运行库许可继续由现有 dpkg 归属查询收集，避免重复纳入整个构建系统的许可文本。
4. [Linux 包组装器](../../scripts/desktop-bundle-linux.mjs)增加与现有离线许可页面一致的上限检查：最多 1,024 项，单项最多 2 MiB。当前包 885 项，最大 69,004 字节。没有通过提高 UI 上限来掩盖重复条目。
5. 实际恢复两次缓存缺项：第一次应用编译因缺 `process-wrap` 退出 101，补入本机 Cargo 缓存后继续；第二次应用、完整质量测试及收据复核已成功，但 Snap 准备因缺 `yaml` 退出 1，补入现有 JS 包后仅重跑准备步骤，退出 0。[失败与恢复记录](evidence/core24-icc-20260912/build-attempts.json)保留原始状态，未把整个首次命令写成成功。

MuPDF 编译日志保留上游 `ftruncate` 返回值与 PDF appearance 变量的编译警告；本轮未修改这些上游源码，也不宣称它们已消除。原有源码/许可闭合审查仍待完成，`redistributionApproved` 保持 `false`。

## 最终验证

| 检查                                     | 结果   | 证据与边界                                                                                                                 |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| 桌面脚本测试                             | 通过   | 183/183；本轮脚本改动对应测试，不复用历史 Rust 测试数                                                                      |
| 前端构建、ESLint、Prettier、ShellCheck   | 通过   | 本轮日志；ShellCheck 使用 `-x` 跟随 `/etc/os-release`                                                                      |
| AMD64 Release 应用与验证器               | 通过   | 当前源码编译；应用内置前端、bundled engines、custom protocol、linux-portal                                                 |
| 构建环境完整质量检查                     | 通过   | 84 条路线、20 项质量、240 次图片校准、4 个 PDF ICC 输出；[原始报告](evidence/core24-icc-20260912/builder-quality.json)     |
| 空容器完整质量检查                       | 通过   | 相同矩阵；scratch、断网、只读、UID 1000、4 CPU、2 GiB；AMD64 仿真，非原生系统验收                                          |
| 最终 Snap 解包与字节绑定                 | 通过   | 元数据、ELF 架构、应用哈希、全引擎清单、包装器、菜单和图标；[最终检查](evidence/core24-icc-20260912/snap-final-check.json) |
| 随包许可证条目/大小                      | 通过   | MuPDF、LCMS 和字体许可均存在，符合当前 UI 上限；未执行 AMD64 GUI 阅读                                                      |
| strict 原生安装、GUI、portal、升级及卸载 | 未执行 | 当前主机为 ARM64，不具备所需原生 AMD64 Ubuntu 桌面环境                                                                     |
| 商店上传、审核、公开发布                 | 未执行 | 本轮仅制作本地测试候选                                                                                                     |

PDF 使用固定 Display P3 色块与独立的 sRGB 期望值。PNG/JPEG/WebP/AVIF 最大通道误差分别为 **7/8/6/8**，既有阈值均为 8/255；关闭 ICC 的负对照误差为 **51**，超过要求的 30。两处执行结果一致。完整报告由现有 `validateQuality` 复核，未将“命令能启动”当作色彩正确。

最终 Snap 的引擎清单与 scratch 测试引擎逐字节一致，见[候选绑定报告](evidence/core24-icc-20260912/candidate-evidence.json)和[空容器原始输出](evidence/core24-icc-20260912/isolated-quality.json)。Snap 静态检查里的 `conversion: not-run` 指该解包检查本身不执行转换；独立引擎测试在绑定报告中单列，未改写为已安装 Snap 的业务验收。

## 复核入口与剩余工作

从项目根目录执行，只读取现有候选，输出文件需使用新名称：

```sh
node scripts/desktop-snap-check.mjs \
  --artifact .desktop-local/core24-icc/snap-package/z8-work_0.1.0_amd64.snap \
  --prepared .desktop-local/core24-icc/input/.desktop-local/snap-prepared-icc/prepared.json \
  --output .desktop-local/core24-icc/snap-recheck.json
```

打包使用本机 Snapcraft 9.0.1 与 `/snap/snapcraft/18519`，没有上传。2026-09-12 复核的 [GNOME extension 官方文档](https://ubuntu.com/docs/snapcraft/latest/reference/extensions/gnome-extension/)仍列出 core24 支持；本轮按现有受审配方展开并核对最终元数据，不据此宣称满足全部最新商店提交条件。

大体积包、引擎和源码保存在 `.desktop-local/core24-icc`；小型报告、完整转换日志、归档校验与命令记录位于 [evidence/core24-icc-20260912](evidence/core24-icc-20260912/)，以 `SHA256SUMS` 校验。`run.sh`/`resume.sh` 是隔离容器内的实际脚本，依赖对应 `/work`、`/inputs` 挂载；`run-isolated.sh` 记录已执行的容器命令，不是全新环境自动重建入口。

下一步继续 R5/R6：核对 Windows 引擎 PDF 色彩并纳入共享修复重建，取得 macOS ARM64 原生候选，以及在真实 AMD64 Ubuntu 桌面执行 strict Snap 安装、portal 授权、升级和卸载。旧候选保留用于历史追踪；本轮不关闭三端原生验收、完整许可/源码审查或 R7 冻结门禁。
