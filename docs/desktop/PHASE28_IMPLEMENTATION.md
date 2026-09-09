# Phase 28 / R5：当前候选、依赖材料与离线许可

日期：2026-09-09。代码提交：`f4cfc0f`；core24 补充修复：`d1a9c54`、`b62fa70`。本阶段已完成本机可执行的候选重建、许可入口和打包工具开发及 review；**R5 整体验收仍未完成**。macOS 实际引擎与 `.app`、完整对应源码/许可审查、部分升级输入仍缺失，不进入“已具备三端发行候选”的状态。下一步应继续补齐 R5，再按目标候选进入 R6 原生验收。

## 实现与实际产物

- 新增应用内双语、离线开源许可入口，保留 VERT.SH 归属说明。应用 AGPL 原文随程序编译；组件声明从 Tauri 解析的包资源目录读取。后端只允许清单中的 `licenses/` 文件，限制清单、数量和单文件大小，拒绝路径穿越/符号链接并复核大小与 SHA-256。组件目录不可读时，应用许可仍可查看。
- 根据前端实际加载模块和目标平台 Cargo 非开发依赖图收集声明，保留构建依赖以避免漏收。26 个 crate 的缺失文件按原始 Git revision 补齐，原文、来源和摘要进入 [supplement.json](../../packaging/desktop/notices/supplement.json)。这是一份保守的材料清单，不是精确链接分析或许可批准。
- 重建 Linux ARM64 Release 本地包、Windows x64 程序/引擎与两份开发 MSIX，以及 core24 AMD64 strict 配方的 Snap 文件。它们包含 R2–R4 功能和本轮许可入口；确切包、哈希、测试层级与重跑命令见 [候选交接](PHASE28_CANDIDATES.md)。未安装、签名侧载、推送或上传商店。
- 新增 macOS ARM64 显式资源组装、Mach-O 架构/依赖校验及原生 `.app` 组装工具。要求先完成引擎重定位和签名；拒绝 Homebrew 路径、未收敛的 `@rpath`、包外动态依赖和嵌入的 DYLD 环境。`.app` 工具仅在原生 macOS ARM64 运行，并检查实际包内转换。
- 统一版本映射：应用 `0.1.0`、开发 MSIX `1.0.1.0`、macOS build `1.0.1`。较低 MSIX `1.0.0.0` 使用同一应用代码，仅用于包版本升级测试；不冒充真实旧版或旧数据结构迁移证据。Snap/macOS 低版本仅生成输入映射，尚无实际旧包。
- CI 增加原生 macOS ARM64 应用编译及报告任务、版本门禁与 LICENSE 触发；本地 actionlint 通过，远端任务未运行。

## Review 发现与修复

| 发现                                                                           | 修复及验证                                                                                                                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 候选验收仍接受历史 76 条格式路线，漏掉 JPEG/HEIF 别名与 R4 补充质量检查        | 改为 84 条路线、20 项质量检查和 240 次校准；拒绝旧报告、重复/缺失样本与不合格像素结果。Linux 最终解包后实际通过                                                       |
| Linux 复制的 crate 许可可能为 `0640`，普通用户容器读取失败                     | 组装时规范 ELF 为 `0755`、数据为 `0644`；以 UID 1000 在 scratch 容器完整转换通过                                                                                      |
| ImageMagick 打包缺少 `magick` / `pnm` coder，冻结照片样本无法生成              | 补入 coder，重新组装、打包及断网隔离验证通过                                                                                                                          |
| AMD64 图片 ICC 验证失败：ImageMagick 构建缺少 LCMS 开发依赖，静默禁用 delegate | 补 `liblcms2-dev`、显式 LCMS 选项和构建后检查；重建后 84 条路线、20 项质量和 240 次校准在 AMD64 仿真 scratch 环境通过；最终 Snap 清单与测试引擎相同，旧包保留失败记录 |
| 离线 core24 构建的 provenance 查询触发 rustup 联网同步                         | 受控命令保留显式 `RUSTUP_TOOLCHAIN`；离线重建及收据复核通过                                                                                                           |
| Microsoft SDK 将 `+` 文件名写为 `%2B` ZIP part，独立校验误报                   | 仅对 ZIP URI 解码一次，保持 literal `+`，拒绝畸形转义、编码分隔符、穿越与重复路径；14 个 Python 测试及两份真实 MSIX BlockMap/解包检查通过                             |
| macOS build 版本误用 `0.1.0`，不符合 CFBundleVersion 主版本约束                | 单独映射为 `1.0.1`，保留 marketing `0.1.0`；补范围和递增校验                                                                                                          |
| 离线许可目录失败会连带遮蔽应用许可；许可内容使用不适合的可聚焦展示元素         | 独立失败/重试状态及只读文本框；Svelte 零警告，正式构建 GUI 验证应用和组件原文可读及任意路径拒绝                                                                       |
| 上游声明经过格式化或换行转换会破坏摘要                                         | 对原始声明增加 Git 属性和 Prettier 排除；固定 revision/摘要回归通过                                                                                                   |

macOS 拒绝 `@rpath` 是当前组装器的保守策略，不是 macOS 平台禁用该机制。已有系统动态库仍由 macOS 提供；Linux GUI 也仍需要 GTK/WebKit 系统运行时。自包含转换引擎不等于把整个操作系统打进包内。

## 验证与边界

