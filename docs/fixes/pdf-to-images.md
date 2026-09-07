# PDF 转图片：实现与审查

## 用户行为

- 支持 PDF 输入，输出覆盖 23 个扩展名，默认 PNG：PNG、JPEG/JPG、WebP、AVIF、JPEG XL（JXL）、GIF、BMP、TIFF/TIF、ICO、JPEG 2000（JP2）、PSD、QOI、TGA、PPM、PGM、PBM、PNM、PCX、DDS、EXR、HDR。
- 每页以 144 DPI 渲染；遵循 PDF 的页面旋转与裁剪范围，以白色纸张背景导出。
- 单页直接下载图片；多页下载 ZIP，内部按 `page-001.png`、`page-002.png` 等名称排列。
- 显示已处理页数，支持取消、重试及批量转换。PDF 合集 ZIP 会展开为独立 PDF，使每个文档都能单独选择格式、取消和下载。
- PDF 引擎按需从本站加载，文件只通过浏览器 Worker 消息传递。没有上传 PDF、调用远程转换服务或执行 PDF 内的 JavaScript。
- PNG 保留渲染后的像素；AVIF 和 WebP 的质量 100 使用已有图片编码器的无损路径，JPEG 100 仍为有损。推荐模式 AVIF 使用 60，JPEG/WebP 使用 80。导出的图片可能大于原 PDF，不计入图片压缩的环保收益。

## 范围与限制

| 项目     | 行为                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 文件大小 | 单个 PDF 最大 100 MiB                                                                     |
| 页数     | 每个 PDF 最多 200 页                                                                      |
| 单页尺寸 | 144 DPI 下最多 1600 万像素                                                                |
| 输出总量 | 编码后的图片总量最多 256 MiB；ZIP 目录占用少量额外空间                                    |
| 并发     | 一次处理一个 PDF，文档内逐页渲染，及时释放页面和像素内存                                  |
| 超时     | Worker 启动 10 秒；引擎加载或连续 180 秒无页面进度时终止                                  |
| 密码     | 需要密码的 PDF 提示先在本地解除保护，本版本没有密码输入界面                               |
| 扩展格式 | PNG/JPEG 由 MuPDF 直接输出；其他格式按需加载本站 ImageMagick WASM，不依赖 Canvas 编码支持 |
| ICO      | 等比缩小至 256 × 256 像素以内，适用于图标                                                 |
| PSD      | 导出合并后的页面图片，不恢复 PDF 可编辑文字与图层                                         |
| EXR/HDR  | 输出 RGB 渲染结果，不增加原页面的 HDR 动态范围                                            |
| 不包含   | PDF 编辑、OCR、PDF 转 Word、图片合并为 PDF、页码范围与 DPI 设置                           |

这些上限用于约束浏览器内存占用，并不保证所有设备都能处理接近上限的复杂 PDF。渲染异常会保留失败状态与详情，后续任务仍可继续。

## 实现

