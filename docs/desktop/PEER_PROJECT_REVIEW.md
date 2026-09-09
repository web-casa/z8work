# 同类开源项目：网页到桌面的补充核查

资料入口：[桌面调研总览](README.md)。本文保留调研阶段的核查范围；后续实现进度见 [M0 实施记录](M0_IMPLEMENTATION.md)。

核查日期：2026-09-08。通过公开仓库 API 固定源码 commit，读取相应版本的 README、许可及关键实现；没有安装、构建这些项目或核验它们当前商店状态。本文区分源码事实、对 Z8.Work 的推论和需要实际验证的要求。

## 1. 对照项目与适用范围

| 项目                                                    | 与 Z8.Work 的关系                                                   | 核查源码 commit                            | 许可与迁移边界                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [Hoppscotch](https://github.com/hoppscotch/hoppscotch)  | Web 客户端扩展为 Tauri 桌面版，平台接口与共享 UI 直接可参考         | `ac145e7f758151b41fd46d3e5f513886ce9068ba` | 根目录 MIT；本轮只借鉴接口语义，不引入其认证、远程实例和动态应用加载                        |
| [Trilium Notes](https://github.com/TriliumNext/Trilium) | 浏览器/服务器与 Electron 桌面共享产品体验，原生文件与平台服务可参考 | `38594536775316c79cb77558ec7ee2d1a29c7da3` | 根目录 AGPL-3.0；其网页依赖服务器，不是浏览器内 WASM 转换的迁移样板                         |
| [LosslessCut](https://github.com/mifi/lossless-cut)     | Web 技术 UI + 原生 FFmpeg 的桌面媒体工具                            | `5c4648fd8a79c83040f16f34fe9e503aec5d27af` | 根目录 GPL-2.0 文本；用于行为参考，不直接复制代码到本项目；不是同一产品同时发行网页版的例子 |
| [ConvertX](https://github.com/C4illin/ConvertX)         | 多引擎文件转换，包含 FFmpeg / ImageMagick / Pandoc                  | `e94d037a619d501258a8b4330a80dceffc5247c5` | 根目录 AGPL-3.0；自托管服务器转换，不证明客户端离线或桌面商店可行                           |

另外检查了 [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) 的 Tauri / 本地 Java 后端路线，源码为 `1b0941c4f4ead5cb4e982f8881e23fb1fb055c6f`。它的根许可明确划出例外，桌面前端目录采用受限的 Stirling PDF User License，因此不把这部分列入可直接复用的开源实现，也不复制其代码。[根许可](https://github.com/Stirling-Tools/Stirling-PDF/blob/1b0941c4f4ead5cb4e982f8881e23fb1fb055c6f/LICENSE)、[桌面目录许可](https://github.com/Stirling-Tools/Stirling-PDF/blob/1b0941c4f4ead5cb4e982f8881e23fb1fb055c6f/frontend/editor/src/desktop/LICENSE)

这里记录的根许可不是全部依赖和子目录的完整许可审计。将来若实际移植代码，应针对具体文件、版本和依赖另行核对。

## 2. Hoppscotch：共享接口不等于相同运行语义

该项目用 `PlatformDef` 汇集平台服务，并通过 `KernelIO` 定义保存和外链操作。保存结果区分 `unknown`、`cancelled`、`saved`：浏览器下载触发后无法总是确认用户已落盘。桌面设置另有 schema 和迁移流程；写入失败时不能推进版本标记，迁移需要可重复执行。[平台定义](https://github.com/hoppscotch/hoppscotch/blob/ac145e7f758151b41fd46d3e5f513886ce9068ba/packages/hoppscotch-common/src/platform/index.ts)、[IO 契约](https://github.com/hoppscotch/hoppscotch/blob/ac145e7f758151b41fd46d3e5f513886ce9068ba/packages/hoppscotch-common/src/platform/kernel-io.ts)、[持久化实现](https://github.com/hoppscotch/hoppscotch/blob/ac145e7f758151b41fd46d3e5f513886ce9068ba/packages/hoppscotch-desktop/src/services/persistence.service.ts)

对 Z8.Work 的补充：

- 平台适配范围覆盖导入授权、转换、保存、设置和打开结果；组件不零散判断运行环境。共享意图与结果契约，执行与 IO 分开。
- 将“转换成功”和“结果已保存”分开；保存取消/失败不能伪装成成功，也不必重复编码。网页未知的保存结果据实展示，桌面成功包含后端确认的结果引用。
- 只借鉴语义，不照抄该 IO 接口的 `string | ArrayBuffer` 大数据参数。Z8 桌面继续传文件/任务标识，原生处理正文。
- V1 网页和桌面设置独立初始化，不承诺自动读取网站 localStorage / IndexedDB。未来如做偏好迁移，用用户主动导出/导入的版本化数据；不要扫描浏览器配置，更不能把路径导入当作 OS 授权。

## 3. Trilium：原生导入是一条独立的授权路径

Trilium 文档说明浏览器界面与桌面界面基本一致，但代码分别实现 desktop/server `PlatformProvider`。其 preload 将文件选择、拖放文件解析和带 token 的导入拆开；原生导出也有单独的任务接口。[桌面适配](https://github.com/TriliumNext/Trilium/blob/38594536775316c79cb77558ec7ee2d1a29c7da3/apps/desktop/src/platform_provider.ts)、[服务端适配](https://github.com/TriliumNext/Trilium/blob/38594536775316c79cb77558ec7ee2d1a29c7da3/apps/server/src/platform_provider.ts)、[导入/导出 bridge](https://github.com/TriliumNext/Trilium/blob/38594536775316c79cb77558ec7ee2d1a29c7da3/apps/desktop/src/preload.ts#L215)

对 Z8.Work 的补充：以平台给出的选择/拖放事件登记文件，任意前端字符串不能直接变成可信输入。缩略图、转换、导出和打开结果都复用同一授权登记，区分失效 token、文件被移动、文件被替换和拒绝访问。Tauri 的具体实现重新核对原生事件与权限，不使用 Electron 的 `webUtils` API。

这只是对上述接口边界的静态核查，不是 Trilium 完整授权链的安全认证。也不照搬其 HTTP 服务器、脚本能力或整个 monorepo；Z8 的四套 CLI 通过 Rust IPC 调度即可。

## 4. LosslessCut：预览能力、启动事件和原生转换相互独立

该项目的 `useHtml5ify` 为预览维护单独文件路径，并提供 remux / 转码等兼容预览方案，说明引擎可处理的媒体不一定能直接在界面播放器播放。主进程另处理 single-instance、macOS open-file 和 renderer-ready，缓存未就绪时的打开文件请求。[预览适配](https://github.com/mifi/lossless-cut/blob/5c4648fd8a79c83040f16f34fe9e503aec5d27af/src/renderer/src/hooks/useHtml5ify.tsx)、[应用生命周期](https://github.com/mifi/lossless-cut/blob/5c4648fd8a79c83040f16f34fe9e503aec5d27af/src/main/index.ts#L285)

Z8.Work 采用的约束：

- 能力描述分别记录可读、可转换、可预览。HEIC / AVIF 可转换但 WebView 无法显示时，提供受限 PNG/JPEG 缩略图；视频 V1 可用静态封面，不为预览增加全片转码产品范围。预览失败不应阻止有效转换，结果仍来自原输入而非预览副本。
- V1 默认单实例、一个任务后端。重复启动聚焦已有窗口；授权导入消息在 UI 就绪前可排队，但不能自动开始转换。系统文件关联作为后续功能，不为本轮新增安装器声明。
- 从这一生命周期经验进一步推导：只订阅事件不足以支持界面重载。Rust 提供当前任务快照与有序版本，重连先订阅/对齐快照再应用增量；快照与事件交接不得丢失更新。任务提交有幂等标识，重连不重复编码，旧订阅要释放。

不照搬 Electron preload 权限或允许任意命令的高级功能，也不把 LosslessCut 的预览转码选项全部加到 Z8 V1。

## 5. ConvertX：格式列表之外还需要转换路线

ConvertX 为每个引擎描述输入、输出和参数，并由统一转换入口选择引擎；同一扩展可能出现在多个 provider 中。[转换入口](https://github.com/C4illin/ConvertX/blob/e94d037a619d501258a8b4330a80dceffc5247c5/src/converters/main.ts)、[ImageMagick 适配](https://github.com/C4illin/ConvertX/blob/e94d037a619d501258a8b4330a80dceffc5247c5/src/converters/imagemagick.ts)

Z8.Work 补充显式的“输入格式 → 输出格式 → 引擎/流水线”映射，记录保真限制和实际包版本。不能把一张可读列表和一张可写列表做笛卡尔积，就宣布所有格式互转。重叠 provider 的优先级必须明确测试，不依赖对象遍历顺序，也不静默换成质量含义不同的编码器。

例如 PDF→AVIF 固定为 MuPDF 渲染再 ImageMagick 编码，不尝试让 Pandoc 渲染；无效文件、超预算和拒绝授权直接报告，不启动一串引擎盲试。ConvertX 的 Docker/服务端依赖、用户参数和上传模型均不直接进入 Z8 桌面版。

## 6. Stirling-PDF 的补充观察与不采用项

其 Rust 后端启动代码使用端口 0 让系统分配端口，并从启动日志识别实际端口，同时防止重复启动 Java 后端。这表明搬入整个 Web 后端会引入服务启动、就绪和端口管理；项目还存在 local / selfhosted / saas 模式，但桌面前端属于上述受限许可范围。[后端启动源码](https://github.com/Stirling-Tools/Stirling-PDF/blob/1b0941c4f4ead5cb4e982f8881e23fb1fb055c6f/frontend/editor/src-tauri/src/commands/backend.rs)

这是对路线成本的观察，不断言其监听地址、鉴权或打包已经通过本轮验证。Z8 V1 继续采用 IPC + 原生 CLI，不加本地 HTTP 转换服务；本地失败不能自动退回云端或用户未配置的远程引擎。UI 可以先展示，按引擎分别显示准备、可用和失败，避免 Pandoc 初始化失败把图片功能一起卡住。候选发行仍须全部必需引擎通过，不以运行时局部降级降低发布门槛。

## 7. 新增要求与 review

| 补充项                           | 阶段  | 核心验收                                                          |
| -------------------------------- | ----- | ----------------------------------------------------------------- |
| 平台服务边界、保存状态与独立设置 | M1/M2 | 保存取消、写入失败、迁移失败重试，网页不误报已落盘                |
| 原生输入登记统一                 | M0/M1 | 伪造路径、失效引用、文件移动/替换、拒绝访问有准确结果             |
| 预览与转换能力分开               | M0/M2 | WebView 不支持预览时仍可转换，预览缓存不参与正式编码              |
| 单实例、启动就绪、事件快照与幂等 | M1    | 重复启动、UI 重载、订阅时任务结束，不丢任务不重复执行             |
| 显式转换路线与禁止远程兜底       | M0/M2 | PDF→AVIF 路线确定，缺引擎只影响对应任务，文件无意外上传           |
| 清空队列的磁盘语义               | M1/M2 | 删除任务/列表会取消并等待运行任务，清理临时数据但不删除已保存结果 |

最后一项是本轮对平台差异的产品推论：网页版丢弃 Blob 与桌面删除磁盘文件完全不同。V1 “清空列表”只清任务和临时缓存；“删除磁盘上的结果”不加入 V1，避免现有按钮在原生化后改变破坏性。

已同步 [V1 主方案](V1_PLAN.md)，并在 [review 记录](FINAL_REVIEW.md) 标记本次为用户追加的同类项目补查。没有为每个项目另建一套架构，没有从示例推断 MS Store / Snap 已通过，也没有复制第三方实现。验证覆盖文档格式、引用和固定 commit 下的源码路径；跨平台行为仍须 M0–M3 实测。
