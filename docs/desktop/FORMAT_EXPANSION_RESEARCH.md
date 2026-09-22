# 桌面版原生格式扩展调研

核查日期：2026-09-13；项目基线 `8cd4bad`。本轮是文档、源码检查及有限引擎探测，没有开放新格式，也没有重打发行包。同类项目未安装实测；下面分别标注本项目事实、官方能力、借鉴建议和待验证条件。

## 结论

桌面版有条件比当前浏览器 WASM 版提供更多输入、输出及处理方式。优势包括组合本地引擎、文件流式处理、重封装、硬件加速和可选专业工具。实现上限取决于实际编译、依赖封装、转换路线、质量与资源管理，不能用某个引擎官网的格式总数代表产品能力。

建议保留 Rust 管理原生 CLI 的架构，先扩展已有引擎，不为“原生”而重写为 Rust/C 库绑定。采用“共同基础能力 + 平台可用增强能力 + 可选扩展引擎”，不以最弱平台永久限制全部平台，也不让用户看到无法使用的格式。

## 1. 本项目的实际限制：不止一个白名单

| 层级      | 发现                                                                                            | 扩展时需要修改                                                           |
| --------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 产品范围  | `packaging/desktop/v1-scope.json` 冻结图片四输出、PDF 四输出、音频五输出、Markdown/DOCX → TXT   | 更新可验收路线与样本，不把 84 条路线称为 84 种格式                       |
| Rust 路由 | `src-tauri/native/src/convert.rs` 的 `OutputFormat` 和 `output_formats` 明确拒绝其他输出        | 输入识别、格式路由、编码参数、结果验证、预览和文件保存                   |
| UI 契约   | `desktop/src/platform/queue-contract.ts` 仅接受十种输出                                         | 前后端契约共同更新，覆盖队列恢复、历史记录和批量公共输出选择             |
| 编译依赖  | `packaging/desktop/linux/build-core24.sh` 关闭 TIFF、JXL、OpenEXR、RAW、rsvg、Ghostscript 等    | 补充固定版本依赖、源码/许可和编译参数；不是简单删除 `--without-*` 就完成 |
| 模块封装  | `scripts/desktop-bundle-linux.mjs` 只复制 png/jpeg/webp/heic 和少量辅助 coder                   | BMP/GIF 等即使可在构建机使用，也不表示最终包带了对应 `.so/.la`           |
| 实际平台  | Mac 使用重定位的 Homebrew 模块闭包，Windows 使用固定便携引擎；Windows ARM 部分引擎为 x64 子进程 | 六个系统×架构分别报告能力；不从 Linux 推断其他包                         |

因此需要修正此前“主要只是没有把引擎能力开放”的表述：文档和视频确有这类情况，但 Linux 图片同时受到编译裁剪和模块未封装的限制。

### 1.1 最终 Linux ARM64 包的有限实测

对象是运行 `34711315368` 产出的 Ubuntu 24.04 ARM64 deb 解包引擎，非系统 PATH 上的 ImageMagick。使用随包 ELF loader、私有库和模块目录；原始记录与探测脚本见 [证据](evidence/format-research-20260913/)。这不是六平台兼容验收，也不经过桌面产品的任务策略层。

- ImageMagick 7.1.1-43 的最终模块目录只有 13 类 coder；缺少 BMP/GIF/ICO/TGA/QOI/TIFF/JXL/EXR/JP2 对应模块。`-version` 中出现 jp2 delegate 也不能证明最终包可转 JP2。
- 2×2 合成 PPM 输入，显式指定 coder 的尝试中，PPM、HEIC、AVIF 输出可重新识别为相应格式且尺寸正确；它们仅是最小烟测，不证明色彩、透明度、质量或多帧保真。
- 其余测试格式没有产生可按预期路径重新识别的对应输出。第一次只写 `output.bmp` 等扩展名时，命令甚至返回成功、输出仍是 PPM，重新打开也有正确尺寸。**退出码为零 + 文件存在 + 尺寸正确不足以证明转换成功**。严格探测的 stdout/stderr 和首轮真实文件头都保留了，未把假阳性计为支持。
- 随包 FFmpeg 列出 `libx264`、`libx265`、`libvpx-vp9`、`libsvtav1`、AAC、Vorbis、PCM 等编码器；这证明二进制有入口，不证明每个容器组合、硬件路径或所有源文件可用。本轮未执行新增视频编码验收。
- 随包 Pandoc 的输入/输出列表远多于桌面已开放范围，包括 HTML、RTF、ODT、EPUB、RST 等。其输出列表出现 PDF，并不证明 PDF 排版引擎已打包。

