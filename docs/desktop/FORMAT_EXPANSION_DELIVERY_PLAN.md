# 桌面格式扩展实施计划

核查日期：2026-09-14。该计划不包含视频转码；四项产品决策已于同日确认。

## 目标范围

| 层级 | 项目                                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 超低 | `UL-01`：`jpe`、`jfif` JPEG 文件名别名                                                                                                                                            |
| 低   | `L-01` 文本/Markdown 别名、`L-02` `oga/mka/weba` 音频容器别名、`L-03` RST → TXT                                                                                                   |
| 中   | `M-01` PNM、`M-02` 静态 GIF、`M-03` 基线单页 TIFF、`M-04` 基础 ICO、`M-05` PCX/XBM/XPM、`M-06` 额外音频输入、`M-07` AAC/ALAC 输出、`M-08` 结构化文本提取、`M-09` PDF 文本层 → TXT |
| 专项 | HEIC/HEIF 输出、静态 SVG 栅格化、JXL、EXR/HDR/DPX                                                                                                                                 |

格式“支持”只在以下四项同时成立后公开：受控路由、输入安全、包内依赖、六个桌面目标的真实文件验收。网页端或构建机上能运行并不等于桌面产品可支持。

## 实施阶段

### P0：能力合同与样本基线

1. 扩展现有唯一来源 `packaging/desktop/v1-scope.json`，并同步 Rust `OutputFormat`、桌面 `Format` 联合类型、预览、历史任务和发行报告；不新建平行格式登记表。
2. 复用现有包内引擎清单与启动信息，在每个最终包生成并验证已通过的格式能力集；桌面 UI 只显示该安装包已验收的路线（Q1=B）。
3. 为每项记录静态/多页/多帧、位深、alpha、色彩、元数据、文本层、音轨等明确边界。
4. 为 Linux、Windows、macOS 的 AMD64/ARM64 分别生成包内引擎探测、真实输入、输出读回和失败样本记录。

**验收：** 不允许仅凭扩展名、退出码或文件存在即认定成功；输出必须由独立 reader/ffprobe/Pandoc/MuPDF 重新读取。

### P1：超低与低难度路线

1. `UL-01`：将 `jpe`、`jfif` 显式映射到 JPEG reader，保留实际解码验证。
2. `L-01`：`txt`、`text` 仅接受 UTF-8 纯文本并直接归一化为 UTF-8 TXT；Markdown 别名固定为 Pandoc `markdown` reader。`L-03` 固定为 Pandoc `rst` reader。两个 Pandoc 路径均维持 `--sandbox` 并拒绝外部资源、Lua/filter 和伪装文件；纯文本路径不执行外部程序。
3. `L-02`：只扩展到既有 Ogg/Matroska demuxer；验证无音轨视频、播放列表、改名文件和取消。

**验收：** 所有别名各有真实样本和一个负例；不把别名计为新的转换格式。

### P2：中难度静态图片

1. `M-01`：PNM/PBM/PGM/PPM/PAM 输入输出，以及 PDF 页面导出；固定单帧、受限位深语义。
2. `M-02`：GIF 只处理单帧/首帧，UI 和结果说明必须写明“静态 GIF”。
3. `M-03`：TIFF 仅单页 RGB/RGBA；不承诺 BigTIFF、CMYK、16-bit、ICC 或多页保真。
4. `M-04`、`M-05`：基础单尺寸 ICO 与 PCX/XBM/XPM，明确透明/调色板/输出尺寸限制。

**依赖：** 重新构建并最小化封装 ImageMagick coder/delegate；不能为了 TIFF/JXL/EXR 开放危险 delegate 或解除现有安全 policy。

### P3：中难度音频与文本

1. `M-06`：按容器逐项开放 AAC、AC3、AMR、AU、CAF、WMA、MP2、VOC、WavPack 输入；每项锁定 demuxer/decoder。
2. `M-07`：增加 ADTS AAC 与 ALAC-in-M4A 输出；界面显示 codec 与有损/无损语义。
3. `M-08`：CSV/TSV/DocBook/Org → TXT，固定 Pandoc 的 `csv`、`tsv`、`docbook`、`org` reader，仅导出可读取文本。
4. `M-09`：使用受控的 MuPDF 文本导出路径处理有文本层 PDF；无文本层的扫描 PDF 给出明确“未发现可提取文本”结果，不进入 OCR 路线。

