# 从 ImgConvert 吸收的桌面开发与商店发布经验

资料入口：[桌面调研总览](README.md)。本文保留调研阶段的核查范围；后续实现进度见 [M0 实施记录](M0_IMPLEMENTATION.md)。

核查日期：2026-09-08。参照仓库：`/home/ivmm/tools/imgconvert`，HEAD 为 `03b692ff3f61c6254689e1993f2810aad359aafb`。核查时有大量已修改和未跟踪文件，包括经验手册与部分发布脚本；本文引用的是本地工作区，不代表这些内容已进入 main、发布 tag 或商店。

本轮只读检查参照项目的文档、Rust 代码、打包脚本和工作流，并修订 [Z8.Work V1 方案](V1_PLAN.md)。没有重新构建或安装 ImgConvert，也没有核验商店账户与历史 Actions 产物。下文文件位置均相对于参照仓库，便于后续开发时找到原实现；不直接复制其包身份、品牌、证书、凭据或发布策略。

后续官方资料补查已经并入 [V1 定稿](V1_PLAN.md)，具体见 [最后一轮 review](FINAL_REVIEW.md)。本文件描述的 ImgConvert 实现与历史证据保持原边界；Z8.Work 最终采用的开发要求以 V1 方案为准。

## 1. 结论：借鉴渠道与验收设计，保留 Z8.Work 引擎方案

ImgConvert 的实践支持继续验证 Tauri 2 + Svelte + Rust 的路线，尤其有 Windows MSIX 构建、侧载安装和真实转换的历史记录。但它不是 Z8.Work 四套原生引擎的现成验证结果。

| 方面       | ImgConvert 当前实现 / 记录                                                                                    | Z8.Work 的采用方式                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 图片引擎   | `crates/imgconvert-core/Cargo.toml` 使用 mozjpeg、libwebp、libavif、oxipng 等，主要进程内转换                 | V1 保留随包 ImageMagick 子进程；将来仅在性能、画质和维护收益实测明确后评估专用库             |
| 任务契约   | `packages/conversion-contract/` 定义数据模型、错误码、能力和状态转换；README 的共享范围主要是 Web/Worker/扩展 | 学习无 DOM / Tauri 依赖的契约边界；Z8.Work 的 Web/Rust 对齐仍需单独实现，不能称已直接复用    |
| HEIC       | Windows WIC / 系统扩展探测及可选包外 helper，按实际能力展示                                                   | 优先完成随包 libheif 及解码依赖的离线验收；系统 codec 不能成为未经说明的首启前提             |
| 文档与媒体 | 图片核心的依赖和测试不能证明 FFmpeg / Pandoc 可用                                                             | 四套引擎分别记录依赖、资源、许可和安装后转换结果                                             |
| 发布矩阵   | ImgConvert 约定双架构、多个直发包、MAS 与扩展 ZIP 等完整集合                                                  | 保持 Z8.Work 已规划的 Windows x64 MSIX、Linux amd64 Snap 与 macOS arm64 原型；不扩大 V1 范围 |

## 2. Microsoft Store：从实际 MSIX 验证，保护正式候选

参照：`packaging/windows/README.md`、`scripts/pack-windows-msix.mjs`、`scripts/smoke-windows-msix.mjs`、`.github/workflows/windows-store-release.yml`。

值得复用的顺序是：

1. 从明确源码构建 Store 配置的应用，填入本产品真实包身份和四段版本。
2. 准备包含主程序及完整依赖的布局，使用 Windows SDK `makeappx pack`。
3. 用 `makeappx unpack` 解开刚生成的包，检查实际 manifest、PE 架构、资源和版本。
4. 复制候选，对临时副本做测试签名、信任与侧载，从安装位置执行有限转换任务；清理测试证书和安装。
5. 核对原提交件测试前后的 SHA-256 未变，保存原提交件及其验收证据。

