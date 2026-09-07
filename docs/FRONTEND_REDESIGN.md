# ii.Pe 像素风前端改造说明

日期：2026-09-06。本项目已合入本地 VERT 提交 `67bc156` 的 Pixel Desktop 前端；ii.Pe 的品牌、兼容性取舍及本次验证见 [ii.Pe 合并记录](design-exploration/pixel-implementation/iipe-integration/README.md)。下方的两轮 review 描述和原始截图是源提交的历史资料。

2026-09-07 追加：[本地隐私状态与环保反馈](PRIVACY_AND_ENVIRONMENT.md)已实现，包括 0 B 文件上传声明、环保页面、结果体积反馈和存储影响估算；验证记录独立归档。

当前采用第三轮设计中的 [Pixel Desktop](design-exploration/round-03-five/01-pixel-desktop.png)，已完成页面实现及两轮 review 修复。本文汇总设计选择、代码组织、交互变化和验证情况，作为本次改造的维护入口。

后续的手机操作栏、紧凑文件列表、状态优化与常用格式选择已实施，见[体验优化实施记录](ux-optimization/IMPLEMENTATION.md)、[格式选择实现与复查](ux-optimization/FORMAT_CHOICES.md)。原始[体验优化方案](ux-optimization/PLAN.md)及[方案审查记录](ux-optimization/REVIEW.md)保留决策依据；当前 Z8.Work 品牌与页头交互见[品牌说明](BRANDING.md)。真实移动设备与读屏器验收仍待完成。

## 设计选择与资料

设计经过三轮探索，共 11 个独立方案：第一轮 3 版、第二轮 3 版大胆方案、第三轮 5 版。最终选用第三轮第 1 版的像素桌面方向。

| 资料                                                                                                        | 用途                                         |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [设计探索与第一轮](design-exploration/README.md)                                                            | 原界面分析、功能约束和最初 3 个方案          |
| [第二轮](design-exploration/round-02-bold/README.md) / [第三轮](design-exploration/round-03-five/README.md) | 进一步探索的 8 个方案及取舍                  |
| [实现说明与截图](design-exploration/pixel-implementation/README.md)                                         | 最终采用的界面、适配状态、资源来源与预览命令 |
| [首轮设计与代码 QA](../design-qa.md)                                                                        | 视觉对照、响应式、键盘操作与第一批修复       |
| [第二轮代码 review](design-exploration/pixel-implementation/review-02/README.md)                            | 队列取消、状态恢复、重新转换与 ZIP 输出修复  |

探索目录中的静态方案保留为设计历史；其中的示例文件和数值用于表达构图。实际应用始终显示用户添加的文件和真实转换结果。

## 页面与交互变化

| 区域                         | 当前实现                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 首页 `/` 与转换页 `/convert` | 共用一个工作区。空状态提供添加入口与支持格式；添加后显示文件网格及输出设置。                        |
| 页面框架                     | 青绿标题栏、方形导航、底部状态栏，保留主题、设置、关于与隐私入口。                                  |
| 文件卡片                     | 折角像素文件框、真实缩略图、文件名和大小；提供逐项格式、转换、取消、下载和移除。                    |
| 批量操作                     | 兼容文件支持统一输出格式；混合类型说明限制并保留逐项操作。完成后提供 ZIP 下载与重新转换。           |
| 转换设置                     | 在输出区展开图片质量与元数据设置，沿用原有共享设置和持久化方式。质量限制为 1–100 的整数。           |
| 任务状态                     | 区分准备、排队、处理中、完成、失败和取消；只有支持进度的转换器显示数值进度。                        |
| 页面往返                     | 保留已选目标格式及失败状态；修改目标格式时清除旧结果和错误状态。                                    |
| 手机与键盘                   | 文件网格与输出区上下排列，窄屏菜单重新布局；提供跳转到内容、可见焦点、Escape 关闭及关闭后焦点恢复。 |

当前 ii.Pe 实际注册的是图片、音频和文档的浏览器转换引擎。源设计包含可配置的 vertd 视频服务，但本项目没有注册该转换器；本地模式已按实际处理位置声明隐藏远程设置和关闭服务器探测，页脚与隐私状态也使用注册列表判断。