**验收：** 验证音频时长、声道、codec、容器、取消和磁盘预算；文档验证 Unicode、资源拒绝和正文顺序。

### P4：HEIC / HEIF 输出

1. 分离“读取 HEIC/HEIF”与“编码 HEIC/HEIF”的能力记录。
2. 固定 libheif 及实际 encoder/plugin 闭包，逐平台验证有损、透明、方向、ICC、8/10-bit 与输出读回。
3. 公开 `.heic` 与 `.heif` 两个扩展名，但均固定为 HEVC、有损、8-bit SDR 的同一兼容档位（Q2=A）；不以扩展名掩盖 codec 差异。

**风险：** HEIF 容器、HEVC/AV1 编码器、平台插件与发布许可需一起审查。

### P5：静态 SVG 栅格化

1. 采用专用 SVG 渲染器，而不是让 ImageMagick 调用任意外部 delegate。
2. 固定静态 SVG 子集、尺寸上限和字体回退；禁止脚本、事件、动画、外链和同目录资源（Q3=A）。
3. 输出到既有安全位图格式；不实现编辑、脚本、交互或动画。

**风险：** SVG 的外部 URL、字体、图片和脚本不能破坏“本地处理”的安全边界。

### P6：JXL 与 EXR/HDR/DPX 专项包

1. JXL：固定 8-bit sRGB 输入/输出、libjxl/ImageMagick coder、质量参数、alpha、ICC 与读回测试（Q4=A）。
2. EXR/HDR/DPX：只作为受控导入，明确 HDR→SDR 色调映射；普通 PNG/JPEG 输出不允许伪称高动态范围保真（Q4=A）。
3. 分开提供基础导入/导出和专业保真路线，后者需要独立的色彩样本及长期维护。

**风险：** Linux 已改为从固定源码构建 JXL，且启用 OpenEXR；这只解决了构建依赖，不构成公开支持。六个最终包仍需新增依赖闭包、签名/公证与发行证据。

### P7：发布验收

1. 单元、集成和真实素材回归覆盖成功、伪装输入、损坏输入、取消、超时、磁盘不足、输出冲突和批量部分失败。
2. 各目标平台安装件离线运行，验证包内模块、动态库、许可材料、签名和安全 policy。
3. 只有通过的格式在对应平台 UI 中出现；报告列出缺失原因和退回条件。

## 已确认的产品决策

| 编号 | 决策                          | 已选方案                                                           |
| ---- | ----------------------------- | ------------------------------------------------------------------ |
| Q1   | 跨平台公开策略                | B：各平台只显示该最终安装包已验收的格式。                          |
| Q2   | HEIC/HEIF 输出编码档位        | A：`.heic` 与 `.heif` 均使用一个 HEVC、有损、8-bit SDR 兼容档位。  |
| Q3   | SVG 边界                      | A：仅静态、嵌入资源、无脚本/无外链，使用受控字体回退。             |
| Q4   | JXL、EXR/HDR/DPX 首版保真级别 | A：JXL 8-bit sRGB 输入/输出；EXR/HDR/DPX 仅导入并映射至 SDR 位图。 |

## 兼容性核查与公开门槛

