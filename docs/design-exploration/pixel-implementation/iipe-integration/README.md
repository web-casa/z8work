# ii.Pe 前端合并验证

2026-09-06，从本地 `/home/ivmm/otheruse/VERT` 的提交 `67bc15652f8e76b4bb3d25d0b419e61bf9921be8` 引入 Pixel Desktop 前端增量。

本目录是 ii.Pe 集成后的截图和验证记录；上级目录及 `review-02/` 的原始记录保留为 VERT 源提交的历史证据。

## 合并范围与取舍

- 首页和转换页共用像素工作区，引入标题栏、文件卡片、输出设置、状态栏、浅色/深色主题及手机布局。
- 同步源提交配套的队列取消、Worker 等待释放、失败状态保持、重新转换、质量输入约束和 ZIP 输出扩展名修复；同步 8 项 Worker 单元测试。
- 保留 ii.Pe 的品牌、关于与致谢页面、隐私页面和既有统计配置。页脚继续提供 ii.Pe 版权、ScreenHello 和隐私入口；原有 13 个友情链接及徽章放入空工作区的折叠区域。
- 保留合并前已完成的 ImageMagick 0.0.43、DOMPurify、Node 类型声明、西班牙语与语言初始化修复、按访问日期判断的愚人节彩蛋，以及 ii.Pe 的 192/512px 普通和 maskable 图标。
- 为新增的 `pixel.*` 界面文案补齐 43 项西班牙语翻译。PWA 的启动背景和主题色调整为新界面配色，图标资源保持 ii.Pe 标识。
- 引入源提交的设计文档、11 份概念稿及两轮审查记录。没有将源仓库的 VERT 捐赠、赞助商或部署配置作为前端变更带入。

## 截图

| 状态            | 截图                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------- |
| 桌面空状态      | [首页](01-home-desktop.png)                                                                     |
| 桌面待转换      | [工作区](02-convert-desktop.png)                                                                |
| 转换完成        | [完成状态](03-convert-complete.png)                                                             |
| 手机浅色 / 深色 | [浅色](04-mobile-light.png) / [深色](05-mobile-dark.png)                                        |
| 设置与格式选择  | [设置页](06-settings-dark.png) / [手机菜单](07-mobile-format-menu.png)                          |
| 错误与窄屏      | [错误状态](08-error-state.png) / [英文手机](09-mobile-english.png) / [320px](10-mobile-320.png) |
| 取消与重新转换  | [取消队列](review-02/cancel-queue.png) / [重新转换](review-02/mobile-reconvert.png)             |

## 集成验证

在隔离的 ii.Pe 合并工作区执行，使用真实生产构建和本机 Chromium：

- `bun run test`：8/8。涵盖 Worker 等待、取消、错误与超时清理。
- `bun run check`：0 errors / 0 warnings。独立工作区先编译 Paraglide 消息；开发服务器或生产构建会执行该编译。
- `bun run build`：静态构建通过。
- 本次前端变更文件的 ESLint、Prettier 和 Git 空白检查通过。
- [16 项界面检查](review-results.json)：空状态、不支持/损坏输入、混合文件、320/390/768/1024/1487px、Escape 与焦点恢复、拖放、重复选择、语言切换、页面往返，未处理页面异常为 0。
- [9 项转换回归](review-02/regression-results.json)：图片、文档、ZIP、SVG 的取消与队列继续运行，排队移除、失败状态、质量/重新转换、归档扩展名，全部通过。
- [真实批量转换与下载](conversion-results.json)：3 个 PNG 转 WebP，单文件和批量 ZIP 下载；校验 WebP 文件头、3 个 ZIP 条目和 CRC。
- 视频版本端点无法连接时，本地 JPG 转 PNG 仍成功，未处理页面异常为 0。

应用到 `/home/ivmm/VERT` 后，再次通过生产构建、类型检查（0 errors / 0 warnings）和 8 项单元测试，并完成以下复验：

- [当前工作区浏览器记录](final-workspace-smoke.json)：首次访问使用浏览器的西班牙语偏好，ii.Pe 品牌及 13 个友情链接、2 个徽章保留，真实 JPG 转 WebP 并下载，390px 深色主题无横向溢出，未处理页面异常为 0。[西班牙语桌面截图](11-spanish-desktop.png) / [手机深色截图](12-spanish-mobile-dark.png)。
- 3 月 31 日、4 月 1 日、4 月 2 日分别验证愚人节字体关闭、开启、关闭；西班牙语隐私、设置和致谢页面正常。
- 浏览器成功解析 PWA 清单，解码全部 4 个图标并核对 192/512px 尺寸；生产 ImageMagick Worker 实际输出 PNG、JPEG、WebP、ICO，均可解码。
- 本次前端文件的 ESLint、Prettier 检查通过。扩大 ESLint 范围时，隐私页已有的 5 个 `{@html sanitize(...)}` 仍触发 `svelte/no-at-html-tags`；这些位置经过 DOMPurify 清洗。本次没有修改其渲染方式，检查结果不代表全仓库 lint 通过。

浏览器检查由本机临时脚本执行；`bun run test` 运行的是仓库内 8 项单元测试，不包含这些浏览器场景。没有向外部视频服务上传测试文件，也没有穷举全部文件格式或复测缺少原始样本的 ProRAW/DNG。
