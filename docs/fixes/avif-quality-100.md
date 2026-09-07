# AVIF 质量 100 编码修复

验证日期：2026-09-07。依赖：`@imagemagick/magick-wasm@0.0.43`。

后续默认质量、AVIF 编码速度和图片队列已在[图片互转修复](image-conversion-reliability.md)中调整；本文保留第一轮 AOM 无损兼容修复的背景与当时验证结果。

## 问题与修复

PNG/WebP 转 AVIF、质量设为 100 时，可复现以下底层编码错误：

```text
Only --enable_chroma_deltaq=0 can be used with --lossless=1.
```

质量 100 会启用无损编码；当前 WASM 中的 AOM 调优参数与该模式冲突。修复在 AVIF 输出前设置 `heic:chroma=444` 和 identity RGB/GBR 矩阵，以兼容无损编码。使用的是 [ImageMagick 官方定义的配置项](https://imagemagick.org/defines/)，不是将质量值降为 99。

[ImageMagick 编码器源码](https://github.com/ImageMagick/ImageMagick/blob/7.1.2-30/coders/heic.c)说明了质量值与无损模式的关系；[libheif AOM 插件源码](https://github.com/strukturag/libheif/blob/master/libheif/plugins/encoder_aom.cc)说明了 identity 矩阵与调优模式的关系。后者链接指向持续更新的上游，本项目的实际判断以已安装 WASM 的复现和回归测试为准。

实现位于 [magick-avif.ts](../../src/lib/util/magick-avif.ts)，由 [转换 Worker](../../src/lib/workers/magick.ts) 调用：

- 仅对 AVIF 质量 100 的输出配置兼容参数；质量低于 100 的路径保持原有参数。
- 有 ICC 配置时保留配置；否则保留来源 CICP 的色彩原色和传递函数。普通 sRGB 来源使用 sRGB 标记。
- 元数据保留/删除仍由原有用户设置决定。

另一个问题是旧 Service Worker 将开发环境未带版本的 WASM 和 `?import&url` 模块响应缓存，升级依赖后可能继续读取旧文件。[新版 SW](../../static/sw.js) 使用 `vert-wasm-cache-v3`，激活时删除旧应用缓存，排除开发环境模块和资源，只对生产指纹资源、指定版本 FFmpeg 资源使用优先缓存策略。无指纹的 Pandoc 在线重新验证，离线使用当前缓存。

首页现在会触发 SW 注册/更新。开发环境的 ImageMagick WASM 请求附带时间戳并禁用 HTTP 缓存，以覆盖旧 SW 尚未完成升级的窗口。

## 验证

使用 Node 22.22.2 运行：

```sh
bun run test
bun run check
bun run build
```

- 24 项测试通过：8 项真实 WASM 转换回归、8 项 SW 行为回归、8 项已有 Worker 消息/取消测试。
- `svelte-check`：0 错误、0 警告；生产构建通过。本次修改文件的 ESLint、Prettier 和 `git diff --check` 通过。
- PNG/WebP 的 RGB、RGBA 样本以质量 100 转换后，经 WASM 解码与输入解码像素逐字节一致；覆盖奇数尺寸、质量 80、ICC 保留、CICP 保留和元数据删除。
- Chromium 分别验证开发预览 `5174` 和生产预览 `5184`：4 个不同名称的 PNG/WebP 文件批量转 AVIF，质量 100 和 80 均成功；质量 100 的 ZIP 下载包含 4 个可解码 AVIF，尺寸及透明通道符合输入，界面质量值仍为 100。
- 在隔离浏览器环境安装旧 v2 SW、写入模拟过期 WASM 和 URL 模块：升级前可复现旧响应；时间戳请求能绕过旧响应。等待 v3 完成激活后只剩 v3 缓存，WASM 与模块重新获取，Pandoc 断网读取成功。

浏览器测试使用生成的 PNG/WebP 样本，未使用问题日志中的原始文件。上述逐像素结论适用于测试覆盖的输入；不代表所有位深、色彩空间或动画输入均经过验证。

## 本地复测

刷新 `http://localhost:5174/`，等待转换器准备完成，再次添加 PNG/WebP，选择 AVIF，将图像质量设为 100，执行转换并下载。刷新会重建页面内存中的队列，请重新选择原始文件。

字体的 `Slow network` 提示不属于本次编码异常。`history.pushState/replaceState` 警告未在本次隔离转换流程中复现，尚未归因或修复；测试中禁用了 Google Tag Manager 请求，也未加载用户浏览器扩展。