| 路线            | 已核实的兼容性事实                                                                                                                                   | 首版处理与公开条件                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HEIC / HEIF     | HEIF 是容器；`.heic` 通常表示 HEVC，但同一容器可搭载不同编码。Windows 的 HEVC/AV1 codec 可能未安装；libheif 的编码器也可能是动态插件。               | 固定 HEVC、有损、8-bit SDR；只在该安装包随包 encoder、读回和目标系统打开测试通过后显示。必须单独完成 HEVC 编码器的许可证与安全更新审查。                                            |
| JXL             | JPEG XL 文件有标准化互操作性，但浏览器和系统预览器支持不均：Safari 已支持，Chromium、Firefox、Edge 的上游支持表仍列有开关或插件情况。                | 固定 8-bit sRGB；应用内用独立解码验收，不承诺文件管理器、浏览器或第三方应用可直接预览；界面提示兼容性边界。                                                                         |
| TIFF            | Classic TIFF 的偏移量限制为 4 GiB，BigTIFF 才使用 64-bit 偏移；TIFF 还可包含多页、多种压缩和非 RGB 色彩。                                            | 仅单页 RGB/RGBA 基线 TIFF；拒绝或降级报告 BigTIFF、多页、CMYK、16-bit 和 ICC 保真要求，不能把它们表述为完整 TIFF 兼容。                                                             |
| EXR / HDR / DPX | 这些输入可表达线性、高动态范围或高位深数据；常见 SDR 位图无法无损承载其曝光、色域或多通道信息。DPX 还可能使用 Log 传递特性及制作方定义的参考黑白点。 | EXR/HDR 只导入首图，采用固定曝光后输出 8-bit sRGB SDR。DPX 不套用该曝光，而按 ImageMagick 解码后的解释降为 8-bit sRGB SDR；不保留制作方 LUT、自定义参考黑白点、多元素或高位深保真。 |
| SVG             | resvg 明确只处理静态 SVG 子集，并不依赖系统图形库；其默认字符串资源解析器可访问文件，因此不能直接采用默认设置。                                      | 使用 in-process resvg，拒绝脚本、事件、动画、外链和相邻本地资源；仅 data URI 嵌入图像和随包字体回退，设置像素/输入大小上限。                                                        |
| AAC / ALAC      | ADTS 是单一 AAC 流容器；ALAC 需要放进 M4A/MP4 家族容器。不同设备和播放器对裸 `.aac`、`.m4a` 的偏好不同。                                             | 输出分别标记为 `AAC (ADTS, lossy)` 与 `ALAC (M4A, lossless)`，以 ffprobe 复读 codec/container；不以 `.alac` 作为独立容器扩展名。                                                    |
| PDF → TXT       | MuPDF 可抽取现有文本层，但不能把扫描图片中的文字自动变成文本。                                                                                       | 只导出文本层；无可提取字符时返回明确结果，不把空文件当作成功，也不静默进入 OCR。                                                                                                    |

所有上述路线都同时要求：包内依赖哈希校验、编码/解码真实样本验收、目标架构安装包离线运行，以及由安装包随附的已验收路线清单授权。引擎的 `-list format`、`-encoders` 或单个成功退出码都不是公开能力证据。

### 一手资料