## 2. 各类原生引擎能扩展到哪里

| 方向                   | 优先候选                                                  | 引擎路线与客观限制                                                                                  | 建议层级             |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- |
| 常见静态图片           | BMP、GIF 单帧、TIFF、ICO、TGA、QOI、PNM 家族              | ImageMagick；补齐模块，TIFF 需 delegate；定义透明度、位深、多页和图标尺寸                           | 基础扩展             |
| 现代/专业图片          | JXL、JP2、EXR、HDR、PSD 合成图；HEIC 输出                 | 依赖 libjxl、OpenJPEG、OpenEXR、libheif 编解码器；PSD 不承诺图层往返；HEIC 的解码支持不等于编码支持 | 编解码器验收后开放   |
| PDF 与图片组合         | PDF → 更多栅格格式；图片 → 多页 PDF；文本型 PDF 提取文本  | 复用 MuPDF 渲染 + ImageMagick 编码；多页/顺序/颜色/透明度需定义；扫描页没有可直接提取的正文         | 基础扩展，逐路线验收 |
| 动画                   | GIF、动画 WebP、APNG 等                                   | 需帧序列、帧时长、循环、处置方式和总像素预算；禁止默认只保留第一帧却称完整转换                      | 独立后续能力         |
| 音频                   | AAC、OGG/Vorbis、AIFF、ALAC；扩展输入                     | FFmpeg；区分容器与编码，例如 M4A 可装 AAC 或 ALAC；采样率、声道、封面和标签独立验收                 | 基础扩展             |
| 视频                   | MP4/H.264、WebM/VP9、MKV 预设；再补 HEVC/AV1              | FFmpeg + ffprobe；需音视频流选择、字幕、旋转、色彩、奇数尺寸、输出兼容性                            | 先 CPU 通用预设      |
| 无损处理               | 重封装、音轨提取、流复制、关键帧裁切                      | 无需重新编码时可快且不引入编码损失；不代表所有容器兼容，也不保证任意帧精确裁切                      | 桌面优势功能         |
| 结构化文档             | Markdown、HTML、DOCX、ODT、RTF、EPUB、RST、TXT 的有效路线 | Pandoc；保留正文结构但不承诺 Word 页面布局、字体和分页完全一致                                      | 基础扩展             |
| Office / 表格 / 幻灯片 | DOC/XLS/XLSX/PPT/PPTX/ODS/ODP → PDF；再转图片             | LibreOffice 等单独引擎。Pandoc 不能作为通用 XLSX 或旧 DOC 转换器；多工作表和打印区域需要产品选项    | 可选 Office 能力     |
| SVG / RAW / OCR        | SVG 栅格化；相机 RAW 显影；扫描 PDF → 搜索文字            | resvg/Inkscape、LibRaw、Tesseract 等专业工具；分别涉及字体/资源、相机型号/显影、语言模型和识别误差  | 专项扩展             |

