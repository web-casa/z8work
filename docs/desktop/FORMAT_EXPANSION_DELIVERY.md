# 格式扩展后的跨平台预览包交付

日期：2026-09-14。承接 [Phase 3B 音频扩展](FORMAT_EXPANSION_PHASE3B.md)，本轮将已经通过源码与引擎验收的能力落实到新完整包，并完成 Mac 签名、公证及最终字节核对。没有新增转换格式，也不创建公开 Release 或商店提交。

## 范围与来源

当前共享范围为 29 个输入扩展名、15 个输出格式、167 条转换路线。音频、静态图片及文档语义沿用前阶段记录；RTF 继续暂缓。安装旧包不会自动获得新增能力。

| 平台                | 预期交付物                                | 应用源码                      | 运行                                                                       |
| ------------------- | ----------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| Linux AMD64 / ARM64 | 双架构 deb；AMD64 另有 Snap 开发包        | `39e660c`                     | [34769213214](https://github.com/web-casa/z8work/actions/runs/34769213214) |
| Windows AMD64       | 完整 ZIP、开发 MSIX、独立验收交接包       | `cb639ba`                     | [34769462749](https://github.com/web-casa/z8work/actions/runs/34769462749) |
| Windows ARM64       | 完整 ZIP、开发 MSIX                       | `39e660c`                     | [34769218259](https://github.com/web-casa/z8work/actions/runs/34769218259) |
| macOS AMD64 / ARM64 | Developer ID 签名、公证与 staple 后的 DMG | `3984230`；签名工具 `39e660c` | [34769210630](https://github.com/web-casa/z8work/actions/runs/34769210630) |

Mac 复用前轮运行 `34766937495` 的精确 DMG，签名前先检查固定 SHA-256；不重建已经验收的原件。ARM64 最低 macOS 15.7.5，AMD64 最低 15.0。签名改变引擎字节后刷新内部清单，再执行完整质量检查；公证和 staple 后重新计算最终 DMG 哈希。

## Review 与修正

1. **Windows 独立交接包缺失三个校验依赖。** 复制清单漏掉了 `desktop-image-expansion.mjs`、`desktop-document-expansion.mjs`、`desktop-audio-expansion.mjs`。仓库内执行能找到这些模块，但脱离仓库的交接包会报 `ERR_MODULE_NOT_FOUND`。已将支持文件清单统一到组装器与交接验证器；缺少必需文件时，即便清单和磁盘互相吻合也拒绝验收。
2. **CI 原先从仓库加载验收脚本，会掩盖上述遗漏。** Windows AMD64 CI 改为直接执行交接包里的 CLI。新增测试把真实支持文件复制到仓库外的临时目录，确认 CLI 能加载并到达参数检查，再分别删除三个模块验证失败。测试不启动 Windows 二进制，不冒充原生转换验收。
3. **交接说明仍写旧的 84 条路线。** 改为当前完整质量矩阵，避免格式数再次变化后文案失真。实际检查仍由严格的质量报告校验器决定，不依赖 README。

初始 Windows AMD64 运行 [34769215736](https://github.com/web-casa/z8work/actions/runs/34769215736) 因上述 review 修正主动取消，不计作构建失败或通过；修正后从新提交完整重建。Linux、Windows ARM64 和 Mac 不使用这个交接组装器，保持原任务继续执行。

Intel Mac 首次签名任务在完整质量检查通过后，创建 DMG 时收到 `hdiutil: create failed - Resource busy`。当时尚未生成 DMG 或提交公证；保留原始失败日志及已完成的质量报告，只对失败分支发起一次相同来源的重试。ARM64 成功结果保持原样，不重复提交公证。第二次任务已通过签名后的完整质量检查、DMG 创建、公证、staple 和 Gatekeeper 检查。该错误的文件占用根因尚未确认，不能称为已修复的应用缺陷；原始失败记录继续保留。

Mac 原始已验收候选的许可资源也按最终应用清单检查：ARM64 803 项、AMD64 800 项，均在 UI 的 1024 项 / 单项 2 MiB 限制内。这只是可读取性检查，不替代许可内容与源码交付审查。

本地 201 项脚本测试通过；修改文件的 ESLint、Prettier 和 Windows 工作流 actionlint 通过。没有修改转换算法，因此不重复运行上一阶段的整套本地 Rust 转换矩阵；本轮远端已对每个平台的新包执行并通过完整 167 条路线和质量门禁。

## 验收与下载

已完成的最终文件已下载并复核 SHA-256，平台质量报告经当前校验器复核；六个平台均已完成本轮验收，最终文件的哈希和下载入口见下表。

| 平台          | 下载入口                                                                                               | 当前结果                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Windows AMD64 | [ZIP + 开发 MSIX](https://github.com/web-casa/z8work/actions/runs/34769462749/artifacts/10321249545)   | 原生生命周期、167 条路线、MSIX 打包/解包及最终文件哈希通过                                  |
| Windows ARM64 | [ZIP + 开发 MSIX](https://github.com/web-casa/z8work/actions/runs/34769218259/artifacts/10321658238)   | 原生主机 167 条路线、混合架构依赖、MSIX 打包/解包及最终文件哈希通过                         |
| Linux AMD64   | [deb + Snap 开发包](https://github.com/web-casa/z8work/actions/runs/34769213214/artifacts/10322335442) | 候选 167 条路线与 deb 文件一致性通过；Snap 只完成包完整性，未执行安装后转换/strict 权限验收 |
| Linux ARM64   | [deb](https://github.com/web-casa/z8work/actions/runs/34769213214/artifacts/10321623622)               | 候选 167 条路线、deb 文件一致性及最终哈希通过；隔离容器安装、普通用户新增音频转换与卸载通过 |
| macOS AMD64   | [signed DMG](https://github.com/web-casa/z8work/actions/runs/34769210630/artifacts/10322525821)        | 第二次任务的 167 条路线、Developer ID、公证 Accepted、staple 与 Gatekeeper 通过             |
| macOS ARM64   | [signed DMG](https://github.com/web-casa/z8work/actions/runs/34769210630/artifacts/10321697366)        | 167 条路线、Developer ID、公证 Accepted、staple 与 Gatekeeper 通过                          |

证据目录：[format-delivery-20260914](evidence/format-delivery-20260914/)。Windows 构建收据记录实际 CRLF 检出字节；对五个相关校验输入按同样的 CRLF 检出形式与精确 Git 提交核对，全部匹配。安装包及原始报告的哈希一律按原始字节检查，不转换换行。

后续能力验收输入已将六个平台全部更新为本轮最终包的运行编号、文件名和 SHA-256；Mac 使用 staple 后的 signed DMG，不能沿用签名前或提交 Apple 时的摘要。相同名称的 Mac Intel 报告存在两个 attempt，最终证据明确固定第二次报告 artifact `10322565545`，首次失败材料另存。

下载使用运行页面的 Artifacts，不要选择 `application-only` 作为转换器。最终下载包目前保留 14 天，Windows 中间交接包保留 7 天；不是永久 Release 下载链接。所有哈希均针对最终文件；签名身份与来源另外核对，SHA-256 本身不提供发布者身份保证。

### Linux ARM64 安装补充验收

在固定镜像 `ubuntu@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517` 的独立原生 ARM64 容器中，安装本轮精确哈希 deb 及其声明的系统依赖，核对已安装主程序哈希，再以普通用户执行随包 `--audio-expansion`。34 条新增路线、10 项边界及控制检查通过。随后卸载包，确认主程序、引擎、菜单项、图标移除，包外的用户自建文件保留；容器退出后已自动清理。

此项覆盖 deb 安装/卸载和已安装引擎的普通用户执行，不覆盖 GUI、文件对话框或旧版本升级，也不代表其他发行版、AMD64 或 Snap 已做同样验收。脚本、输出和固定镜像信息见 [安装证据](evidence/format-delivery-20260914/linux-arm64/installed-container/)。宿主机仅挂载待测包（只读）、检查脚本（只读）和专用证据目录，没有安装或卸载宿主机应用。

### 体验方式

- Windows：下载匹配架构的完整 ZIP，完整解压到新目录，再运行 `z8-desktop.exe`，保留同目录下的 `engines`。需要已安装 WebView2；开发 MSIX 不是免签名直接安装的替代品。
- Linux：下载匹配架构的 deb，在兼容的 Ubuntu 24.04 桌面环境使用 `sudo apt install --reinstall ./文件名.deb`；这是用户选择执行的安装步骤，本轮脚本没有在用户主机执行。仍沿用 `0.1.0~preview1`，所以显式重新安装并核对本轮哈希，不以相同版本字符串判断内容相同。
- Mac：下载匹配架构的 signed DMG；签名、公证和哈希通过后才列为本轮交付件，ARM64 与 Intel 分别遵循上表最低系统版本。实际拖入 Applications、替换旧副本和窗口交互仍由用户选择体验。

这些包没有自动更新器。开发版本号与历史预览包相同，运行编号、源码提交和最终哈希共同标识本次候选；正式升级渠道需要另行冻结版本并验证升级路径。

## 仍未覆盖的范围

- Windows MSIX 使用开发身份，不可提交 Microsoft Store；未执行新包的侧载、升级或 WACK 验收。ARM64 应用和 ImageMagick 为原生 ARM64，其余四个引擎仍使用 Windows 11 x64 模拟。
- Linux deb 的依赖来自匹配架构的 Ubuntu 24.04 构建环境。Snap 打包与文件校验不代表已通过安装后的 strict 权限、portal 和桌面会话验收；本轮不增加 ARM64 Snap 或 AppImage。
- Mac 的签名、公证、Gatekeeper 与真实 GUI、文件授权、安装升级验收分别记录。即使公证通过，也不表示 Mac App Store 审核通过。
- 既有完整源码交付、许可审查、商店资料及原生 GUI 验收缺项继续保留，不因构建通过而改成已完成。

Apple 流程于 2026-09-14 复核：[Developer ID](https://developer.apple.com/developer-id/)、[公证与 staple 工作流](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)。使用现有组织 Secrets 和临时钥匙串；报告不包含证书私钥、账号密码或 app-specific password。
