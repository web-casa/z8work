# MuPDF 源码重建与验收：2026-09-21

MuPDF 1.28.1 的 WASM、JavaScript 主包装层和加载器已从固定源码重建，三个文件均与当前 npm 文件逐字节相同。没有替换应用文件，没有签名、上传或提交商店。

| 文件              | SHA-256（原件与重建件相同）                                        |
| ----------------- | ------------------------------------------------------------------ |
| `mupdf-wasm.wasm` | `5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7` |
| `mupdf.js`        | `5d237eadcb9640584e0050f6f958e547887b7a54d80a04043e12be9420931076` |
| `mupdf-wasm.js`   | `25382abbfbf5c52191e5ac59e1412a0da88647fecfab0c1d797bb5948443eea4` |

## 构建输入

MuPDF 提交为 `20061bd45183f5a2bff8f43675e4da91e5ac2901`，包含递归子模块的 20 个源码树、11,368 个 Git blob。Emscripten 4.0.8 提交为 `70404efec4458b60b953bc8f1529f2fa112cdfd1`，连同测试子模块另有 4 个源码树、12,717 个 Git blob。

构建沿用固定源码的 `platform/wasm/tools/build.sh` 参数：`BUILD=small`，原始 DEFINES/FEATURES，链接 `-Os -g2`。本机 Linux ARM64 通过 amd64 Docker 镜像编译。镜像固定为 `emscripten/emsdk@sha256:92c97951b9a6835cb5da9592e9d95226f67e09ecd01a541d817a5b4801f235a4`，容器断网、4 核上限、6 GiB 内存，make 使用两个任务。

生成脚本只增加失败退出、使用已安装的固定 SDK、限制并行数，并把 JavaScript 工具步骤拆出固定版本。首次完成 WASM 后，使用相同对象缓存再次链接并运行上游类型声明生成步骤；两次容器均正常退出。SDK 缺少 `pkg-config` 的提示保留在日志中；实际使用随源码提供的依赖，最终文件完整一致。

JavaScript 工具固定为 TypeScript 5.9.3、Terser 5.51.2、`@types/node` 22.20.1；[工具锁文件](../../packaging/desktop-web/mupdf-tools/package-lock.json)包含 npm 完整性值。先试用 Terser 5.39.2 时压缩字节不同；5.51.2 重建一致。这证明此组输入能够重建相同文件，不推断发布者当时的确切工具安装记录。

SDK 检查中有 4,051 个 Emscripten 文件与 Git 源码完全相同；25 个维护脚本/格式配置未随 SDK 打包，版本文件从 `4.0.8-git` 规范化为 `"4.0.8"`。原始差异及逐项核对结果均保留。LLVM/优化器使用固定镜像内二进制，本轮未从源码重建整个编译工具链。

## 验收

| 检查                                   | 结果   | 范围                                                                                       |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| WASM 与两个 JS 的完整字节对照          | 通过   | 三个摘要相同，WASM 导入/导出一致                                                           |
| 原版与全套重建文件的 PDF 回归          | 通过   | 各 38 项；23 种输出格式、多页顺序与颜色、旋转裁剪、质量和图标尺寸、异常文件拒绝后恢复      |
| 离线浏览器转换/下载                    | 通过   | 7 个流程，含彩色 PDF、旋转裁剪 JPEG、多页 PNG ZIP；真实加载重建 WASM，验证像素、尺寸和页序 |
| 应用测试                               | 通过   | 198 项，包含上述 PDF 回归                                                                  |
| 源码工具测试                           | 通过   | 21 项，包含新增 6 项 MuPDF 上下文保护测试                                                  |
| 源码归档解包复验                       | 通过   | 24 个源码树、24,085 个 Git blob                                                            |
| 格式、ESLint、工作流语法               | 通过   | 本轮新增及修改的工具                                                                       |
| Windows/macOS 最终安装包及原生权限验收 | 未执行 | 本轮为引擎构建及网页验收                                                                   |
| 对外源码交付与分发许可审查             | 未执行 | 归档仍在本地，不能据此批准发行                                                             |

浏览器转换为真实 Worker/WASM 执行；许可证和渠道入口检查使用 shell stub，不能当作原生壳或商店包验收。浏览器使用应用内 JS 包装层，其字节已与重建件证明相同；核心 PDF 回归另在隔离目录实际加载全套重建 JS/WASM。

初次 Python `tarfile` 的 `data` 解包过滤器把一个符号链接目标 `../../core/` 改为 `../../core`，导致严格 Git 字节复验失败。归档内部保留原始目标；改用 GNU tar 解开自行生成的归档后复验通过。失败报告保留，不计入通过次数。

## 复建入口

[构建锁](../../packaging/desktop-web/mupdf-source-build.json)、[上下文生成器](../../scripts/desktop-web-mupdf-context.py)、[JS 重建工具](../../scripts/desktop-web-mupdf-js.mjs)、[对照工具](../../scripts/desktop-web-mupdf-compare.mjs)和[手动工作流](../../.github/workflows/desktop-web-mupdf-source.yml)已加入工作区。工作流收集核验源码、断网编译、全字节对照及离线浏览器验收，只生成 artifact；本轮没有推送或触发。

WASM 和声明生成完成后，JS 重建及对照命令如下；前置的源码收集和容器命令见工作流。

```sh
npm ci --ignore-scripts --no-audit --no-fund --prefix packaging/desktop-web/mupdf-tools
node scripts/desktop-web-mupdf-js.mjs \
  --source /absolute/build-context/source/platform/wasm \
  --tools packaging/desktop-web/mupdf-tools --output /absolute/new-rebuilt
node scripts/desktop-web-mupdf-compare.mjs \
  --wasm /absolute/new-rebuilt/mupdf-wasm.wasm \
  --wrapper-dir /absolute/new-rebuilt --output /absolute/new-comparison
node scripts/desktop-web-browser.mjs --mupdf-wasm /absolute/new-rebuilt/mupdf-wasm.wasm
```

比较/浏览器测试需要项目依赖、已构建的 `desktop/dist` 和浏览器运行环境。SDK 镜像及 npm 工具先下载，编译容器本身断网。

## 来源证据与发行状态

[证据目录](evidence/mupdf-rebuild-20260921)保存来源绑定、归档摘要、解包复验、构建日志、JS 工具记录、完整对照与测试结果。大归档在 `.desktop-local/store-source-phase5/mupdf-corresponding-source.tar.gz`，不会随 Git checkout 自动提供，尚未公开分发。

目前 vert-wasm、FFmpeg、MuPDF 已有完整 WASM 重建证据；FFmpeg 和 MuPDF 另有 JS 字节对应证据。ImageMagick 已按官方未修改发布资产完成上游验证；Pandoc 已换成固定输入、断网重建并通过运行验收的新产物，其 GHC/WASM 独立构建仍有已记录的字节非确定性，详见 [Pandoc 重建验收](PANDOC_REBUILD_VALIDATION.md)。各引擎的公开源码交付、分发许可审查及 Windows MSIX/macOS Developer ID 最终包验收仍未完成，发行门禁继续阻止提交。Microsoft Store 首包保持用户确认的 `1.0.0.0`。
