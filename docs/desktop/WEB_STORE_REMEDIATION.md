# 网页引擎桌面版：Microsoft Store 与 macOS 直发修复方案

更新：2026-09-21。源码基线 `28a19b3`，本轮修改尚未提交。范围是当前网页 WASM 引擎版，不继承旧 native 版的安装或发行证据。

**当前路线：VERT.SH 网页版、Microsoft Store、macOS Developer ID 官网直发。Mac App Store 已退出目标范围。当前仍不可正式提交 Microsoft Store，也不可发布新的 macOS 直发包。**

## 渠道决定

| 渠道                    | 状态         | 当前边界                                                                         |
| ----------------------- | ------------ | -------------------------------------------------------------------------------- |
| VERT.SH 网页版          | 既有产品渠道 | 浏览器直接运行同一套 WASM 转换能力；网页部署不等于桌面包验收                     |
| Microsoft Store         | 继续实施     | Partner Center 身份及首包版本已固定；源码交付、许可审批和 Windows 原生验收仍阻塞 |
| macOS Developer ID 直发 | 继续实施     | 使用 Developer ID 签名、公证和官网/GitHub 发行；最终新候选尚未构建验收           |
| Mac App Store           | 已撤销       | 删除 MAS 特性、配置生成器、测试及沙箱专用保存路径，不再索取 MAS 身份             |

撤销 MAS 后，macOS 恢复系统保存文件对话框、原子替换和 single-instance 插件。`store` 编译特性仅服务商店渠道行为，当前用于 Microsoft Store：关于页不显示直发下载入口，原生导航阻断项目 releases 下载路径，源码和支持链接仍可访问。

## Microsoft Store 身份

[microsoft-store.json](../../packaging/desktop-web/microsoft-store.json) 使用用户提供并确认的字段：

| 字段                   | 值                                        |
| ---------------------- | ----------------------------------------- |
| Identity Name          | `53660AlanM.Z8Work`                       |
| Publisher              | `CN=84AC3716-04E0-4D67-8951-0D3E51674CA0` |
| Publisher Display Name | `AlanM.`                                  |
| PFN                    | `53660AlanM.Z8Work_909n0052ampem`         |
| Store ID               | `9N0S7TK9K4L0`                            |
| 首次上传               | 用户确认从未上传；包版本 `1.0.0.0`        |

应用版本仍为 `0.2.0`，与四段 Store 包版本分开管理。首次上传后须把 `firstSubmission` 改为 `false`，记录 Partner Center 最高包版本，并使用更高版本；校验器拒绝未知状态、同版本和降版。

正式 Windows 构建配置是 [tauri.microsoft-store.json](../../packaging/desktop-web/tauri.microsoft-store.json)。MSIX 准备器只接受干净 payload 内的 `z8-desktop.exe` 与可选 `WebView2Loader.dll`，检查 PE 架构、资源、符号链接和篡改。MakeAppx 打包后还会独立解包并核对 BlockMap 与文件字节。工具始终保持 `storeSubmissionAllowed=false`，直到候选级验收另行完成。

## 来源与许可门禁

[engines.json](../../packaging/desktop-web/engines.json) schema 2 把技术来源分为四类：

- `verified-rebuilt`：固定源码和工具链重建，WASM 与随包文件逐字节相同。
- `verified-rebuilt-replacement`：应用改用固定源码重建的新产物；要求至少两次断网独立构建、运行验收和非确定性审阅，不宣称不同构建的字节相同。
- `verified-upstream`：项目字节与固定官方发布资产相同，并收集其固定源码、依赖和构建材料。
- `blocked`：不能证明历史字节来源，必须追溯或替换。

门禁会实际核对 WASM、源码归档和每个构建输入的 SHA-256；状态文字本身不能放行。技术来源通过后，还必须分别满足公开对应源码 URL 和分发许可审批。

| 引擎        | 技术来源                                                                            | 仍阻塞                                                                   |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| vert-wasm   | `verified-rebuilt`                                                                  | 已闭环：源码已发布（desktop-source-1）、许可已获所有者批准（2026-09-21） |
| FFmpeg      | `verified-rebuilt`，WASM 与 JS 全字节相同                                           | 已闭环；HEVC 编码探针仍单独记录超时                                      |
| MuPDF       | `verified-rebuilt`，WASM 与两个 JS 全字节相同                                       | 已闭环                                                                   |
| ImageMagick | `verified-upstream`，项目 WASM 与官方 `2026.824.1923` 资产相同；23 个固定依赖已收集 | 已闭环                                                                   |
| Pandoc      | `verified-rebuilt-replacement`，固定输入断网重建；两份独立产物均通过 DOCX 验收      | 已闭环；GHC/WASM 字节非确定性已单独记录                                  |

ImageMagick 选择官方上游校验符合 1A 风险分级：项目没有修改该 WASM，独立重建不是技术放行的必要条件。其依赖清单中包含 copyleft 或双许可组件，因此许可审批和源码交付仍是硬门禁。详见 [ImageMagick 上游验证](IMAGEMAGICK_UPSTREAM_VALIDATION.md)。

## 后续执行顺序

1. 确定对应源码的长期 HTTPS 发布位置，发布与最终二进制完全绑定的五套源码、补丁和构建说明。
2. 完成 GPL/AGPL/LGPL/CDDL 等组合的候选级分发审批，把所需许可文本和源码承诺写入包内与商店材料。
3. 在 Windows 生成确切 x64/ARM64 MSIX，完成签名侧载、干净安装、升级/卸载、WebView2 有无、离线转换、保存/退出和 WACK。
4. 在 Mac 生成 Developer ID 候选，完成签名、公证、Gatekeeper、干净安装、转换、保存、退出和升级验收。
5. 冻结候选哈希和截图/隐私/年龄/加密声明；上传或公开发布前再做最终审阅。

本轮没有生成正式安装件、签名、上传、提交审核或发布源码。
