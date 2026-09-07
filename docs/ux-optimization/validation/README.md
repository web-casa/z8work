# 工作区浏览器验证证据

2026-09-07，Linux Chromium 149，使用 [workspace.mjs](../../../tests/browser/workspace.mjs) 在本地执行。测试素材为仓库内人工图案 HEIC 与多尺寸 ICO；不包含用户图片。

- [手机队列](mobile-queue.png)：390×844，三个文件的名称及输入摘要位于固定栏上方。
- [桌面队列](desktop-queue.png)：1366×768，右侧主操作在首屏。
- [手机格式搜索](mobile-format.png)：原生模态层覆盖并隔离背景，搜索 WebP。
- [长文件名展开](long-filename.png)：中文、emoji、无空格长串与 HTML 样式文本，保留焦点和纯文本内容。
- [西班牙语深色布局](es-dark.png)：320px 宽，操作文案可换行，页脚无横向溢出。
- [开发验证结果](development-results.json)、[生产验证结果](production-results.json)：操作流程、8 个宽度断点、20/100 文件的控件检查、页面异常和请求记录、设置/关于/环保页往返与重载上传检查。

全页截图中的固定栏停留在截取时的视口位置，不意味着固定栏跟随文档中间内容定位。生产脚本还断言底栏仅在不大于 800px 的非空工作区固定，并检查页脚能滚动到其上方。

这组证据不替代 iOS Safari、Android 软键盘、读屏器或低内存设备压力测试。无非 GET/HEAD 请求只反映本次测试范围；网站仍会下载前端和转换引擎。
