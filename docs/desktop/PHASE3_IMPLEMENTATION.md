# Phase 3 / M3：原生引擎分发与候选验收

日期：2026-09-08。承接 [Phase 2](PHASE2_IMPLEMENTATION.md)，按 [V1 方案](V1_PLAN.md) 推进 M3，并补 M0 遗留的引擎分发边界。

**本阶段实现了包内引擎加载、Linux 依赖组装、候选构建和验收检查。M3 尚未整体验收：Windows x64 MSIX、Linux amd64 strict Snap、macOS arm64 实机安装，以及可分发源码/许可审查仍未完成。** 本机 Linux ARM64 产物用于补充工程验证，不替代方案中的 P0 平台。

## 1. 实现范围

- `packaged-engines` 与 `development-engines` 编译特性互斥。候选程序从 Tauri 资源目录读取引擎，不读取 `Z8_DEV_ENGINE_MANIFEST`；没有引擎下载、PATH 查找或自更新代码。
- `--build-info` 在启动 WebView、队列和单实例服务之前返回有限 JSON，描述实际编译模式、版本、架构、资源目录名。打包检查拒绝调试构建、开发引擎、缺少 custom protocol 或目标不匹配的程序。
- schema 2 引擎清单只接受包内相对路径，校验 OS/架构、五个引擎、完整文件清单、长度与 SHA-256。拒绝路径穿越、符号链接、非普通文件、缺失和未登记资源；manifest 最大 2 MiB、最多 10,000 个资源、总量最多 8 GiB。
- 完整清单在加载和每项转换开始前校验；PDF 不在每一页重复校验全部资源。PDF 恢复指纹包含整个清单身份，替换库、模块或数据后不会复用旧配置的逐页输出。
- Linux 子进程使用随包 ELF loader 和 library path；ImageMagick 模块、libheif 插件、颜色配置、Pandoc 数据均有显式包内路径。转换任务仍使用私有目录中的安全 policy、环境清理和原有进程管理。
- Linux 组装器从明确提供且匹配开发清单哈希的可信二进制组装依赖，不下载软件。检查实际 ELF 架构、缺失依赖和同名不同内容的库；输出独立目录，拒绝覆盖已有候选。
- 记录系统包版本、来源文件、哈希、许可正文和未完成事项。`redistributionApproved` 明确为 `false`；许可正文和哈希并不等于已完成对应源码交付、签名或再分发审查。
- [产物矩阵](../../packaging/desktop/artifacts.json) 区分本机 tar.gz 验证、P0 Snap/MSIX/macOS 目标。Store 身份保留空值，不编造 Partner Center 数据。
- 打包脚本解开最终 tar.gz，再检查应用及引擎资源。验收检查必须绑定候选确切哈希，缺少安装、升级、卸载、许可及渠道必要证据时返回非零。
- [桌面 CI](../../.github/workflows/desktop.yml) 增加 bundle 测试、打包约束测试和三平台 packaged-app 编译检查。本轮未推送，远程 CI 未执行；这些检查不等于安装包验收。

## 2. Review 中发现并修复的问题

| 问题与触发条件                                        | 修复                                                                       | 验证方式                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| 仅复制 ImageMagick `.so`，空运行环境找不到格式模块    | 一并复制 libtool `.la`；清除构建机绝对 `libdir`，使用相邻模块              | 无基础镜像的真实转换测试；保留第一次失败原因  |
| HEIC/AVIF codec 使用运行时加载，`ldd magick` 不会列出 | 显式带入 libheif 插件及各插件依赖，设置包内插件目录                        | HEIC/AVIF 输入输出和独立解码矩阵              |
| Tauri 资源目录按产品名解析，组装器误用 Cargo 包名     | 从实际二进制读取 `resourceDirectoryName`，据此组装；不通过环境变量绕过问题 | 从最终归档的解压位置运行 GUI                  |
| 不同架构包或开发二进制可能被误标成候选                | ELF 头检查、编译信息检查和特性互斥                                         | 正向构建、反向单测和混合 feature 编译失败检查 |
| 旧结果/未运行项目可能被误当作新候选通过               | 验收报告绑定确切 archive SHA-256；未执行、缺报告均不放行                   | 旧哈希、缺 portal、未运行检查的反向测试       |
| 调试版验证器对完整依赖重复哈希，拖慢真实矩阵          | 有限转换验证器按 release 模式构建，与应用使用相同优化等级                  | 本轮最终独立验证器；早期慢任务取消，未记通过  |