| 检查                                                   | 结果                                                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0 桌面测试                        | 各 175 项通过                                                                                                                                   |
| Rust 原生核心，无开发特性 / 有开发特性                 | 111 / 110 项通过，各 3 个已有显式 ignored 测试不计入通过                                                                                        |
| 桌面应用 Rust 测试                                     | 10 项通过                                                                                                                                       |
| Python MSIX 档案测试                                   | 14 项通过                                                                                                                                       |
| Svelte / 格式 / ESLint / Rustfmt / Clippy / actionlint | 通过；Svelte 0 errors、0 warnings；兼容性数据集过期提示未当作应用警告                                                                           |
| Linux ARM64 最终压缩包                                 | 解包、完整清单、84 条转换、20 项质量及 240 次校准通过                                                                                           |
| Linux ARM64 无基础镜像隔离转换                         | scratch、断网、只读根目录、普通 UID、受限内存及进程条件通过；与候选引擎清单摘要一致                                                             |
| Linux ARM64 正式 Release GUI                           | 8 项产品检查通过，含许可证及原有双语/隐私/统计/键盘/缩放；不是重复执行全部历史 GUI 套件                                                         |
| Windows x64                                            | 应用、验证器、测试程序及监督器交叉构建通过；两份最终 MSIX 字节/BlockMap/解包通过；原生执行未进行                                                |
| AMD64 Snap                                             | 最终包架构、版本、应用/引擎摘要、运行包装器及桌面文件通过；同引擎在 AMD64 仿真 scratch 环境完成 84/20/240 检查；strict 原生安装和 portal 未执行 |
| macOS ARM64                                            | 原生核心交叉检查及合成 Mach-O 布局测试通过；真实 `.app` 和引擎执行未进行                                                                        |

证据位于 [evidence/phase28](evidence/phase28/)，包括报告、摘要、真实 GUI 截图、原始检查日志、构建输入和 MuPDF 源码片段。最终源码收据与早期候选构建收据的差异分别记录；core24 早期收据遗漏 LICENSE，已额外通过当时独立 Git 对象核对其原文字节；应用、原生核心及共享 UI 源码没有变化，后续修订集中在工具、测试及平台材料，未把不同时点的全部输入宣称为完全一致。core24 使用独立副本和已有 ImageMagick 构建缓存，保留该副本的输入收据与构建记录，不声称已完成从全新系统零缓存重建。

## 未关闭的 R5 / R6 门槛

1. **PDF ICC**：已定位到实际 Debian MuPDF `1.25.1+ds1-6+deb13u1` 的构建规则，明确 `-DFZ_ENABLE_ICC=0`，并有只警告一次的补丁。上游 Makethird 要求优先使用 patched lcms2。[R5 PDF ICC 补修](PHASE28_PDF_ICC.md)已为 Linux ARM64 重建启用 ICC 的 MuPDF/LCMS，并加入四种 PDF 输出的像素门禁；其他目标包仍须接入、重建和实测。图片 ICC 字节保留不证明 PDF 色彩管理通过。
2. **许可与源码**：本历史 Phase 28 Linux 引擎的 438 个运行文件均映射到 170 组已保存源码（后续 ICC 重建增加了上游 LCMS/字体及新的构建依赖记录，不沿用这项闭包结论），未匹配文件为 0；这仍不包括应用/前端/Rust 完整对应源码闭包、所有签名与分发兼容性判断。Linux GTK / Linux portal / Windows / macOS 材料分别覆盖 354 / 371 / 286 / 275 个组件，无“缺声明文件”项；部分 objc2 上游文件本身为链接说明，仍需逐 crate 核对许可文本和 Apple SDK 相关条款。所有 `redistributionApproved` 保持 false。
3. **平台候选**：macOS ARM64 缺实际原生引擎、重定位/签名后资源和 `.app`；现有工具及 CI 不能替代该产物。Windows MSIX 缺原生离线转换；Snap 的仿真隔离转换已通过，仍缺 strict 原生业务验证。合成旧 Snap/macOS 还未构建。
4. **原生安装与发行**：Windows x64、Linux AMD64 strict 桌面和 macOS ARM64 原生测试入口尚未提供；Store 正式 Identity/Publisher 与 Snap 注册状态仍待核实。这些缺项不影响已有开发身份候选，但阻塞对应正式候选和 R6。目标设备性能与故障/升级/卸载验收也未关闭。

## 本轮官方资料复核

- [Microsoft：MSIX package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)：身份应对应实际账户配置，开发候选不推导正式 Store 身份。
- [Apple：Core Foundation Keys](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html)：marketing/build 版本分别设置，CFBundleVersion 使用合规数字范围。
- [Apple：Run-Path Dependent Libraries](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/RunpathDependentLibraries.html)：运行时依赖搜索必须结合实际调用上下文。
- [Tauri：macOS Application Bundle](https://v2.tauri.app/distribute/macos-application-bundle/)；[GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)：新增构建任务针对 macos-15 ARM64，不据此宣称远端已通过。
- [MuPDF 1.25.1 Makethird](https://raw.githubusercontent.com/ArtifexSoftware/mupdf/1.25.1/Makethird)：LCMS 构建关系结合本地确切 Debian 规则复核。

Snap 本轮以已安装 Snapcraft 9.0.1 的真实 CLI、既有受审配方和最终包检查为证据；未将文档跳转后的空响应当作最新商店规则核验。

补充接口核对：[Apple Mach-O loader.h](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/EXTERNAL_HEADERS/mach-o/loader.h) 确认 `LC_DYLD_ENVIRONMENT` 命令定义；ImageMagick LCMS 的检测与配置以本轮使用的固定源码 `configure`、构建日志和真实 ICC 回归为依据。