- [Microsoft HEIF extension codec](https://learn.microsoft.com/en-us/windows/win32/wic/heif-codec)
- [libheif README and build notes](https://github.com/strukturag/libheif)
- [JPEG XL software support matrix](https://github.com/libjxl/libjxl/blob/main/doc/software_support.md)
- [libjxl release and security guidance](https://github.com/libjxl/libjxl)
- [LibTIFF BigTIFF design](https://libtiff.gitlab.io/libtiff/specification/bigtiff.html)
- [resvg static SVG support](https://github.com/linebender/resvg)
- [FFmpeg formats: ADTS and MOV/MP4](https://ffmpeg.org/ffmpeg-formats.html)

## 2026-09-14 发行兼容性复核

本次复核区分两件事：应用随包引擎是否能安全地生成并重新读取文件，以及操作系统或第三方软件是否能在应用外预览同一个文件。前者可由 Z8.Work 的目标包验收；后者不能由应用单独保证。

| 项目                | 核查结论                                                                                                                                                    | 已采取的处理                                                                                                                                                                                           | 仍需完成的发行验收                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux JXL 依赖      | Ubuntu 24.04 的 `libjxl-dev` 是 0.7.0；JPEG XL 上游要求尽快升级到 0.12 以获得多项安全修复。                                                                 | Linux 构建不再声明 `libjxl-dev`，改为下载固定的 v0.12.0 提交、校验 SHA-256，并以禁用工具/测试/下载依赖的 CMake 配置安装到 `/opt/z8-jxl`。ImageMagick 只从此路径发现 JXL，运行时 rpath 也固定到该目录。 | 在 x86_64 与 aarch64 最终包中检查动态库闭包、`pkg-config` 版本、JXL 写入后由独立 reader 读回；通过前不把 JXL 写入包内公开清单。                                  |
| HEIC / HEIF         | HEIF 是容器而非单一编码；Windows 的 WIC HEIF 功能以 Microsoft Store 扩展提供，HEVC 通常对应 `.heic`，AV1 通常对应 `.avif`。目标机器的系统预览能力可能缺失。 | 应用输出固定为 HEVC、有损、8-bit SDR；应用内读回不依赖系统预览。                                                                                                                                       | 每个平台实包中核对 libheif encoder/plugin 闭包、许可证和安全更新；分别测试应用内读回、系统文件管理器预览和至少一个独立查看器。系统预览失败不能被表述为转换失败。 |
| JXL 外部互操作      | JPEG XL 码流有标准和参考实现，但系统、浏览器、图像查看器的预览支持不统一。                                                                                  | 只承诺应用内使用随包库的读回；不承诺 Finder/Explorer、浏览器或聊天软件直接显示。                                                                                                                       | 安装包 UI 只在验收完成后显示 JXL；输出说明标注“部分软件可能需要额外支持”。                                                                                       |
| 静态 SVG            | resvg 是静态 SVG 渲染器，明确不实现脚本、事件和动画等网页行为。                                                                                             | 使用受限的 in-process resolver，只接受受控 data URI 图像与随包字体，拒绝外链、同目录文件和脚本。                                                                                                       | 在六个目标包上使用同一套 SVG 正反样本，验证不触网、不读本地关联文件且渲染一致。                                                                                  |
| TIFF、EXR、HDR、DPX | BigTIFF 使用 64-bit 偏移；专业图像还可能有多页、多通道、线性或 HDR 色彩数据。DPX 还可含 Log、YCbCr 或制作环境定义的显示转换。                               | TIFF 限单页 RGB/RGBA；EXR/HDR 固定曝光至 8-bit sRGB SDR；DPX 使用解码后的解释降为 8-bit sRGB SDR，不替代制作方 LUT。                                                                                   | 样本必须覆盖拒绝/降级提示；不得将 SDR 结果宣传为专业级保真或 HDR 往返转换。                                                                                      |
| AAC / ALAC          | FFmpeg 文档规定 ADTS 仅承载一个 AAC 流；ALAC 则需置于 M4A/MP4 家族容器。                                                                                    | 输出名称明确为 `AAC (ADTS, lossy)` 与 `ALAC (M4A, lossless)`，不使用伪造的 `.alac` 容器。                                                                                                              | 每平台以 ffprobe 校验 codec、容器、时长和声道；用独立播放器确认裸 AAC 与 M4A 的实际打开行为。                                                                    |
| Windows 桌面壳      | Windows GUI 还依赖 WebView2 Runtime；Microsoft 建议发行方检测运行时并按部署模式提供或引导安装。                                                             | 保持安装前/启动时的运行时探测，不把转换引擎可用误判为完整 GUI 可用。                                                                                                                                   | 在未安装、旧版和已安装 Evergreen Runtime 的 Windows 环境各做一次安装与启动验收。                                                                                 |

Linux 构建环境可能因 `libheif` 的传递依赖同时安装旧的 JXL 运行库；这本身不等于产品使用旧库。构建脚本要求 JXL 由 `/opt/z8-jxl/lib/pkgconfig` 提供、版本精确为 0.12.0，并在包内闭包检查中验证实际被装入的库。若任一检查失败，候选包必须失败，不能回退到系统库。

### 已完成的隔离构建验证

2026-09-14 在 Ubuntu 24.04 ARM64 容器中，以 `--network none`、仅只读挂载三个已校验源码归档的方式完成了以下检查：

1. JXL v0.12.0 能仅用系统 Highway 1.0.7、Brotli、LCMS2 编译和安装；`pkg-config --modversion libjxl` 返回 `0.12.0`，`pcfiledir` 为 `/opt/z8-jxl/lib/pkgconfig`，SONAME 为 `libjxl.so.0.12`。
2. 同一容器中的 ImageMagick 7.1.1-43 在受限能力集下完成补丁、配置、编译和安装，内建 delegates 包含 `jxl`、`tiff`、`openexr` 和 `heic`。
3. `coders/jxl.so` 的 ELF `NEEDED` 条目是 `libjxl.so.0.12`，动态解析路径为 `/opt/z8-jxl/lib/libjxl.so.0.12`。这验证了 Linux 的源码链实际生效，而非误用 Ubuntu 自带的 0.7 库。

该验证只覆盖 Linux ARM64 的引擎构建和链接，不替代安装件闭包、真实图片读回、Windows/macOS 构建及系统预览验收。因此 JXL、TIFF、EXR/HDR/DPX 仍留在未公开的包内能力档位中。

### 闭包复核修正

随后对即将封装的 ARM64 引擎目录做递归 ELF 依赖扫描，发现 `coders/jxl.so` 虽然直接指向 `libjxl.so.0.12`，后者还需要 `libjxl_cms.so.0.12`。构建脚本现将 `/opt/z8-jxl/lib` 显式纳入递归闭包，并在最终引擎目录中要求这两个 0.12 库都存在；不能再以构建机恰好装有该库作为成功依据。

同一次扫描还发现 Ubuntu 24.04 自带 FFmpeg 会间接加载 `libjxl.so.0.7`。这会令一个已固定图像 JXL 0.12 的包同时携带旧 ABI。Linux 配方因此改用已审阅的 FFmpeg 9.0.1 源码包（SHA-256 `cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635`，人工核验过其官方 PGP 签名），并显式关闭 JXL、网络、GPL 与 nonfree 组件。该 FFmpeg 仅提供本版所需的本地音频路径；最终目录还会拒绝任何 `libjxl*.so.0.7` 旧 ABI 库。ARM64 上还显式启用 Dav1d 软件 AV1 解码器，并以 ImageMagick 生成的 AVIF 做独立读回，避免意外选择不可用的硬件 AV1 路径。

这些修正已经通过独立构建与音频样本预检，但完整格式矩阵、最终 DEB 安装以及其余五个目标仍需分别验收，不能据此提前宣称跨平台公开支持。

- [FFmpeg 9.0.1 source release](https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz)
- [FFmpeg download and signature instructions](https://ffmpeg.org/download.html)
- [FFmpeg licensing guidance](https://ffmpeg.org/legal.html)

### 本次补充的一手资料

- [libjxl v0.12 security update notice](https://github.com/libjxl/libjxl)
- [Ubuntu 24.04 libjxl-dev package version](https://packages.ubuntu.com/noble/libjxl-dev)
- [Microsoft WIC HEIF codec documentation](https://learn.microsoft.com/en-us/windows/win32/wic/heif-codec)
- [Microsoft WebView2 distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)
- [resvg supported SVG subset](https://github.com/linebender/resvg)
- [LibTIFF BigTIFF design](https://libtiff.gitlab.io/libtiff/specification/bigtiff.html)

## 方案复核修正

1. P0 不新增平行格式登记表，直接扩展现有 `v1-scope.json` 和对应 Rust/TypeScript 契约，避免双来源漂移。
2. 开发主机没有 Pandoc 与 MuPDF，不把主机 PATH 的缺失或存在当作发行包能力；所有 reader 与文本导出在随包引擎中验证。
3. HEIC/HEIF 的扩展名、容器和实际 codec 分开表达；读取成功不自动等于可以编码或可在六个平台公开输出。
4. EXR/HDR/DPX 的线性色彩与多 part/multi-channel 数据不能按普通位图降级后称作保真转换。

### ICO / PNG32 安全策略复核（2026-09-15）

完整 ARM64 格式矩阵在第一个 ICO 写入路线发现了一个实际兼容性问题：应用以默认拒绝的 ImageMagick coder policy 运行，而 ImageMagick 在写入带 RGBA 数据的 ICO 时会调用内部 `PNG32` coder。官方格式文档将 `PNG32` 定义为 32-bit RGBA PNG，并明确说明它可用于写入 PNG 编码的 ICO。

已在最终随包 ARM64 引擎中用同一 policy 复现：原 policy 的 ICO 写入以 `NotAuthorized 'PNG32'` 失败；只在既有显式 coder 白名单中增加 `PNG32` 后，ICO 成功写入并由随包 ImageMagick 解码为 256 × 256。随后尝试写入 `PDF` 仍以 `NotAuthorized 'PDF'` 失败。delegate、filter、路径限制和默认拒绝规则均未放宽。

这项改动仅支持 ICO 所需的内部 PNG 子格式，不会向产品路由新增 PDF、网络 delegate 或任意 coder 能力。对应单元测试锁定默认拒绝、delegate/filter 禁止、无通配 write 权限和 `PNG32` 的最小例外；完整矩阵将在重新打包后复跑。

- [ImageMagick PNG format definitions](https://www.imagemagick.org/script/defines.php)
- [ImageMagick format list: ICO and PNG32](https://imagemagick.org/formats/)
- [ImageMagick security policy guidance](https://imagemagick.org/security-policy/)

### DPX SDR 映射与夹具复核（2026-09-15）

ARM64 完整矩阵随后在 `DPX → PNG` 的像素读回门禁发现全黑输出。以同一随包 ImageMagick 引擎复现后，根因是验证夹具：它把 PNG 像素乘以 4 后写入整数 DPX；该写入会将超范围样本静默写成全黑。未乘以 4 的 10-bit DPX 经随包引擎读回仍有四色，且转换为 PNG、EXR/HDR 的 SDR 输出也通过像素检查。因此产品 DPX 解码能力没有失效，夹具本身不应把无效 DPX 当作真实格式路线。

夹具现改为有效的 `TrueColor` 10-bit DPX。产品转换也把 DPX 从 EXR/HDR 的固定曝光分离：EXR/HDR 仍以固定曝光映射到 SDR；DPX 则仅按 ImageMagick 解码后的 DPX 解释转换为 8-bit sRGB SDR。DPX 可携带 Log 传递特性，而 ImageMagick 官方文档指出这类文件可能需要 LUT、gamma 与 reference-black/reference-white 参数；DPX 标准也不规定输入或输出显示设备特性。因此首版不猜测制作方的 LUT 或黑白点，明确不承诺专业级保真。完整矩阵会在重新打包后以该有效夹具复跑。

- [ImageMagick DPX / motion-picture documentation](https://imagemagick.org/motion-picture/)
- [SMPTE ST 268-1: DPX 2.0](https://pub.smpte.org/latest/st268-1/st0268-1-2014_stable2015.pdf)

### PBM/XBM 阈值夹具复核（2026-09-15）

DPX 路线通过后，完整矩阵在 PDF 第二页的 PBM 读回发现单一白色。复现证明这不是编码器丢失页面：该页原本是亮绿色背景配白色文字，而 PBM/XBM 的产品合同就是先转灰度、再以固定 50% 阈值转成 1-bit；两种颜色都落在阈值的白侧，得到单色是正确的有损结果。真实产品说明现明确写出 50% 阈值。

矩阵夹具的第二页改为深绿色背景配白色文字，使三页都跨越一位阈值并能验证编码器没有输出空白页。相同 ARM64 随包引擎已直接复现：三页 PBM 都有黑白两种像素。读回门禁没有放宽，仍会拒绝意外的一色输出。

### Org 文本语义复核（2026-09-15）

完整矩阵在 `org → TXT` 发现了看似缺失的下划线标识符。复现显示，随包 Pandoc 会按照 Org 语义把 `Z8_MATRIX_START` 解释为带下标的文本，输出为 `Z8_(MATRIXSTART)`；这不是文件丢失或排序错误。Org 官方文档也说明 `_` 可代表下标，并提供 `#+OPTIONS: ^:{}` 将下标语法限制为花括号形式；同一随包 Pandoc 已验证该选项能保留原样标识符。

因此矩阵改为真实 Org 输入夹具，显式声明 `#+OPTIONS: ^:{}`，而不是用 Markdown 生成 Org 再错误要求字面 round-trip。产品仍按 Org 标记语义提取纯文本；结果说明会提示下划线的行为，并告知需保留原样的标识符使用 Org 字面/代码标记或该选项。输入不会读取外部资源，图片、布局与格式不进入 TXT。

- [Pandoc User’s Guide: format extensions](https://pandoc.org/MANUAL.html)
- [Org Manual: subscripts and superscripts](https://orgmode.org/manual/Subscripts-and-Superscripts.html)

### Opus 采样率合同复核（2026-09-15）

在重新运行 ARM64 完整矩阵时，`AMR-NB (8 kHz) → Opus` 曾被校验器误报失败：随包 FFmpeg 生成的文件可以由随包 FFmpeg 完整解码，保留单声道，时长差为 0.0065 秒，但 Ogg Opus 读回报告为 48 kHz。用相同的随包引擎直接复验得到了相同结果。这不是任意采样率漂移：FFmpeg 的 `libopus` encoder 明确支持 8/12/16/24/48 kHz 输入，Opus 的标准时钟是 48 kHz，较低采样率数据需要按 48 kHz 时钟表示。

继续复核发现，VOC 的采样率字段会将写入时的 48 kHz 表示为 47,994 Hz；同一随包引擎将其转为 MP3 或 AAC 时会选最近的受支持 48 kHz。`ffmpeg -h encoder=libmp3lame` 与 `ffmpeg -h encoder=aac` 在最终引擎中分别列出 9 个和 13 个离散采样率；对 47,994、50,000、37,000、17,000、10,000、7,350、8,000、44,100、96,000 Hz 的直接转换均按最近可用值读回。该行为来自目标编码器限制，不是输入文件或输出解码失败。

转换层现在集中定义并执行该合同：目标为 Opus 时，读回必须报告 48 kHz；MP3 与 AAC（含 M4A）仅允许其目标编码器的最近受支持采样率；WAV、FLAC、Vorbis OGG、AIFF 和 ALAC 仍必须与输入采样率完全一致。完整矩阵复用同一个函数，避免产品行为和验收标准分叉。桌面端 Opus、MP3、M4A、AAC 的选项及结果说明会明确告知有损编码和可能的重采样；声道、时长、codec、容器和完整解码门禁仍然保持严格。

- [FFmpeg libopus encoder supported sample rates](https://ffmpeg.org/doxygen/trunk/libopusenc_8c_source.html)
- [FFmpeg libmp3lame encoder supported sample rates](https://ffmpeg.org/doxygen/trunk/libmp3lame_8c_source.html)
- [FFmpeg AAC encoder supported sample rates](https://ffmpeg.org/doxygen/trunk/aacenc_8c_source.html)
- [RFC 7587: Opus 48 kHz clock-rate rule](https://datatracker.ietf.org/doc/html/rfc7587)

本文件待确认后将补充各阶段的具体文件改动、测试矩阵、依赖版本、许可证清单和发布顺序。

## 2026-09-15 执行记录与当前交付门槛

本轮逐项开发过程、原始矩阵日志、已通过的源码门禁和后续执行顺序已整理为[格式扩展开发记录](FORMAT_EXPANSION_DEVELOPMENT_LOG.md)与[桌面开发记录与计划](DEVELOPMENT_RECORD.md)。

当前状态必须按以下边界理解：

- ICO 内部 PNG32、DPX 有效夹具与 SDR 语义、PBM/XBM 50% 阈值、Org 下划线语义、
  Opus/MP3/AAC 采样率合同，以及静态 Pandoc reader 夹具均已完成代码和本地复核。
- Linux ARM64 的 retry-4 至 retry-7 均未产生非空矩阵 JSON。retry-6 使用旧内嵌
  verifier；retry-7 已越过图片/PDF，暴露的是 Pandoc writer 型测试夹具问题，已
  改为静态真实输入。独立 HTML/HTM/ODT/EPUB reader 和资源隔离检查已通过。
- 下一步是当前 verifier 的 retry-8；通过后仍须重建最终候选，并从提取后的归档以
  内嵌 verifier 再跑完整矩阵。只有该报告成功后，才开始 ARM64 DEB 和跨平台候选验收。

原始 retry-4/retry-5 输出和 SHA-256 位于[ARM64 格式矩阵证据](evidence/format-matrix-20260915/)。

### Pandoc 文档夹具与 sandbox 复核（2026-09-15）

Linux ARM64 retry-7 在生成 DOCX 输入夹具时停止：随包 Pandoc writer 尝试读取
/usr/share/pandoc/data/docx/[Content_Types].xml。该命令属于测试输入生成，并非产品的
DOCX/ODT/EPUB 到 TXT 路线。Pandoc 的官方手册也说明某些 reader/writer 需要数据
文件，filesystem 数据与 sandbox 的组合需要特别处理。

不能因此关闭产品 sandbox、允许任意系统数据目录，或把 writer 成功作为 reader
支持证据。修正方式是将合成、确定性的 DOCX、ODT、EPUB 和文档扩展 HTML/ODT/EPUB
作为仓库夹具保存，明确来源文本、生成条件和 SHA-256。最终随包 Pandoc 以产品实际
参数读取它们：sandbox、显式 reader、随包 data-dir、纯文本输出。HTML/HTM/ODT/EPUB
的完整独立 reader、取消、损坏 archive 和外链隔离检查已通过；完整格式矩阵尚待
retry-8。

这一修正缩小了测试范围到产品实际公开的输入能力，同时保留原有文本顺序、Unicode、
表格、取消、来源不变和网络 0 检查。最终候选仍必须重新构建，使内嵌 verifier 与
审阅过的源文件一致，且从提取后的归档再次执行完整矩阵。

- [Pandoc User’s Guide: data directories and sandbox](https://pandoc.org/MANUAL.html)
