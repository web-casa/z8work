# Pixel Desktop — design QA 与代码 review

日期：2026-09-06。范围为本次像素风前端改造及其接入的原有用户流程。

后续第二轮 review 又发现并修复了取消阻塞队列、已移除任务继续执行、失败状态丢失、缺少重新转换入口、质量输入不一致及 ZIP 扩展名错误。最新修复与验证见 [第二轮审查记录](docs/design-exploration/pixel-implementation/review-02/README.md)。以下保留首轮设计 QA 的检查结果和当时的验证边界。

## 结果与证据

本轮代码、视觉和交互 review 已完成；发现的 P1/P2 问题已修复并复验。本报告不代表对全部转换引擎、外部视频服务和所有文件格式的全面审计。

- 视觉依据：[01-pixel-desktop.png](docs/design-exploration/round-03-five/01-pixel-desktop.png)，1487 × 1058 像素。
- 桌面实现：[02-convert-desktop.png](docs/design-exploration/pixel-implementation/02-convert-desktop.png)，1487 × 1060 像素，浏览器完整页面截图。
- CSS viewport：1487 × 1058；deviceScaleFactor：1。参考图与实现以相同宽度、相同密度共同查看，无 2x 缩放差异；实现完整页面比 viewport 高 2px。
- 对比状态：简体中文、浅色、3 个 PNG、总计 10.1 MB、批量 WebP、设置折叠、尚未转换。
- 手机证据：[浅色](docs/design-exploration/pixel-implementation/04-mobile-light.png)、[深色](docs/design-exploration/pixel-implementation/05-mobile-dark.png)，CSS viewport 390 × 844、完整页面 390 × 2025；[320px](docs/design-exploration/pixel-implementation/10-mobile-320.png) 为混合文件与长文件名。
- 交互细节：[手机格式菜单](docs/design-exploration/pixel-implementation/07-mobile-format-menu.png) 为 390 × 844 viewport 截图，单独检查焦点、字号、选项与边界；[桌面格式菜单](docs/design-exploration/pixel-implementation/11-desktop-format-menu.png) 检查桌面弹层。1487px 全图中的文件边框、按钮和图标可直接辨认，未另外裁切参考图。

已多次把参考图与浏览器截图放在同一比较输入中检查整体构图，并单独打开手机菜单、深色状态、设置和失败状态检查细节。修复后重新查看最终桌面与手机截图。

## 发现、修复与复验历史

| 优先级 | 发现与影响                                                                                                     | 修复                                                                                               | 复验依据                                                                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | 生产构建内联 SVG URL 使用单引号，和图标 mask 的外层单引号冲突；图标变成实心方块。运行时计算得到 `mask: none`。 | PixelIcon 使用 CSS 自定义属性指令及双引号 URL，编码 URL 中的双引号。                               | 生产截图图标恢复；浏览器断言所有主界面像素图标的 maskImage 非 none。                                                                                                  |
| P2     | 初版 WEBP 字号偏小、主按钮单行、文件区过高，主次比例偏离参考。                                                 | 调整格式展示字号、按钮两行排版、文件框尺寸、间距与底栏高度。                                       | [初版](docs/design-exploration/pixel-implementation/history/02-convert-initial.png) → [最终版](docs/design-exploration/pixel-implementation/02-convert-desktop.png)。 |
| P2     | 返回转换页会重新套用默认格式，覆盖用户选择。                                                                   | 用模块级 WeakSet 记录已经初始化的文件；只对新文件设置默认目标，文件释放后可回收。                  | 浏览器选择 PNG，进入设置再返回，目标保持 PNG；切换语言后队列保留。                                                                                                    |
| P2     | 已转换文件切换批量目标后可能残留“转换失败”状态。                                                               | 目标变化时重置当前文件的尝试状态，清除旧结果；处理中与已完成状态优先呈现。                         | 实际批量 WebP 转换后切换 PNG，3 个文件都恢复“待转换”。                                                                                                                |
| P2     | 键盘从格式搜索移到选项后，Escape 无法关闭；关闭后焦点不稳定。                                                  | 增加组件生命周期内的 Escape 处理，关闭和选中格式后把焦点送回触发按钮，卸载时移除监听。             | 从格式选项按 Escape 关闭并恢复焦点；搜索与选择保持可用。                                                                                                              |
| P2     | 手机格式选项保留旧圆角，320px 时短格式名称容易被截断。                                                         | 统一方形菜单与 44px 选项高度，居中手机弹层，校准窄屏选择器字号与水平内边距；辅助标签包含当前格式。 | [菜单](docs/design-exploration/pixel-implementation/07-mobile-format-menu.png)、[320px](docs/design-exploration/pixel-implementation/10-mobile-320.png)。             |
| P2     | 空状态显示“转换 0 个文件”，介绍文案容易出现孤立的末字；支持列表的星号缺少说明。                                | 空按钮显示“尚未添加文件”；文案平衡换行；增加部分支持格式的解释。                                   | [首页](docs/design-exploration/pixel-implementation/01-home-desktop.png)，空状态和格式说明浏览器检查通过。                                                            |
| P2     | 外部视频版本探测缺少失败处理，连接失败可能产生未处理异常。                                                     | 在已有探测 Promise 链中处理失败并保持视频未就绪状态。                                              | 模拟视频端点拒绝连接，本地 JPG → PNG 仍完成，pageErrors 为空，见 offline-result.json。                                                                                |