单元检查覆盖损坏/新增/缺失资源、路径穿越、链接、错误平台、缺引擎、包构建模式和证据失配。它们不证明 OS 签名、并发篡改防御或所有发行版 ABI 兼容。

## 3. 复现入口

先完成 [M0 文档](M0_IMPLEMENTATION.md) 中开发工具与显式引擎清单准备。以下目录均为本机示例，新一次构建必须换一个不存在的输出目录。

```bash
# 1. 构建不会加载开发清单的独立验证器
cargo build --release --locked --manifest-path src-tauri/Cargo.toml \
  -p z8-native --features engine-validation --bin bundle-check

# 2. 从明确提供的可信引擎组装本机 Linux 包
bun run desktop:bundle:linux \
  --manifest "$PWD/.desktop-local/engines.json" \
  --output "$PWD/.desktop-local/new-engine-bundle" \
  --magick-modules /usr/lib/aarch64-linux-gnu/ImageMagick-7.1.1/modules-Q16/coders \
  --magick-config /etc/ImageMagick-7 \
  --heif-plugins /usr/lib/aarch64-linux-gnu/libheif/plugins \
  --extracted-root /tmp/z8-m0-deps/extracted \
  --verifier "$PWD/src-tauri/target/release/bundle-check"

# 3. 无网络、只读根文件系统、普通用户的空容器验证
# --sudo 仅适用于本机已有免密码 Docker 管理授权的环境
bun run desktop:bundle:isolated \
  --engines .desktop-local/new-engine-bundle \
  --output .desktop-local/new-isolated-evidence --sudo

# 4. 构建 release 图形界面；嵌入前端
bun run desktop:build
cargo build --release --locked --manifest-path src-tauri/Cargo.toml \
  -p z8-desktop --features packaged-engines,custom-protocol

# 5. 打包并重新解包核对最终文件
bun run desktop:candidate:linux \
  --binary src-tauri/target/release/z8-desktop \
  --engines .desktop-local/new-engine-bundle \
  --output .desktop-local/new-candidate
```

GUI 复用真实 GTK 文件选择器测试，通过 `Z8_GUI_BINARY` 指向最终 tar.gz 解压后的 `z8-work/usr/bin/z8-desktop`，运行 `bun run desktop:test:gui:phase3`。需要与 [Phase 2 GUI](PHASE2_IMPLEMENTATION.md) 相同的 Xvfb、DBus、xdotool 环境。开发清单仅供测试夹具生成；测试传给候选进程的是故意无效的开发清单路径，并断言五个引擎均为包内引擎。

验收检查是只读操作，例如：

```bash
bun run desktop:candidate:check \
  --artifact linux-arm64-validation \
  --file .desktop-local/new-candidate/z8-work-0.1.0-linux-arm64-validation.tar.gz \
  --evidence .desktop-local/new-candidate/candidate.json
```

刚组装的报告只有归档完整性通过，以上命令会因尚缺安装等证据失败。这是预期行为。报告中的引用仍须人工核对真实性；此命令不会检查数字签名，也不会发布文件。

## 4. 本轮结果

最终结果见 [构建与源码清单](evidence/phase3/build.json)、[候选验收报告](evidence/phase3/candidate.json)、[隔离转换](evidence/phase3/linux-arm64-conversion.json)、[GUI 报告](evidence/phase3/linux-arm64-gui.json) 和 [实际截图](evidence/phase3/linux-arm64-window.png)。