项目历史错误是调用不存在的 `makeappx validate`，以及侧载测试直接签名原始提交件。当前脚本已分别使用解包检查和临时副本。Microsoft 官方列出的子命令也支持这一修正；解包检查不等于 WACK 或商店认证。[MakeAppx 官方用法](https://learn.microsoft.com/en-us/windows/win32/appxpkg/make-appx-package--makeappx-exe-)

Z8.Work 需要扩大其检查范围：不能只验证 Tauri 主 exe，要递归检查 FFmpeg / ffprobe、Magick、Pandoc、MuPDF 及所有 DLL 的架构、相对加载路径和实际调用。安装后的普通用户必须能在只读程序目录之外保存输出。另测缺失 WebView2、中文路径、长路径、退出取消、同身份升级和卸载保留用户结果。

定稿进一步要求明确 WebView2 的分发方式与可写数据目录。“离线转换”以声明的运行依赖安装就绪为前提，不把 ImgConvert 的开发机环境当作 Z8.Work 的离线安装证明。

`docs/DEVLOG.md` 的 2026-08-19 条目记录 Windows run `32218246687`、`32218253749` 的构建/侧载/转换历史，以及后续保护原始提交件的修正。本轮未重新获取这些 run 的证据，不把这些记录扩展成“当前工作区已通过”或“已经上架”。

ImgConvert 直发 Windows 安装器不签 Authenticode 是它的项目策略；Z8.Work 的直发签名策略尚未因此决定。包身份、版本推进和 `runFullTrust` 说明也必须使用 Z8.Work 的实际情况。

## 3. Snap：构建环境、正式资源入口和文件授权都要验收

参照：`snap/README.md`、`snap/snapcraft.yaml`、`scripts/check-snap-package.mjs`、`.github/workflows/snap-store-release.yml`。

| 具体经验                                                                                    | Z8.Work 对应措施                                                                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| core24 + GNOME SDK 注入的 `LD_LIBRARY_PATH` 与 host-linked Rustup / Node 工具发生 libc 冲突 | 在同类构建环境复现时，仅对相应构建步骤清理污染变量；不要全局清空运行时库路径，Z8 的 sidecar 仍需要受控依赖搜索路径 |
| custom lifecycle 直接 `cargo build` 容易遗漏 Tauri production protocol                      | 明确启用生产资源入口；最终包离线启动时不能访问 Vite 开发地址。具体 feature 按所选 Tauri 版本核对                   |
| 包内转换成功不证明任意文件目录可用                                                          | 单独验证 home、隐藏目录、外接盘、portal 输入与输出、拒绝授权和重启；输入可读不等于同目录可写                       |
| source checker 主要检查配置标记                                                             | 增加结构化配置检查和实际包内容检查；不把匹配到字符串当作权限与运行能力证明                                         |
| 曾接受 `timeout` 返回 124 为转换成功                                                        | 有限转换要求退出码 0、明确结果记录、输出存在且可解码；超时必须阻止候选进入发布                                     |

当前 Snap 工作流已用 `set -euo pipefail`、成功记录及四个非空输出检查修正超时问题。它在 `$HOME/snap/imgconvert/common/release-smoke` 转换，并连接 `removable-media`、记录连接状态；这仍不能证明外接盘路径、portal 弹窗或真实桌面拖放已经通过。

Z8.Work 的测试要补一层独立输出解码/语义检查，并拆开 GUI 启动测试与有限转换测试。headless 场景的 WebKit compositing workaround 不能未经实测写入用户启动配置。

定稿还将 Snap base/content 依赖就绪、更新期间任务中断和用户数据生命周期纳入验收；`removable-media` 连接成功、应用私有目录可写都不能替代这些检查。

core24 / strict / GNOME 是值得从原型验证的组合，不照搬 Rust、Node、pnpm 的版本常量。Snap 的 portal 与 Tauri 打包入口另见 [Canonical portal 文档](https://snapcraft.io/docs/explanation/snap-development/xdg-desktop-portals/) 和 [Tauri Snap 指引](https://v2.tauri.app/distribute/snapcraft/)。

## 4. 渠道开关必须影响后端与依赖

参照：`src-tauri/build.rs`、`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src-tauri/src/external_codecs.rs`。

- `IMGCONVERT_DISABLE_EXTERNAL_CODECS` 限制宿主机包外 codec/helper 发现，包含编译期 `option_env!` 检查。它不能被解释为所有商店禁止应用随包携带原生程序。
- `IMGCONVERT_DISABLE_UPDATER` 在编译时决定是否注册 updater；Cargo 还提供可选 `updater` feature。`package.json` 的 MAS 构建脚本使用 `--no-default-features` 移除该默认依赖，但当前 Snap 命令没有这一参数，不能因此声称所有渠道都已经从依赖树删掉 updater。
- Z8.Work 的 Store / Snap V1 不需要应用内更新器，应从依赖、插件注册、Tauri capability、前端入口和运行调用一起排除。以后增加直发更新器，再作为明确的可选 feature 接入。
- 随包可信引擎继续启用；包外程序发现、动态引擎下载和任意用户命令不进入 V1。渠道配置影响缓存键和产物目录，避免开发配置污染商店候选。

M0 同时做反向测试：商店构建不能通过环境变量重新打开包外程序发现或自更新；UI 没有按钮不算完成。

应用命令 ACL 与实际引擎环境另有一层边界：Tauri 的 fs 插件 scope 不会自动约束 Rust 内部文件读取，私有 Magick 配置路径也不自动排除其他搜索路径。相关补充与来源位于 V1 第 5 节，不能只迁移 ImgConvert 的渠道开关就宣称完成隔离。

## 5. 原生图片转换仍需质量与资源校准

参照：`src-tauri/src/convert.rs`、`crates/imgconvert-core/src/lib.rs` 和 `docs/DEVLOG.md` 的 Apple Silicon AVIF 实测条目。

ImgConvert 把批量并发、总内存、未知任务预留和 AVIF 内部线程数分别管理。其图片路径另有 256 MiB 源文件限制，证明“原生”本身不代表无限输入。Z8.Work 借鉴预算方法，不照搬它的图片阈值到视频和文档。

Z8.Work 要把预览、解码、PDF 渲染和编码一起纳入预算，限制“同时任务数 × 每个引擎线程数”，取消后等待实际进程退出再释放额度。四套子进程的硬取消与进程树清理不能由 ImgConvert 的进程内 cancellation token 自动获得。

历史 AVIF 报告对固定样本、质量、单线程、release 构建比较 speed 8 / 10；同一质量下速度变化带来了明显体积差异。因此 Z8.Work 参数校准须同时记录编码器、速度、色度、位深、透明度、元数据和有损/无损模式，不能把质量滑块数字当作跨编码器等价关系，也不能用另一引擎的 benchmark 决定 Magick 默认值。

对于指定格式转换，即使结果变大也应解释并交付用户请求的格式；“仅保留更小结果”可作为独立可选策略，不能偷偷返回原格式。环保统计只累计实际节省字节，不把体积增长记作减排。

## 6. 从发布链审查中吸收的门禁

参照：`docs/CROSS_PLATFORM_DESKTOP_REVIEW.md`、`docs/PROJECT_REVIEW_FIXES_2026-09-05.md`、`docs/PROJECT_REVIEW_RELEASE_FIXES_2026-09-05.md`，以及 `scripts/verify-github-release-publication.mjs`、`scripts/github-release-evidence.mjs`。

1. **一份产物矩阵驱动各层。** ImgConvert 两份本地化 MSI 曾与下游“一份 MSI”计数冲突，首轮修复还漏改上游。Z8 使用同一结构定义系统、架构、渠道、格式和必要语言变体，构建、上传、检查和文案都从它读取。
2. **证据绑定最终字节。** 文件齐全、非空、校验和清单齐全和安装验收是不同检查；要记录源码 commit、工具 commit、workflow/run、最终摘要及测试。对已经修改的包重新计算摘要，不会让旧安装证据继续有效。
3. **失败测试覆盖整个发布路径。** 缺依赖、错架构、超时、空输出、陈旧 tag、被替换附件、过期证据和失败 run 必须阻止后续发布，而不是只使单个 helper 返回失败。
4. **构建与公开发布分开。** 原型先产生可审查候选；商店上传、处理、审核、渠道可见、用户实际安装分别记录。Snap 晋级采用已验收的对应架构 revision；重新构建的包必须重验。
5. **维护用户数据与升级关系。** 测试干净安装、旧版升级、卸载保留用户输出。跨渠道切换可能有不同身份和数据位置；商店降版本与数据迁移不能轻率承诺“一键回滚”。

不把 ImgConvert 的整套六组证据/finalizer 工作流复制进 V1。先建立 Windows / Snap 候选的最小可信证据，再随实际公开分发范围扩展。记录与发布规则使用 Z8 自己的版本与身份。

原生工具链也需要锁定兼容组合：Windows Store 工作流记录了 Python 3.13 对 `libdav1d-sys` 路径处理的影响，以及 NASM 3 与旧 libaom 构建检查的冲突，当前分别固定 Python 3.12.10 和 NASM 2.16.03，并检查下载摘要。Z8.Work 应记录所选引擎对应的 SDK、编译器、汇编器和构建工具版本，优先原生 runner，并安排冷构建；这些旧依赖的 workaround 只在复现相同问题时采用，不作为永久通用版本要求。

## 7. 对 M0 的具体补充与本轮 review

M0 现在包括五项可检查交付：

1. Web/桌面共享转换意图与错误码草案，桌面渠道配置、引擎清单和产物矩阵。
2. Windows x64 MSIX 和 Linux amd64 strict Snap 中四套引擎的最小真实转换；macOS arm64 原型按原计划验证。
3. 最终包架构/依赖检查、MSIX 临时签名副本与原件摘要保护、Snap 正式资源入口。
4. 安装后离线转换、输入/输出分别授权、超时/取消/坏输入/磁盘失败的结果检查；交互权限保留真实桌面验收。
5. 绑定候选哈希的证据表，明确通过、失败、未执行、不适用；未形成最终包时不标为安装验收通过。

本轮 review 已修正四种过度迁移：没有把图片库当成完整四引擎后端，没有把包外 helper 禁用当成原生 sidecar 禁令，没有把禁用 updater 注册当成已删除依赖，也没有把工作区和历史测试记录当成当前商店状态。

本轮验证范围为参照源码与文档交叉核对、官方命令/portal 资料核对，以及 Z8 两份规划文档的格式和本地引用检查。桌面实现、安装件和商店验收仍未执行。
