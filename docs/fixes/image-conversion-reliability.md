# 图片互转：体积、耗时与任务可靠性

验证日期：2026-09-07。引擎：`@imagemagick/magick-wasm@0.0.43`，ImageMagick 7.1.2-30 Q8。原有未提交的前端、隐私和环保功能保留。

## 定位结果

1. **AVIF 默认 100 不适合压缩照片。** 100 启用无损编码，将已经有损压缩的 JPEG/WebP 解码后再无损保存，很容易增大。原先修复的 AOM 无损编码兼容参数仍保留，没有把用户选择的 100 暗改成 99。
2. **PNG 不能套用有损格式的质量百分比。** ImageMagick 的 PNG quality 控制 zlib 压缩级别和过滤器；旧的 100 参数会进行耗时的高等级压缩。现在明确使用 level 6、filter 5，保持当前引擎解码后的像素不变。对部分照片，结果会略大于 level 9，这是缩短编码等待时间的取舍。
3. **转换没有截止时间。** 初始化有超时，实际转换却一直等待 Worker 消息。现在转换最多等待 180 秒，出错／超时后终止 Worker、释放队列，并保留可展开的错误详情。状态区按实际消息显示等待、加载、解码、编码。
4. **并发数量直接等于 CPU 核数。** 每个图片 Worker 都加载独立 WASM 堆；现在在图片转换器内部统一限制为最多 2 个，单核或浏览器报告内存不超过 4 GB 时为 1 个。单文件、批量和 ZIP 内的图片转换共用此限制；等待任务可取消。
5. **单文件按钮传错参数。** 原来的 `onclick={file.convert}` 将点击事件当作质量参数发给 Worker，浏览器中实际失败。现在显式无参数调用，并在转换器入口验证质量值。
6. **GIF/WebP 分支忽略质量和元数据设置。** 改为对每帧应用配置并合成局部帧，保留动画时序。转静态格式时仍仅取首帧，界面补充说明。
7. **图像对象与图标读取。** 静态图片只读取首张，不解码并丢弃整个多图容器；图像在成功／失败后都释放。ICO 改为一次读取带明确 ICO 解码器的集合，替代无限递增帧索引的读取循环。保留多尺寸图标输出 ZIP 的行为。
8. **开发环境首次转换触发页面刷新。** 冷启动后，图片 Worker 的延迟依赖会触发 Vite 再次预编译并刷新页面，中断任务。`optimizeDeps.include` 提前编译这 4 个依赖，冷启动首次 HEIC 转换通过。

HEIC 的公开样本能正常转换；本轮复现了大图较慢和任务缺少退出保障，**没有获得用户报告中一直卡住的原始 HEIC，不能确认它是否另有编码器兼容问题**。

## 质量与界面

- 新设置默认“推荐压缩”：AVIF 60，JPEG/WebP 80；PNG 独立使用无损压缩参数。AVIF 配置 `heic:speed=6`。
- “自定义质量”保留 1–100。已有保存设置沿用原质量，包括 100；界面提示 AVIF/WebP 100 的无损模式可能明显增大体积，用户可切换为推荐压缩。JPEG 100 仍为有损。
- 不保证转换必然变小，不更换用户选中的输出格式，不因结果较大而静默返回原文件。文件卡片继续显示实际输入／输出体积；环保统计只按真实净节省计算。
- 质量控件在转换工作区直接可见，与设置页共用。补齐简体中文、繁体中文、英语、西班牙语；其他语言沿用英语回退。

## 实测

测试机器上的单次耗时，不代表所有设备的速度。照片由 libheif 的公开 `example.heic` 导出 JPEG；大图为该照片放大至 4032×3024 后生成的 HEIC。

| 输入与操作                      | 原参数                    | 调整后                                 |
| ------------------------------- | ------------------------- | -------------------------------------- |
| 303,842 B JPEG → AVIF           | 质量 100：1,577,819 B     | 推荐质量 60：191,129 B，较输入小约 37% |
| 12 MP HEIC → PNG，直接调用 WASM | 约 13.23 秒，10,668,620 B | 约 2.99 秒，11,064,020 B               |
| 多图 HEIC → PNG，读取阶段       | 约 260 ms                 | 只读首张约 36 ms                       |

PNG 的性能优化不是有损压缩；HEIC/JPEG 转 PNG 本来就可能显著增大。需要减小照片体积时可选推荐压缩的 WebP/AVIF。

## 回归验证

`npm test` 共 53 项通过，其中图片矩阵在每个输入测试内检查 8 个目标格式：PNG、JPEG、WebP、AVIF、GIF、BMP、TIFF、JXL，共 64 条路径，验证实际输出格式和尺寸。

新增覆盖质量迁移与非法参数、并发上限、8/10 位 HEIC 与 HEIF 扩展名、PNG 解码像素一致、AVIF 无损、局部帧动图的画面／时序／元数据、WebP 质量生效、损坏 HEIC、ICO 多尺寸和 Worker 中间状态不提前结束任务。此前 AVIF ICC/CICP/透明像素及 Service Worker 回归保留。

生产浏览器验证包括 JPEG→AVIF、大图 HEIC→PNG 的单文件按钮、批量等待任务取消、编码中取消后重试、损坏文件退出、模拟不响应的 Worker 超时后重试、SVG→WebP、ICO→两张 PNG 的 ZIP、旧质量 100 迁移、设置持久化和手机布局。超时用测试脚本丢弃转换消息并将 180 秒定时器缩短，未改变产品时限。

类型检查、修改文件的 ESLint、Prettier 和生产构建通过。浏览器证据与数据见 [验证记录](image-conversion-validation/README.md)。

## 边界与来源

- 当前引擎是 Q8。10 位 HEIC 测试确认能读入并保留**解码后的 8 位像素**，不是完整 HDR／10 位档案保真验证。
- 多图 HEIC/TIFF 和动图到静态格式只保存首张；GIF/WebP 之间保留动画。ICO 仍按原有规则将大于 256 的输出缩小到格式允许的范围。
- 没有穷举所有相机 RAW、HDR、损坏容器、超大动画及自动生成列表中的稀有格式；超时和错误信息是退出保障，不等于新增了所有解码能力。
- [Vite 依赖预编译](https://v5.vite.dev/guide/dep-pre-bundling)：提前声明首次 Worker 运行才会发现的依赖。
- [ImageMagick quality 参数](https://imagemagick.org/command-line-options/#quality)与[格式专用 defines](https://imagemagick.org/defines/)：PNG 压缩级别／过滤器、HEIC/AVIF speed。
- [ImageMagick HEIC 编码源码](https://github.com/ImageMagick/ImageMagick/blob/7.1.2-30/coders/heic.c)：quality 100 的无损模式。
- [magick-wasm 读取设置](https://github.com/dlemstra/magick-wasm/blob/main/src/settings/magick-read-settings.ts)：实际 API 同时核对安装包声明并执行验证。
- 公开输入：[libheif example.heic](https://github.com/strukturag/libheif/blob/master/examples/example.heic)、[heic2any 多图样本](https://github.com/alexcorvi/heic2any/blob/master/demo/15.heic)。未将这些照片加入仓库。
- 仓库内的回归输入均为[自行生成的测试图案](../../tests/fixtures/README.md)。