| 检查                                                    | 结果                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| 原生默认特性与独立验证器单测                            | 38 通过；1 个子进程夹具由监督测试调用                          |
| 原生 development-engines 单测                           | 37 通过；1 个子进程夹具由监督测试调用                          |
| 前端与打包约束测试                                      | 13 通过                                                        |
| desktop svelte-check、ESLint、Prettier、rustfmt、Clippy | 通过；类型检查 0 错误、0 警告                                  |
| release 应用与包内引擎                                  | 通过；最终 tar.gz 解包重新检查                                 |
| 隔离环境完整转换矩阵                                    | 76 条路线通过；scratch、无网络、只读根目录、UID 1000           |
| 最终归档解压后的原生 GUI                                | 通过；文件选择、AVIF 批量、PDF 部分取消/续转、单实例、受限 IPC |
| 移除测试副本                                            | 通过；8 个输出/历史文件哈希保持不变，不代表包管理器卸载        |
| 最终候选验收检查                                        | 正确拒绝：仍缺升级和许可审查证据                               |
| MSIX / strict Snap / macOS 实机安装                     | 未执行                                                         |

本轮最终本机候选：`.desktop-local/phase3-candidate-v4/z8-work-0.1.0-linux-arm64-validation.tar.gz`，189,877,164 字节（约 181.1 MiB）。SHA-256：

```text
499a4140afa89af4a4f98d1140d6ef30a5c6430305458aa2d51579e5330454c2
```

668 个引擎资源约 480.2 MiB，包括 ELF loader、库、模块、数据、许可和独立验证器。测试使用的解压副本已按卸载检查移除；候选归档和 `phase3-candidate-v4/z8-work/` 中的相同构建仍保留。应用身份暂用原型 `work.z8.desktop.m0`，未改为 Store 身份。最终源码有未提交改动，不能仅凭 HEAD 复现，需以构建证据中的源码哈希为准。

隔离报告中的 `missing_pandoc_keeps_images: false` 表示本次不运行开发模式的缺引擎降级分支；包内模式要求五个引擎完整。开发模式降级由原生单测及前阶段测试覆盖，不能把该字段当作本次降级验收通过。

本机环境为 Debian 13 ARM64、GTK 3.24、WebKitGTK 4.1。引擎包带有自己的 Linux loader 和运行库；**图形界面仍依赖系统 GTK/WebKit，tar.gz 不是全桌面运行时自包含包，也不是 Snap/MSIX。** 压缩包体积较大，FFmpeg 引入的依赖裁剪与完整许可证/对应源码整理是后续工作。

## 5. M3 剩余验收与边界

1. **P0 Linux amd64 strict Snap**：本机 `snap debug confinement` 返回 `partial`，不能提供 strict 通过证据。原生 amd64 runner 上以 core24/受支持 GNOME 扩展构建图形界面，再验证真实 portal、home/外接盘、拒绝/取消、重启授权、更新回滚及卸载。Debian 13 构建不能直接冒充 Ubuntu core24 ABI 验证。
2. **Windows x64 MSIX**：仍需实际包身份/Publisher、Windows SDK 打包/解包、全套 exe/DLL 与 WebView2 验证、临时签名副本侧载、WACK、升级卸载。已编写跨平台后端和编译检查，不代表已产出 MSIX。
3. **macOS arm64**：仍需原生引擎构建、Mach-O 依赖、`.app` 实际运行、签名/公证按分发路线验收。Mac App Store 未纳入本版范围。
4. **可再分发来源**：当前组装来自明确指定的系统/提取包，保留清单和许可正文，但完整对应源码、补丁、构建方法和全部许可组合未审核通过。不要把本机候选上传到发布页或商店。
5. **现有边界继续有效**：没有完整 OS 转换沙箱、主进程异常终止的子进程兜底或全部文件系统竞态防护。完整性校验不等于发布者身份认证；校验后到加载期间的并发替换需要安装目录权限与平台签名共同处理。

## 6. 本轮官方资料核对

- [Tauri 附加资源和资源目录](https://v2.tauri.app/develop/resources/)：同时核对锁定版本本地 `tauri-utils` / `tauri-codegen` 实现，资源目录来自实际产品名。
- [Snapcraft GNOME 扩展](https://documentation.ubuntu.com/snapcraft/latest/reference/extensions/gnome-extension/)：文档列出 core22/core24；具体构建与安装仍须对应 runner 实测。
- [MakeAppx 官方接口](https://learn.microsoft.com/en-us/windows/win32/appxpkg/make-appx-package--makeappx-exe-)：沿用此前核查的 pack/unpack 路线，未添加不存在的 validate 命令或伪造 Store 身份。
