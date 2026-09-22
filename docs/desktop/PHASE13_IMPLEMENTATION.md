# Phase 13：MSIX 开发包生成与最终包检查

日期：2026-09-09。本轮完成 MSIX 布局、基础图标、打包、独立归档检查及 SDK 解包复核，并生成真实的未签名开发 MSIX。**这不是正式发布或安装通过记录**。Phase 12 的 Windows 实机、WebView2 GUI 和 Rosetta 日志测试缺项继续保留。

## 最终交付

本地文件：`.desktop-local/phase13/package-final/z8-work-development.msix`。

| 项目       | 结果                                                                            |
| ---------- | ------------------------------------------------------------------------------- |
| 文件大小   | 171,320,297 字节，约 163.4 MiB                                                  |
| SHA-256    | `6116490e6a00735064d32cbef7358a33c1aa520d2b41dcfbf1df3d150fda288d`              |
| 应用架构   | Windows x64                                                                     |
| 内容       | 29 个应用/引擎/清单/图标文件，另有 BlockMap 与 Content Types 两个容器元数据文件 |
| 块校验     | 8,129 个 SHA-256 数据块通过                                                     |
| SDK 解包   | 所有有效载荷的文件名、大小和 SHA-256 与布局一致                                 |
| 签名与安装 | 未签名、未安装；没有创建证书或修改系统信任                                      |
| 商店与许可 | `storeSubmissionAllowed: false`，`redistributionApproved: false`                |

[最终打包报告](evidence/phase13/report.json)、[独立归档检查](evidence/phase13/archive-check.json)、[布局与逐文件哈希](evidence/phase13/prepared.json)。早期 `package-draft` 为中间产物，不替代以上最终字节。

## 实现

- `desktop:msix:prepare`：从 Phase 12 的完整 Windows 验收目录读取输入，先校验其全部文件。只将 `candidate/` 下的应用和引擎、MSIX 清单及三张图标放入布局；外层 Node 工具、核心测试程序和测试监督程序不进入 MSIX。
- 原有引擎 schema 2 清单保持不变，因而保留其已经列出的 `engines/validation/bundle-check.exe`；这不是面向用户注册的新应用入口，也不增加 IPC 命令。主程序和引擎相邻，符合 Windows Tauri 资源目录布局。
- `desktop:msix:pack`：接受显式指定的 `makemsix` 或 Windows `makeappx` 路径，输出到新目录。执行布局复核、打包、独立 ZIP/BlockMap 检查、SDK 解包、逐文件对照，并在结束前再次核对源布局、准备回执、工具 EXE 和最终包字节。
- `scripts/desktop-msix-check.py`：使用 Python 标准库读取 ZIP，不解压或执行载荷；验证成员清单、文件大小/哈希和每个 64 KiB 数据块，拒绝额外成员、签名文件、重复/大小写冲突、路径穿越、特殊文件、加密、不支持的压缩及过大输入。它是独立内容检查，不取代完整 MSIX schema/安装验证。
- `desktop:msix:assets`：使用 Playwright 渲染已有 `static/brand/logo.svg`，生成 44×44、50×50、150×150 基础 PNG。继续使用现有像素 Z8 标志，没有引入新的图标库。只提供基础尺寸，不宣称已完成多 DPI、任务栏变体、PRI 本地化或 WACK 图像验收。
- Windows CI 新增 MSIX 单元测试入口与 Python 3.12 环境。本轮没有推送或触发远端 CI，实际 Windows MakeAppx 分支仍未执行。

打包进程工作目录是独立输出目录，避免错误输出污染只读候选；超时或中断会失败，不覆盖已有报告。`makemsix unpack -ss` 仅用于读取本轮明确未签名的开发包；没有使用跳过全部内容验证的选项。独立检查器还会拒绝被悄悄加入签名文件的包。

## 开发身份与运行边界

`packaging/desktop/windows/msix/development.json` 固定以下内部开发身份：

