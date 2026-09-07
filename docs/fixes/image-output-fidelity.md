# 图片转换：位深、颜色、方向与透明度审查

2026-09-07。在 [AVIF 位深修复](avif-bit-depth.md)之后，检查共享图片编码路径，覆盖 PNG、JPEG/JPG/JPE/JFIF、WebP、AVIF、JXL、TIFF/TIF、JP2、PSD、PPM，以及使用同一路径的 PDF 页面和图标输出。

后续已同步上游 PR 复审中的两处补充修正：CMYK/Lab 的 JPEG 白底与 TIFF 有效低位深存储。实现与最新验证见 [补充修复记录](upstream-review-sync.md)；下方原始测试数量和测量数据保留为当轮记录。

## 已复现并修复

| 问题                           | 原行为与影响                                                                                    | 修复                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 高位深标记继承                 | Q8 解码的 16 位 PNG 转 TIFF、JXL、JP2、PSD、PPM，仍输出 16 位；体积增加但没有额外精度           | 依据实际引擎精度限制输出位深                                                             |
| 调色板索引位深被当作通道位深   | 2 位索引 PNG 的真实 RGB/alpha 通道仍可有 8 位精度；转 TIFF 后透明度 128 变成 85，部分颜色也改变 | 保证真实 RGB/alpha 通道精度；TIFF 仅在实际通道值可由源位深表示时保留低位深存储           |
| TIFF 默认未压缩                | JPEG、BMP、PNG 转 TIFF 大幅膨胀                                                                 | 显式设置 TIFF 的 ZIP/Deflate 无损压缩，不再次使用 JPEG 有损压缩                          |
| 方向标记不能跨格式可靠显示     | 依赖 TIFF/EXIF 方向的图片转 WebP/JPEG 后横过来，移除元数据也可能丢失方向                        | 写入前应用 `autoOrient`，将旋转或镜像落实到像素，重置方向以避免查看器二次旋转            |
| 删除 ICC 导致偏色              | 关闭保留元数据时直接 `strip`，P3/Adobe RGB 像素被按 sRGB 显示                                   | 在原 ICC 存在时先转换至标准 sRGB，再移除源配置、EXIF、XMP 和注释；保留元数据时保留源 ICC |
| 透明 PNG 转 JPEG 暴露隐藏颜色  | JPEG 不支持 alpha，原来的直接写入会让完全透明或半透明的红色都变为实红色                         | 显式以白底合成；半透明边缘按 alpha 混合；JPG/JPE/JFIF 共用同一路径                       |
| 透明索引 PNG 导出无效 PSD      | 编码完成，但再次打开报 `ImproperImageHeader`                                                    | 对带 alpha 的调色板图像先展开为真彩色 RGBA，再写 PSD                                     |
| 无损 WebP 丢弃全透明区域的 RGB | 默认 WebP 为提高压缩率可清除透明像素下的颜色，后续编辑无法恢复                                  | 质量 100 时启用 `webp:exact`；有损模式保持默认策略                                       |

改动集中在 `src/lib/util/magick-image.ts`，复用现有静态图、动画帧、图标和 PDF 编码调用。保留现有质量预设、AVIF 编码速度与用户的元数据开关，不按输出大小偷偷改变目标格式或降低质量。

## 用户样本的实际测量

输入 `IMG_0217.PNG`：1,673,838 B，1170 × 2532。所有结果质量 100、保留元数据、没有缩放。这里的“修复前”已包含上一轮 AVIF 专项修复。

| 输出      |   本轮修复前 |  本轮修复后 |
| --------- | -----------: | ----------: |
| TIFF      | 17,776,081 B |   582,853 B |
| JPEG XL   |    520,510 B |   486,680 B |
| JPEG 2000 |  4,148,049 B | 1,345,758 B |
| PSD       |  7,864,477 B | 7,709,378 B |
| AVIF      |    746,659 B |   746,659 B |
| WebP      |    329,380 B |   329,380 B |

上述所有结果与引擎解码出的 8 位 RGBA 像素比较，哈希一致。TIFF 启用压缩会增加编码工作，此样本从约 56 ms 增至 774 ms；这不是无成本优化。实际耗时随设备变化。

合成的 192 × 128 RGB 图也验证了同类问题：16 位 PNG 转 TIFF 从 147,720 B 降至 974 B，转 JXL 从 4,584 B 降至 3,603 B。不同内容的收益不同，不能把这些压缩率作为全局保证。

仅归档[数值记录](image-fidelity-validation/user-sample-results.json)，用户原图与转换图不进入仓库。

## 格式限制与界面说明

- 当前引擎是 Q8，16 位、RAW 或 HDR 原图的完整精度和动态范围不能通过改输出扩展名恢复。这一限制在“格式与画质限制”中说明。
- JPEG 输出使用白底，文件行展示相应说明。没有引入背景色选择器。
- GIF 每帧最多 256 色，透明度只有全透明与不透明，不能把量化限制当作质量 100 可以解决的问题。选择 GIF 后展示说明。
- sRGB 转换可能裁剪超出 sRGB 的颜色范围。需要保留广色域配置时可保留元数据；不承诺 HDR 色彩转换或专业高位深存档能力。
- 无损指编码阶段保留已解码/处理后的像素。方向校正会旋转或镜像像素；颜色空间转换会改变 RGB 数值以保持显示颜色；Q8 不等于原始 16 位数据无损。

## 审查与验证

- 新增 `tests/magick-output-fidelity.test.mjs`，40 项回归：高位深、调色板真实颜色/alpha、TIFF 压缩、8 种旋转/镜像方向、JPEG 别名、真实 EXIF 移除、保留/删除 ICC。最初的 29 项探针中，旧实现有 23 项失败；修复后新增及原有测试全部通过，共 146 项。
- `tests/browser/image-fidelity.mjs` 在开发与生产页面上传合成文件、选择输出、实际下载并解码。覆盖 TIFF/PSD/WebP alpha、方向、ICC、JPEG 白底与 390/1100 px 界面。
- 浏览器独立颜色检查：使用 Chromium Canvas 的 sRGB 显示结果对照 P3 原图与移除 ICC 后的 PNG。测试色块最大通道差 1/255，平均差约 0.014/255；不是只对照编码器自己的输出。
- 原有 `tests/browser/workspace.mjs` 与 PDF 23 格式浏览器矩阵回归通过，包含实际解码、ZIP 页序和下载检查。GIF/WebP 动画时序、ICC、CICP、HEIC 与取消/重试的原有测试继续通过。
- Svelte 检查 0 错误 / 0 警告，修改文件 ESLint、Prettier 与生产构建通过。浏览器报告无页面错误及非 GET/HEAD 请求。
- 标准 sRGB 配置只有 480 B，直接内嵌，无额外网络请求或新依赖。采用固定版本的 CC0 配置，见[来源、许可和校验和](../../src/lib/assets/profiles/README.md)。

验证报告与合成界面截图见 [image-fidelity-validation](image-fidelity-validation/README.md)。

参考：[ImageMagick 方向校正](https://imagemagick.org/command-line-options/#auto-orient)、[ICC 转换顺序](https://imagemagick.org/command-line-options/#profile)、[WebP 编码参数](https://imagemagick.org/webp/)、[编码器选项](https://imagemagick.org/defines/)。实际行为以本项目锁定的 WASM 和上述测试结果为准。