## 视觉规范

| 项目       | 约定                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 浅色主配色 | 青绿 `#086B68`、奶油 `#FFFCE8`、桃色 `#FFB996`、深墨 `#171E20`                                               |
| 形状       | 方形控件、硬边框、硬阴影、折角纸张与底部点阵                                                                 |
| 字体       | Pixelify Sans 用于品牌、格式和短标签；正文与中文沿用可读的字体回退                                           |
| 图标       | 功能图标统一使用 Pixelarticons，通过 PixelIcon 组件加载；详见[图标走查](ux-optimization/ICON_CONSISTENCY.md) |
| 主题       | 在原有主题切换基础上提供深浅两套变量；深色文件纸张仍保持浅色以便识别                                         |
| 动效       | 控件位置保持稳定，尊重已有动效设置及系统减少动态效果偏好                                                     |

集中样式位于 [`src/lib/css/pixel.scss`](../src/lib/css/pixel.scss)，在原有 `app.scss` 之后加载，并映射既有颜色变量，使设置、关于和隐私页保持一致外观。新增依赖为固定版本的 `@fontsource-variable/pixelify-sans@5.3.0` 和 `pixelarticons@2.4.1`，记录在 `package.json` 与 `bun.lock`。

两张运行时透明 PNG 资源为 [`pixel-file-frame.png`](../static/pixel-file-frame.png) 和 [`pixel-dither.png`](../static/pixel-dither.png)。设计概念图和浏览器截图保存在 `docs/`，不参与运行时页面展示。

## 代码组织

| 文件或目录                                                                                                                                | 职责                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`ConversionWorkspace.svelte`](../src/lib/components/pixel/ConversionWorkspace.svelte)                                                    | 工作区、空状态、批量格式、共享设置、转换与下载入口                                        |
| [`PixelFile.svelte`](../src/lib/components/pixel/PixelFile.svelte)                                                                        | 单文件展示、状态与操作                                                                    |
| [`PixelHeader.svelte`](../src/lib/components/pixel/PixelHeader.svelte) / [`AddFiles.svelte`](../src/lib/components/pixel/AddFiles.svelte) | 导航、主题切换和可重复选择文件的入口                                                      |
| [`PixelIcon.svelte`](../src/lib/components/pixel/PixelIcon.svelte) / [`presentation.ts`](../src/lib/components/pixel/presentation.ts)     | 像素图标 mask、大小与格式展示、转换不可用原因                                             |
| [`FormatDropdown.svelte`](../src/lib/components/functional/FormatDropdown.svelte)                                                         | 沿用格式能力与搜索逻辑，补齐菜单语义、标签、焦点和 Escape 行为                            |
| [`+layout.svelte`](../src/routes/+layout.svelte) 与 [`layout/`](../src/lib/components/layout/)                                            | 页面框架、拖放、底栏和全局样式接入                                                        |
| [`file.svelte.ts`](../src/lib/types/file.svelte.ts)                                                                                       | 文件状态、转换版本检查、取消与 ZIP 子任务管理、输出命名                                   |
| [`store/index.svelte.ts`](../src/lib/store/index.svelte.ts)                                                                               | 批量队列，启动前检查排队状态与文件是否仍在列表，防止重复批次                              |
| [`worker-message.ts`](../src/lib/util/worker-message.ts)                                                                                  | 可取消的 Worker 消息等待与监听器、超时清理                                                |
| [`magick.svelte.ts`](../src/lib/converters/magick.svelte.ts) / [`pandoc.svelte.ts`](../src/lib/converters/pandoc.svelte.ts)               | 接入可取消等待，终止 Worker 时释放等待任务                                                |
| [`messages/`](../messages/)                                                                                                               | 新增 `pixel.*` 文案，提供英文、简体与繁体中文；ii.Pe 合并时补齐西班牙语，其余语言回退英文 |
| [`worker-message.test.mjs`](../tests/worker-message.test.mjs)                                                                             | Worker 等待、取消与资源清理的单元测试                                                     |