- 固定依赖 `mupdf@1.28.1`，沿用项目的 AGPL-3.0 许可。[MuPDF 官方 API 与示例](https://github.com/ArtifexSoftware/mupdf.js)。
- `src/lib/converters/pdf.svelte.ts`：注册独立的本地转换器、串行队列、取消信号、超时、翻译后的错误信息与进度。
- `src/lib/workers/pdf.ts`：按需加载 MuPDF，按需加载 ImageMagick 编码模块；每个任务独立 Worker，取消时可停止同步 WASM 执行。
- `src/lib/util/pdf-images.ts`：真实 PDF 解析、逐页渲染、白色背景、旋转/裁剪、资源回收和流式生成 ZIP。
- `src/lib/util/pdf-image-encoder.ts`：复用 `convertImage`，统一 AVIF/WebP 无损、质量设置、ICO 尺寸控制与元数据处理。
- `src/lib/util/pdf-options.ts`、`src/lib/types/pdf-worker.ts`：转换范围、资源上限及消息类型。
- Vite 保留 MuPDF 的 ESM 模块用于开发环境；生产构建自动生成带哈希的 WASM 资源，无需手动复制二进制到 `static`。
- 接入文件识别、格式选择、现有质量设置、隐私状态与简体中文/繁体中文/英文/西班牙语文案。其他语言沿用英文回退。

## Review 修正

1. PDF 转换器声明了图片输出，但不能参与普通图片的输入转换器选择。`VertFile` 优先保留真正支持读取的转换器，输出格式不再干扰原有图片批量操作；仍保留原有“仅支持输出”错误识别。
2. PDF 队列使用独立 Worker 和 AbortController。终止 Worker 的同时取消消息等待和排队任务，避免一直卡在转换中或占用后续任务的队列位置。
3. 页面、像素、文档及 ImageMagick 图像均在 `finally` 中释放，ZIP 消费逐页生成器，避免同时保存所有页面的原始像素。
4. 输出检查 MIME，避免编码器返回错误格式时仍按目标扩展名下载；每个新增输出均经过实际编码、解码和多页 ZIP 内容测试。
5. PDF WebP 已改为 ImageMagick 编码，质量 100 的行为与普通图片一致；更新了相关提示，说明无损 AVIF 不一定比 WebP 更小。
6. PDF 合集直接展开，避免转换入口把多个多页 PDF 合成不便控制的嵌套归档任务。
7. 隐私文案区分 PDF 文档与普通图片，不把队列中的 PDF 数量称作图片数量；PDF 不参与现有图片压缩碳排估算。
8. 格式弹窗的原生 `close` 事件异步到达。避免重复恢复焦点，防止用户紧接着操作转换按钮时，焦点被拉回格式选择器；新增可稳定复现修复前失败的浏览器测试。

## 验证

- `tests/pdf-images.test.mjs`：使用真实 MuPDF WASM。校验 PNG/JPEG 文件签名、144 DPI 尺寸、白色背景、多页顺序与像素颜色、旋转与 CropBox、密码/空文档/损坏文件/页数和尺寸限制、异常后再次转换、编码器 MIME 校验与 PDF 文件识别。
- `tests/browser/pdf-images.mjs`：实际选择格式、转换、下载及解包，覆盖单页 PNG/JPEG/JPG/WebP、多页 PNG/JPEG/WebP、无后缀 MIME、异常提示、取消和重试、排队恢复、PDF 合集 ZIP、普通 PNG 转 AVIF 回归及 320/390/1100 像素宽度。
- `tests/pdf-image-formats.test.mjs`：23 个扩展名的单页与多页实际渲染、编解码、颜色与页序，AVIF/WebP 100 的像素一致性、ICO 尺寸限制。
- `tests/browser/pdf-format-matrix.mjs`：通过页面格式选择器批量转换全部 23 个选项，实际下载并解码单页文件、验证多页 ZIP。
- `tests/browser/pdf-load-retry.mjs`：分别阻断 MuPDF WASM 与 ImageMagick 编码器下载，验证失败可结束、解除阻断后同一文件可重试成功。后者通过 `IIPE_PDF_ENGINE=magick` 运行。
- `tests/browser/format-dialog-focus.mjs`：选择格式后继续移动焦点，验证延迟的关闭事件不会夺走焦点。
- 浏览器脚本记录引擎只在转换时加载、PDF 资源来源、非 GET/HEAD 请求和页面错误，不把“文件上传量 0 B”当作全站网络流量测量。

运行方式：

```sh
npm test
npm run build
npm run check
PLAYWRIGHT_MODULE=/path/to/playwright IIPE_TEST_BASE=http://localhost:5174 node tests/browser/pdf-images.mjs
```

本轮结果：全部 106 项 Node 测试通过；开发和生产模式的 PDF 浏览器测试通过；生产模式原有工作区回归通过；ESLint 通过，Svelte 检查 0 错误 / 0 警告，生产构建通过。

浏览器验证报告与截图见 [pdf-conversion-validation](pdf-conversion-validation/README.md)。

AVIF 对带 16 位标记输入的体积问题与修复见 [AVIF 位深验证](avif-bit-depth.md)。