依据：[ImageMagick 格式说明](https://imagemagick.org/formats/)、[delegate 配置](https://imagemagick.org/resources/)、[FFmpeg 编解码器](https://ffmpeg.org/ffmpeg-codecs.html)、[FFmpeg 命令与 streamcopy](https://ffmpeg.org/ffmpeg.html)、[Pandoc 手册](https://pandoc.org/MANUAL.html)、[MuPDF draw](https://mupdf.readthedocs.io/en/latest/tools/mutool-draw.html)、[libheif](https://github.com/strukturag/libheif)。表内“优先”“层级”为对本项目的建议，不是已经支持的声明。

Office、SVG、RAW、OCR 官方入口：[LibreOffice CLI](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html)、[resvg](https://github.com/linebender/resvg)、[LibRaw](https://www.libraw.org/about)、[Tesseract](https://tesseract-ocr.github.io/tessdoc/)。XLSX → CSV 会失去格式、公式语义及多工作表结构，不能代替整个工作簿的保真转换；扫描 PDF → DOCX 也不是改扩展名或单次 Pandoc 调用可以解决。

### 2.1 更丰富的功能不等于格式更多

值得利用桌面原生能力的方向：大文件按磁盘流转、可控并发、多页输出、流复制、分辨率/码率预设、可恢复长任务，以及经过硬件探测的加速编码。当前产品仍有 512 MiB 输入等人为限制，原生不会自动消除这些限制；提高上限前先按解码像素、时长、临时磁盘和内存预算验证。

硬件编码器被编译进 FFmpeg，不等于用户 GPU/驱动支持。Mac VideoToolbox、Windows NVENC/QSV/AMF/Media Foundation、Linux VAAPI/QSV/NVENC 应分别试编码，失败可显式回退 CPU；不得承诺同一质量数字下文件大小或画质一致。[FFmpeg 硬件说明](https://ffmpeg.org/ffmpeg.html)、[HandBrake 预设](https://handbrake.fr/docs/en/latest/technical/official-presets.html)。

## 3. 同类开源项目的启示

| 项目                                                                             | 查到的事实                                                                                              | 对 Z8.Work 的建议与不适用之处                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Converseen](https://github.com/Faster3ck/Converseen)                            | 跨平台批量图片工具，基于 ImageMagick，包含 PDF 转图片；更新记录显示 JXL/HEIC 能力受实际包依赖影响       | 借鉴批处理和实际依赖决定格式；不照抄“100+”为我们的支持数                      |
| [ConvertX](https://github.com/C4illin/ConvertX)                                  | 自托管服务器整合 ImageMagick、FFmpeg、Pandoc、LibreOffice、Calibre、resvg 等多引擎                      | 借鉴引擎适配与任务路由；Docker 服务器能装齐依赖，不代表六平台桌面都能同样打包 |
| [File Converter](https://github.com/Tichau/FileConverter)                        | Windows 资源管理器工具，按输入、输出分类；其 v2.0 格式 Wiki 明确 Office 转换需要已安装 Microsoft Office | 借鉴具体目标预设与依赖说明；不能把 Windows Office 自动化复制成跨平台方案      |
| [Shutter Encoder](https://www.shutterencoder.com/documentation/)                 | 文档按编码、重封装、提取等功能组织，有专业媒体工作流                                                    | 视频 UI 按任务和预设组织，避免只展示扩展名；不必同时复制专业剪辑功能          |
| [HandBrake](https://handbrake.fr/docs/en/latest/technical/official-presets.html) | 提供兼容目标预设；硬件预设依赖设备和驱动能力                                                            | 先实现通用 CPU 预设与真实硬件探测，不把 GPU 支持作为默认保证                  |
| [LosslessCut](https://github.com/mifi/lossless-cut)                              | 基于 FFmpeg 的无损音视频处理，强调重封装/提取等；关键帧影响裁切能力                                     | 把“不重编码”做成明确功能，并区分可转换与 WebView 可预览                       |

本次通过 API 记录源码 HEAD，文档网页另按核查日期引用；没有声称逐行审计这些项目：

- Converseen：`ad9f4d535434beab92315ba3fca4301cff57ac6c`。
- ConvertX：`d34c1394497b647be1768fbca54abac8ef09e0cd`。
- FileConverter：`6c157a411fb70fb7440d2e3b226042781fd55b15`；Wiki 格式表标注 2024-03-07，不能当作最新版本完整实测矩阵。
- HandBrake：`92f3dcb667bee9e41c721f522b4f63e8248886dd`。
- LosslessCut：`aa498c38ec3dd3fd26b98d44aa86b27bbcbce333`。

额外检查了 ConvertX 的 [ImageMagick 适配源码](https://github.com/C4illin/ConvertX/blob/d34c1394497b647be1768fbca54abac8ef09e0cd/src/converters/imagemagick.ts)：输入声明包含 `http`、`https`、`gradient`、`clipboard` 等协议/伪格式。因此“格式总数”不能直接拿来比较用户文件格式，更不能把这类输入默认开放给本地转换器。这里只指出统计口径和复用边界，不据此断言该项目存在漏洞。

## 4. 推荐的能力模型

这是设计建议，尚未创建新的运行时接口。

每条路线记录：输入探测类型、规范输出格式、别名、读/写方向、操作（转码/重封装/渲染/提取）、所需引擎及插件、容器和 codec、静态/动画/多页语义、质量/元数据选项、各平台实测状态、限制及失败原因。

用户可选能力应满足：**实际引擎可用 ∩ 产品已接入路线 ∩ 该平台通过验收 ∩ 当前输入满足条件**。探测使用 `magick -list format`、FFmpeg 的 demuxer/muxer/decoder/encoder 清单及 Pandoc 输入/输出清单，再以小样本验证；不能仅判断引擎进程存在或版本输出成功。

复用既有队列、进程隔离、取消、原子保存和失败重试。前端从后端获得有效路线，减少两份手写白名单漂移；持久化数据增加格式时要向后兼容，旧任务恢复不能因为新枚举变化崩溃。显示“缺少 TIFF 编码模块”或“此版本暂未实现视频输出”等具体原因；预览失败不应否定转换能力。

## 5. 开发顺序建议

以下是调研后的优先级，不是用户已经批准的排期，也不以固定格式数量作为交付目标。

1. **能力清点与统一路线定义。** 六个平台记录最终包能力，清理别名/伪格式，把“已发现”与“已验收”分开；为后续扩展准备回归数据。
2. **常用图片与 PDF 输出。** 补齐 BMP/GIF 单帧/TIFF/ICO/TGA/QOI 等；明确 PDF 页输出、图标尺寸、透明底处理。JXL/EXR 等依赖作为独立小批次接入。
3. **文档与音频补齐。** 先用已有 Pandoc/FFmpeg，优先 HTML/RTF/ODT/EPUB 与 AAC/OGG/AIFF/ALAC 等有明确需求的路线。
4. **视频预设与无损重封装。** CPU 路线先稳定，再加硬件加速；验证多流、字幕、HDR 和质量/体积，不默认复用音频提取逻辑。
5. **动画、多页与专业图像。** 先定义帧/页/图层取舍，再接入；RAW 用真实不同相机样本验收。
6. **可选 Office/OCR/电子书增强。** 单独评估依赖体积、资源使用、安装与商店渠道，明确是否附带引擎或调用用户指定安装。不要默认悄悄下载可执行工具。

PDF → 网页版的 23 个扩展可作为逐项对照清单，但 JPEG/JPG、TIFF/TIF 是别名；不要求浏览器与桌面每个内部 coder 完全相同，也不以这些扩展为桌面上限。

## 6. 交付门槛与 review 修正

- 检查实际文件头/解析结果与目标编码一致，再检查重新解码、尺寸/时长；本轮探测已证明只看退出码会误判。产品目前限制在已验证格式，此探测不是现有常用转换已出错的结论。
- 图片覆盖透明/不透明、ICC/EXIF 方向、灰度/CMYK、16 位、多帧/多页；压缩输出变大要展示事实，不承诺“新格式必更小”。
- 视频覆盖真实容器与 codec 组合、A/V 同步、多声道、多音轨/字幕、旋转、VFR、HDR、缺失音轨、截断输入；streamcopy 不与有损转码混称。
- 文档覆盖中文、图片/表格、相对资源、缺失字体、分页差异；仅成功生成文件不足以证明内容保真。
- 每条新增路线继续验证取消、超时、临时磁盘不足、批量部分失败、输出冲突和原文件不变。设置资源限制，禁用无关网络协议/远端资源与任意 delegate；扩展格式不能破坏本地处理承诺。
- 各系统×架构分别验证最终包；Mac 新增动态库必须签名、公证，Linux Snap 验证可访问依赖，Windows ARM 区分原生进程和 x64 模拟进程。不能为了格式数把构建机的全局库带进运行时依赖。
- 变更编解码器会影响包体积、最低系统版本与许可材料；依据实际构建审查，不能从“开源”推导任意组合可分发。FFmpeg 官方说明可选组件会改变其许可条件，[许可说明](https://ffmpeg.org/legal.html)。本轮不作新的法律或商店批准结论。

本轮 review 已修正：① 不再把差距归因于单一白名单；② 不把格式别名/伪格式计成独立用户格式；③ 不把 Pandoc PDF writer 列表当作自带排版引擎；④ 不把 CPU/硬件编码视为相同能力；⑤ 不把引擎枚举/2×2 样本当作产品级支持；⑥ 不把服务器项目的依赖规模当作桌面包成本为零。