开发验证中发现首次加载 WASM 依赖和重新编译语言资源会触发 Vite 刷新，造成测试中的文件队列丢失。完整转换改在生产预览中验证；每次重建后重启预览服务器。此项属于验证环境问题，不作为产品缺陷。

## 必查视觉维度

| 维度         | 检查结果                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 字体与排版   | VERT、格式名、扩展名和文件元信息使用本地 Pixelify Sans；中文保留易读的系统字体。检查标题层级、两行 CTA、长文件名省略、手机中英文换行。字体近似参考的像素风，并非声称复刻生成图中的每个字形。 |
| 布局与间距   | 保留约 2:1 文件区/输出区、顶部双栏工具区、3 列文件框和底部状态栏；手机变为 2 列文件和下方输出区。检查 320、390、768、1024、1487px，无横向溢出或被裁掉的持久控件。                            |
| 色彩与样式   | 统一青绿 `#086B68`、奶油 `#FFFCE8`、桃色 `#FFB996`、深墨 `#171E20`，使用硬边框与硬阴影。深色主题下保留浅色纸张、深色扩展名，保证文件卡可读。                                                 |
| 图片与资源   | 使用真实添加文件生成的缩略图，生成透明折角框与点阵 PNG；标准像素图标来自图标包。检查比例、透明边缘、预览裁切与生产打包。截图的照片内容与参考不同，因为展示的是实际测试输入。                 |
| 文案与信息   | 使用现有产品概念与翻译体系；区分本地图片/音频/文档处理与外部视频服务。检查空、处理中、成功、失败、不支持、混合格式状态，以及设置保存反馈。                                                   |
| 无障碍与操作 | 语义按钮、输入标签、跳转链接、动态状态、图片替代文字、可见焦点、Escape 和减弱动态效果支持。菜单选项至少 44px 高。未做完整屏幕阅读器或第三方无障碍认证。                                      |

## 代码 review

- 安全：文件名通过 Svelte 文本插值呈现，测试含 HTML 字符的长文件名不会生成 HTML 元素；不增加上传接口或产品内示例数据。外链增加 noopener/noreferrer。环境配置不写入本次文档。
- 架构：复用 files store、VertFile、转换引擎、设置单例、原有格式选择逻辑和 Paraglide；首页与转换页共用 ConversionWorkspace，避免重复业务逻辑。
- 正确性：校验可转换状态，转换及批量下载保留错误反馈，处理格式变化、页面往返、混合输入和损坏文件；保留原有单文件取消入口。
- 性能与维护：文件初始化使用 WeakSet；复用缩略图与转换 worker；字体和图标通过包管理器固定版本；清理本次涉及的类型与 lint 问题。

## 已执行验证

- `bun run check`：0 errors / 0 warnings。
- `bun run build`：生产静态构建成功。
- 本次新增和修改的 Svelte、TypeScript、SCSS、JSON 与 package.json：Prettier 检查通过；涉及的 Svelte/TypeScript：ESLint 通过；`git diff --check` 通过。
- 本地 Chromium 实际转换：3 个 PNG → WebP，修改质量为 90 并持久化，单文件与 ZIP 下载成功。验证输出的 RIFF/WEBP 文件头、ZIP CRC 与 3 个归档条目。
- 16 项浏览器流程检查通过：[review-results.json](docs/design-exploration/pixel-implementation/review-results.json)。涵盖空状态、不支持输入、损坏图片、混合类型、5 个视口、键盘焦点、拖放、重复选择文件、语言与页面导航。
- 转换流程记录：[conversion-results.json](docs/design-exploration/pixel-implementation/conversion-results.json)；外部视频连接失败场景：[offline-result.json](docs/design-exploration/pixel-implementation/offline-result.json)。这些场景的未处理页面异常均为 0。损坏图片的预期转换错误和模拟断网的请求失败已与未处理异常区分。

最后一次仅涉及菜单焦点颜色的样式修正后，重新构建并重启生产预览，验证桌面浅色弹层的焦点为深墨色，Escape 正常，未处理页面异常为 0。证据：[桌面键盘焦点](docs/design-exploration/pixel-implementation/12-desktop-keyboard-focus.png)。

## 设计差异与验证边界

- 保留每个文件的格式、转换/取消/下载操作，并保留主题切换、清空与项目链接。它们是实际转换器需要的操作，比参考静态图多占用一些空间。
- 参考图没有空状态、深色主题、错误状态和手机布局；这些状态按同一风格补全。
- P3：底部点阵 PNG 比参考的规则像素点更细、更随机；折角框和显示字体也有细微差别。当前不影响识别与操作，后续可继续精修资源。
- P3：少量已有设置页图标和格式搜索图标沿用 Lucide，主工作区使用 Pixelarticons；功能组件已统一颜色与方形外观。
- 未实际向外部视频服务上传文件，也未穷举音频、文档、超大文件、所有格式和所有语言。取消入口保留，但未进行全部转换引擎的取消压力测试。本轮已确认本地图片核心闭环及视频端点不可达时的降级。

## 完成检查

- [x] 按已选参考实现现有项目。
- [x] 逐项完成视觉和代码 review。
- [x] 修复本轮发现的 P1/P2 并复验。
- [x] 保存真实浏览器截图、验证结果及边界说明。
- [x] 保留本地生产预览供检查。

final result: passed
