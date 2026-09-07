# 同步 PR 复审中的 JPEG 与 TIFF 补充修复

2026-09-07。将上游贡献仓库中已审查的两处修正接入本项目共享图片编码函数，修复此前仅更新 PR 分支、未同步回二开项目的遗漏。

## 修正范围

- **JPEG 白底的色彩空间。** 保留元数据时，带透明通道的 CMYK、Lab TIFF 可能以原色彩空间进入 JPEG 编码。RGB 的白色通道值不能直接用作这些空间的背景值。现在创建一个 1 × 1 白色像素，转换到输入色彩空间，再设置透明度合成背景；临时图像在 `finally` 中释放。普通 RGB、JPEG 后缀别名和不透明 CMYK 的原有路径继续通过回归。来源：[PR #280](https://github.com/VERT-sh/VERT/pull/280)，提交 `06f847478f81a26bb58b0c13854ba6814c685488`。
- **TIFF 的有效低位深。** 对 TIFF/TIF 输出且源位深低于 8 的图像，使用 `determineBitDepth()` 检查实际通道精度；能够完整表示 RGB/alpha 时保留源位深，否则仍提升到 8 位。高位深输入继续受 Q8 引擎精度限制，TIFF 继续使用 ZIP 无损压缩。来源：[PR #276](https://github.com/VERT-sh/VERT/pull/276)，提交 `c5347a0c01aed9253d4bd7818adeceb1a0b83813`。

实现：[magick-image.ts](../../src/lib/util/magick-image.ts)。复用现有静态图、图标、动画帧及 PDF 图片编码入口；没有更换依赖或修改质量预设。

## 审查与验证

先移植上游的 17 项回归用例，在修改生产代码之前执行：6 项通过、11 项失败。失败包括保留元数据时的四种 CMYK JPEG 后缀、Lab 白底，以及 1/2/4 位灰度的 TIFF/TIF 输出。CMYK 的白底实测为 `0,0,0`，Lab 为 `255,90,0`；低位深 TIFF 全部被扩大到 8 位。

同步后验证结果：

| 检查                               | 结果                              |
| ---------------------------------- | --------------------------------- |
| 图片保真专项测试                   | 57 项通过，包含新增的 17 项       |
| 全部 Node 测试                     | 163 项通过，0 失败；Node 22.22.2  |
| Svelte / TypeScript 检查           | 0 错误，0 警告                    |
| 修改代码与测试的 ESLint / Prettier | 通过                              |
| 生产构建                           | 通过                              |
| Chromium 生产页面                  | 12 项实际转换、下载与解码检查通过 |

新增测试位于 [magick-output-fidelity.test.mjs](../../tests/magick-output-fidelity.test.mjs)。既有调色板真实 RGB、半透明 alpha、16 位标签、PSD、AVIF、ICC 以及 PDF 格式回归继续通过。

[浏览器脚本](../../tests/browser/image-fidelity.mjs)新增 CMYK/Lab 透明 TIFF 转 JPEG，以及 1/2/4 位灰度 PNG 转 TIFF/TIF。前者校验显示为 sRGB 时的白底；后者同时校验输出位深与完整解码像素。生产结果见 [JSON 记录](image-fidelity-validation/review-sync-production-results.json)，无页面异常、无非 GET/HEAD 请求。

首次浏览器检查未进入转换阶段：重建后旧的 Vite 预览进程仍引用已删除的旧哈希资源，入口脚本返回 404。重启 `5184` 的预览进程后，以上 12 项完整通过。开发预览仍使用 `5174`。

审查确认：低位深扫描仅限符合条件的 TIFF 输出；JPEG 背景只创建单个像素，不复制完整输入；异常路径释放临时图像。结果仍受现有 Q8 精度及格式能力限制，不代表新增 16 位/HDR 保真能力。

复现命令：

```sh
npm test
npm run build
npm run check
npm run preview -- --host 0.0.0.0 --port 5184 --strictPort
```

在另一终端，指定本机 Playwright 模块路径后运行：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
IIPE_TEST_BASE=http://localhost:5184 \
node tests/browser/image-fidelity.mjs
```
