# 图片转换验证记录

主报告：[图片互转：体积、耗时与任务可靠性](../image-conversion-reliability.md)。

验证环境：Node 22.22.2、Chromium 149，生产预览端口 5184，开发预览端口 5174。

- [浏览器结果](browser-results.json)：实际文件大小、Worker 阶段、并发与网络记录。
- [AVIF 推荐压缩](avif-compressed.png)
- [HEIC 转 PNG](heic-png.png)
- [手机质量控件](quality-mobile.png)

所有样本均为公开样本或生成图案，不包含用户文件。界面的“文件上传量 0 B”沿用本地转换能力声明；测试网络记录另行验证没有发送文件内容的请求。

冷启动的首次 HEIC→PNG 单文件转换通过，未再触发 Worker 依赖预编译导致的页面刷新。简体中文、英语、西班牙语、繁体中文的手机宽度与深色控件检查通过。