- Name：`Z8Work.Desktop.Dev`
- Publisher：`CN=Z8.Work Development`
- MSIX 版本：`1.0.0.0`
- 显示名：`Z8.Work Desktop Dev`
- 资源语言声明：`en-US`、`zh-CN`

这是自行选择的本地开发身份，**不是 Partner Center 分配的正式身份**。现有 `packaging/desktop/artifacts.json` 中的 Store identity/publisher 保持未配置。MSIX 开发版本与应用内部 `0.1.0` 是两个显式记录的版本，不据此推断将来的 Store 上传版本。

清单使用 `Windows.FullTrustApplication`，只声明 `runFullTrust`，不声明管理员权限、文件关联或额外文件系统能力。Windows.Desktop 的 MinVersion 和 MaxVersionTested 均保守设置为 `10.0.19041.0`；这是兼容性声明，字段名称不代表该系统已实测。

包不含 WebView2 Runtime，也没有安装 bootstrapper；MSIX 不会自动继承 Tauri NSIS/MSI 的运行时安装逻辑。GUI 首启仍需要实际可用的 WebView2。未签名文件不能被当作已可正常侧载的成品；后续测试签名应操作独立副本并保留原包哈希。

## 验证与 review

| 检查                                        | 结果与范围                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Node 22.22.2 / 24.18.0                      | 各 112 项通过                                                                          |
| Python 独立归档测试                         | 7 项通过，由上述 Node 测试中的一个入口调用；另保存单独运行日志                         |
| MSIX 清单                                   | SDK 在启用 XML schema 验证的打包流程中接受                                             |
| 图标                                        | 三个 PNG 尺寸通过，另检查了生成图像的像素风格                                          |
| 最终包内容                                  | ZIP CRC 读取、完整文件哈希、8,129 块哈希、SDK 解包对照均通过                           |
| ESLint / Prettier / actionlint              | 通过                                                                                   |
| 工作区输入回执                              | 273 个输入，打包前后未变                                                               |
| 应用/引擎二进制                             | 复用 Phase 12 已冻结字节；本轮没有修改 Rust 或前端转换逻辑，没有重报旧运行测试为新通过 |
| Windows MakeAppx、侧载、GUI、升级卸载、WACK | 未执行；缺原生 Windows 实机验收                                                        |

Review 修正：

1. **防止开发包被误用为 Store 包。** 配置验证要求固定开发身份、开发渠道和 `storeSubmissionAllowed: false`；修改为正式渠道或任意 Publisher 会被拒绝。
2. **XML 文本注入。** 显示名称与描述通过转义生成 XML；测试包含引号、尖括号、与号和非法控制字符。
3. **校验不能只依赖 ZIP CRC。** 测试重新生成 ZIP、保持其 CRC 自洽但修改载荷，独立 BlockMap 校验仍会拒绝；另覆盖多块、空文件、篡改块哈希、缺少块覆盖及额外文件。
4. **输入回执可能在组装期间变化。** 准备阶段现在保留起始 handoff 指纹，结束时复核，避免把新回执错误地关联到旧载荷。
5. **拒绝非普通成员。** ZIP 除符号链接外，也拒绝设备/FIFO 等特殊类型；不允许通过大小写、保留设备名或路径穿越混入成员。
6. **本机工具链兼容。** MSIX SDK 的默认 Linux 工具链硬编码 x86_64，本轮改用原生 ARM64 CMake 配置；Debian 13 ICU 76 与其 C++14 构建不兼容，按 SDK/Xerces 支持的选项关闭本轮不需要的 bundle 支持和 ICU，采用 iconv/in-memory 消息。仍启用单包打包与 XML schema 验证，没有通过关闭验证绕过错误。

当前未关闭的是 Windows 运行与发行验收，不把 SDK 接受清单、解包成功或生成 `.msix` 称为这些项目通过。Phase 12 的大量日志测试仍需 Windows 原生复核。

## 工具链来源与复现