后续维护应继续从现有转换器读取格式能力，通过 files store 添加文件，通过 `VertFile` 执行转换。跨页面需要保留的状态放在文件模型中；新增文案放入 Paraglide 消息文件，生成目录 `src/lib/paraglide` 由项目命令生成。

## 两轮 review 的关键修复

首轮修复生产构建中的图标 mask URL 引号冲突、默认格式覆盖用户选择、格式菜单键盘与手机布局、空状态文案和视频连接失败处理，并对照参考调整字号、间距与主操作比例。

第二轮修复取消图片或文档后批量队列不再前进的问题：终止 Worker 的同时拒绝等待消息的 Promise，让队列释放槽位。排队文件可以取消，已移除文件启动前会被跳过；ZIP 跟踪并取消活动子任务，SVG 中间文件保留原任务 ID。另将失败状态移入模型、增加重新转换入口、统一质量输入与保存值，并按实际输出格式修正 ZIP 内扩展名。具体复现及验证证据见两份 review 记录。

## 本地运行与验证

准备 Bun 与 Node，按 [Getting Started](GETTING_STARTED.md) 创建本地 `.env`；已有配置可以直接使用。安装与开发命令：

```sh
bun install --frozen-lockfile
bun run dev --host 127.0.0.1 --port 4187 --strictPort
```

自动检查与生产预览：

```sh
bun run test
bun run check
bun run build
bun run preview --host 127.0.0.1 --port 4188 --strictPort
```

预览启动后访问 `http://localhost:4188/`。首次开发依赖优化可能刷新页面，完整转换流程应在生产预览中复验；每次重建后重启预览进程。`bun run test` 使用 Node 内置测试执行器及项目已有 TypeScript 依赖，无需另装测试框架。

| 检查              | 记录结果                                                                               |
| ----------------- | -------------------------------------------------------------------------------------- |
| 单元测试          | 8/8；取消、提前取消、消息阶段、初始化与转换错误、Worker 异常、超时清理、后续等待       |
| Svelte/TypeScript | `bun run check`：0 errors / 0 warnings                                                 |
| 静态构建          | `bun run build` 成功                                                                   |
| 格式与代码检查    | 本次修改文件的 Prettier、ESLint 和 `git diff --check` 通过；此处不是全仓库 lint 的结论 |
| 首轮浏览器检查    | 16 项状态与交互检查；另含真实 PNG → WebP、单文件/ZIP 下载及视频端点不可达验证          |
| 第二轮浏览器回归  | 9/9；覆盖图片、文档、SVG、ZIP 取消，质量与重新转换、失败状态、排队移除及归档扩展名     |
| 视觉适配          | 检查 320、390、768、1024、1487px，深浅主题、中英文、长文件名、格式菜单与键盘焦点       |

浏览器回归使用本地 Chromium 临时脚本，截图与结果 JSON 已归档；`bun run test` 只运行上述 8 项单元测试，不包含这两轮浏览器检查。取消场景将并发数设为 1 并暂时扣住首个 Worker 的转换消息，以稳定重现排队状态，后续正常任务使用真实转换 Worker。

人工复验时依次检查：添加和重复选择文件、拖放、统一与逐项格式、设置保存、切换页面、开始转换、取消活动/排队任务、失败重试、单文件和 ZIP 下载、修改质量后重新转换，以及深浅主题和手机键盘操作。

## 当前边界

- 参考图仅包含桌面待转换状态；空状态、深色、错误状态和手机布局按同一视觉语言补全。
- 字体、折角和点阵与参考存在细微差异；部分已有设置图标仍使用 Lucide。
- 已验证真实本地图片、部分文档和 ZIP 闭环；未向外部视频服务实际上传文件，也未穷举全部格式、超大归档、多核压力或完整屏幕阅读器流程。
- 本次文档记录代码和本地验证结果，线上站点的版本以其实际部署为准。

## 图片转换可靠性更新

2026-09-07：加入推荐／自定义图片压缩、解码和编码阶段反馈、任务超时与并发限制，并修复单文件按钮及 GIF/WebP 参数分支。详见[图片互转修复与验证](fixes/image-conversion-reliability.md)。