Microsoft MSIX SDK 来源：`https://github.com/microsoft/msix-packaging`，commit `25a65f5c1690930813bcc10cdf1d59fa865f2bb1`。工具实际报告版本 `1.7.243`，本机生成 ARM64 ELF `makemsix` 及 `libmsix.so`，不是在 Wine 中执行 Windows 打包工具。版本、工具和共享库哈希、CMake 参数见[环境记录](evidence/phase13/environment.json)。

源码未手工修改；SDK 的 CMake 构建自动删除了其跟踪的 `lib/zlib/zconf.h`，使用生成配置。此工作树差异已记录，不能将构建后的树称为完全干净。SDK 源码、缓存和构建产物放在 `.desktop-local/phase13/`，没有随应用打包。

本机已有精确源码和 LLVM 19，构建工具的命令如下；使用新的 build 目录：

```bash
cmake -S .desktop-local/phase13/msix-sdk -B .desktop-local/msix-sdk-next -G Ninja \
  -DLINUX=ON -DMSIX_PACK=ON -DUSE_VALIDATION_PARSER=ON \
  -DMSIX_TESTS=OFF -DMSIX_SAMPLES=OFF -DSKIP_BUNDLES=ON \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=/usr/lib/llvm-19/bin/clang \
  -DCMAKE_CXX_COMPILER=/usr/lib/llvm-19/bin/clang++ \
  -DCMAKE_DISABLE_FIND_PACKAGE_ICU=TRUE -Dtranscoder=iconv -Dmessage-loader=inmemory
cmake --build .desktop-local/msix-sdk-next --target makemsix --parallel 4
```

准备与打包（Node 22+、Python 3.11+；均需新输出目录）：

```bash
bun run desktop:msix:prepare \
  --handoff .desktop-local/phase12/delivery \
  --output .desktop-local/msix-layout-next
bun run desktop:msix:pack \
  --prepared .desktop-local/msix-layout-next \
  --tool .desktop-local/phase13/sdk-build/bin/makemsix \
  --kind makemsix --output .desktop-local/msix-package-next
```

Windows 原生开发机可使用 `--kind makeappx --tool C:/实际SDK路径/makeappx.exe --python python`；工具通过参数数组调用 SDK 的 `pack /d /p` 与 `unpack /p /d`，不存在 `makeappx validate` 子命令。这个分支本轮只完成代码与 CI 语法 review，需要 Windows SDK 实测。

独立复核已有包：

```bash
python3 scripts/desktop-msix-check.py \
  --package .desktop-local/phase13/package-final/z8-work-development.msix \
  --prepared .desktop-local/phase13/package-final/prepared.json \
  --output .desktop-local/msix-independent-next.json
```

图标已归档，通常无需重生成；需要时运行 `CHROMIUM_PATH=/usr/bin/chromium bun run desktop:msix:assets`。修改任何载荷后，应重新准备、打包和验证，不复用旧包哈希。最终 MSIX 保留了 ZIP 时间等元数据，本轮记录精确字节，不声称重复构建必然得到相同哈希。

## 下一阶段与官方依据

下一步在原生 Windows x64 上使用独立测试副本完成签名/侧载、实际安装位置的引擎运行、WebView2 首启及文件授权，再做升级卸载与 WACK。正式身份、对应源码和依赖许可核对完成后，才进入 Store 提交流程。Snap strict 实机和 macOS 验收缺项也未因本轮打包而关闭。

核查日期：2026-09-09。

- [Microsoft MSIX SDK](https://github.com/microsoft/msix-packaging)：跨平台 pack/unpack、本机实际工具参数另经 `-?` 核对。
- [生成 MSIX 包组件](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)：本地开发身份与 Store 身份、Desktop 清单和权限的区别。
- [MakeAppx 命令](https://learn.microsoft.com/en-us/windows/msix/package/create-app-package-with-makeappx-tool)：打包、解包与 Windows SDK 路径。
- 本地 ImgConvert 的 `scripts/pack-windows-msix.mjs` 和 manifest 模板作为经验参照；本项目沿用自身包身份、引擎清单和像素资源，没有借用其发布/安装成功记录。
