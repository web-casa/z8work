# Phase 8：core24 AMD64 Snap 开发候选与 portal 文件选择

日期：2026-09-08。承接 [Phase 7](PHASE7_IMPLEMENTATION.md)，推进既有 P0 矩阵中的 Linux AMD64 Snap。桌面继续使用独立 Svelte/Tauri 入口和 Rust 管理的原生 CLI 引擎。

本轮交付范围是本地开发候选及检查工具。包声明 `strict`，等级保持 `devel`；应用仍使用原型身份 `work.z8.desktop.m0`、版本 `0.1.0`。本机 snapd 只提供 `partial` confinement，AMD64 由 ARM64 主机上的 Rosetta 执行，因此不能把容器转换或解包检查当作原生 AMD64 strict 安装验收。没有上传商店、签名、推送或公开发布。

## 实现

- [Ubuntu 24.04 构建环境](../../packaging/desktop/linux/Dockerfile.core24) 固定基础镜像摘要、Node 22.22.2 和 Rust 1.96.0；在 AMD64 Ubuntu 环境编译应用和 ImageMagick，使用该系统的 FFmpeg、ffprobe、Pandoc 与 MuPDF。没有将 Phase 5 的 Debian ARM64 引擎改标签当作 Snap 输入。
- [引擎构建脚本](../../packaging/desktop/linux/build-core24.sh) 校验 ImageMagick 原始归档和 Debian 补丁归档的固定 SHA-256，应用整个补丁序列。包含原始许可、Debian 版权、来源哈希及构建脚本。启用模块、HEIC、WebP、JPEG、PNG、XML，裁去不需要的 delegates。动态库、HEIF codec 插件、配置和 Pandoc 数据仍通过原有清单收集器随包携带。
- Tauri 增加互斥的 `gtk-dialog` / `linux-portal` feature。开发默认保留 GTK，Snap 使用 `--no-default-features --features packaged-engines,custom-protocol,linux-portal`。`--build-info` 增加 `fileDialog`，Snap 门禁必须是 `xdg-portal`。文件选择和输出目录选择传入真实主窗口作为父窗口。
- [Snap 配方](../../packaging/desktop/snap/snapcraft.yaml) 固定 core24、amd64、GNOME extension、home 和 removable-media。没有添加 network、个人目录白名单或后台服务权限；外接盘接口的实际连接及拒绝行为留给原生安装验收。
- `desktop:snap:prepare` 在 Ubuntu AMD64 环境检查应用架构、构建信息和完整引擎清单，复制到新目录并记录哈希。拒绝 Debian 引擎、GTK 对话框、路径越界和输入被复制期间修改。
- `desktop:snap:pack` 使用本机 Snapcraft **9.0.1** 的 `expand-extensions` 结果与该版本的官方运行脚本，组装运行时 `meta/snap.yaml`，由 `snap pack` 生成本地 SquashFS。验证工具版本和脚本来源，限制输入文件，记录运行脚本的原始及转换后哈希。
- 这里采用显式运行时组装，不声称跑过完整 Snapcraft SDK 构建生命周期。GNOME、Mesa 和主题使用 content providers，正式安装需单独验证它们的获取、连接和启动链。私有引擎目录不会被 SDK 的自动依赖裁剪改写。
- `desktop:snap:check` 解包最终文件，重新检查 AMD64 ELF、可执行位、应用哈希、全量引擎清单、元数据、启动链、桌面入口及像素图标。通过只生成完整性证据，安装、权限、升级、卸载与许可不会自动变为通过。
- CI 增加 portal feature 的 Linux 应用编译检查，为真实 SquashFS 测试安装依赖。补齐 Windows ICO 和 macOS ICNS，均从现有像素图标生成；没有改用另一套品牌图标。本轮没有触发远程 CI。

## 本地候选与验证

候选：`.desktop-local/phase8-snap/z8-work_0.1.0_amd64.snap`，**204,865,536 字节**（约 205 MB / 195 MiB）。

SHA-256：`ecca28eb011ab6121ec24281416ae195165f0bd70c2da3e757020f05f58484fa`。

| 检查                    | 结果                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Ubuntu AMD64 构建器转换 | 76 条路线通过；XMP、透明度、16 位 PNG、PDF 页序/取消/续转及音频参数检查通过                           |
| 最终 Snap 引擎隔离转换  | 76 条路线再次通过、退出码 0；scratch、断网、只读、UID 1000、2 GB 内存；AMD64 为模拟执行               |
| Snap 打包               | Snapcraft 9.0.1 展开、`snap pack --check-skeleton` 和实际打包成功                                     |
| 最终字节                | 解包检查通过；应用 ELF/权限/哈希、668 个引擎资源、桌面入口与启动辅助脚本通过                          |
| 最终包应用信息          | 从解包文件运行 `--build-info`，确认 x86_64、release、bundled、custom protocol、xdg-portal、无 updater |
| 桌面测试                | Node 24 与 Node 22 各 68 项通过                                                                       |
| 原生核心                | 47 项通过、1 项外部 fixture 测试按原设置忽略；GUI 与真实转换另行执行                                  |
| ARM64 portal GUI        | 输入/输出选择、持久队列、重载、单实例、取消/续转与路径权限检查通过；不代表 AMD64 strict GUI           |
| 网页及静态检查          | 180 项网页测试通过；桌面类型检查 0 错误/0 警告；构建、Clippy、ESLint 和改动脚本格式检查通过           |
| 商店材料门禁            | 页面一致性检查通过；提交状态仍为 blocked，未伪造原生候选验收或商店注册信息                            |

原生矩阵报告中的 `missing_pandoc_keeps_images: false` 表示 **bundled 模式未执行开发引擎缺失测试**（调用未传开发清单），不是一条失败后放行的转换。完整包的策略本就要求引擎清单完整；测试的执行范围在原始报告中保留。

最终包隔离结果见 [隔离条件与哈希](evidence/phase8/isolated.json) 和 [76 条转换报告](evidence/phase8/final-conversions.json)。最终候选哈希在测试后复核未变。候选汇总中的 conversion 仅代表该解包隔离测试，严格安装和实机验收仍是未执行。

证据：[构建与来源](evidence/phase8/build.json)、[候选完整性](evidence/phase8/candidate.json)、[打包记录](evidence/phase8/pack.json)、[构建器转换](evidence/phase8/builder-conversions.json)、[测试记录](evidence/phase8/tests.json)、[ARM64 GUI](evidence/phase8/portal-gui-arm64.json)。当前源代码包含此前各阶段的未提交修改，HEAD 本身不是本轮全部输入；应用工作区文件哈希与打包工具哈希分别保留。Phase 5 原始候选及引擎清单哈希复核未变。

## Review 与修复

| 严重性 | 发现                                                                 | 修复及验证范围                                                                                               |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 高     | 未按 Ubuntu/core24 构建的引擎可能通过普通 Linux 架构检查             | Snap 检查要求 Ubuntu 24.04 来源和 x86_64；拒绝 Debian 和错误 feature 的反向测试                              |
| 高     | 自编译 ImageMagick 缺 XML delegate，保留 XMP 时实际丢失元数据        | 真实转换测试复现，补 `libxml2-dev` 与 `--with-xml=yes`，保留原有元数据回归门禁                               |
| 中     | Ubuntu 的 libheif 插件位于 `libheif/plugins`，使用父目录会漏收编码器 | 依据实际 `dpkg -L` 修正路径，随最终引擎执行真实格式矩阵                                                      |
| 中     | 只检查哈希不能发现不可执行的应用或缺失的启动脚本                     | 检查应用与启动链可执行位、桌面文件、图标；实际 SquashFS 反向测试                                             |
| 中     | 构建容器中的清洁命令环境不读取全局 Git safe.directory                | 仅对源码记录命令传入当前目录的 `-c safe.directory`，不放宽全局 Git 配置                                      |
| 中     | portal 对话框未关联主窗口                                            | 使用已安装插件的 `set_parent` API；ARM64 GUI 重跑通过，不再出现 unhandled parent 警告                        |
| 中     | Linux 跨平台预检发现 Windows 图标文件缺失                            | 用现有 PNG 生成 ICO/ICNS。Windows 继续受本机缺 `llvm-rc` 限制，macOS 受 Apple SDK/编译器限制，两者均不记通过 |
| 低     | `${SNAP}` 图标路径被普通 desktop-file-validate 当作相对路径          | 验证固定模板后仅在临时副本展开路径，最终包字节不改变                                                         |

新测试包含实际 `mksquashfs` / `unsquashfs`，但使用合成 ELF 的测试只验证打包门禁，不代表应用可以运行。已有 Rust、网页及 GUI 测试分别记录，不互相替代。

## 复现方式

源码和大文件都留在本机 `.desktop-local/`。构建需单独准备一个不含 `.env` 的源码副本，包含 `src-tauri`（排除 target）、`scripts`、`packaging/desktop`、`desktop/dist`、`node_modules/yaml`、`LICENSE`，以及编译验证器需要的三个 fixture：`tests/fixtures/gradient-10bit.heic`、`tests/fixtures/cover.mp3`、`desktop/tests/fixtures/text.docx`。Git 元数据只读挂载，用于记录来源；不要直接让容器在主工作区生成 root 所有的构建文件。

```bash
bun run desktop:build
sudo docker build --platform linux/amd64 \
  -f packaging/desktop/linux/Dockerfile.core24 \
  -t z8-core24-builder:phase8-amd64 packaging/desktop/linux
```

在构建容器中，`Z8_MAGICK_SOURCE` 与 `Z8_MAGICK_PATCHES` 分别指向 Phase 7 收集的 `imagemagick_7.1.1.43+dfsg1.orig.tar.xz` 和 `imagemagick_7.1.1.43+dfsg1-1+deb13u7.debian.tar.xz`，`Z8_BUILD_OUTPUT` 指向不存在的绝对目录；运行 `sh packaging/desktop/linux/build-core24.sh`。脚本会构建并执行完整引擎验证，失败即停止。

随后在同一 Ubuntu AMD64 环境运行（以下 `/work` 为独立源码副本）：

```bash
node scripts/desktop-snap-prepare.mjs \
  --binary /work/build-reviewed/z8-desktop \
  --engines /work/engines-xml-final \
  --output /work/snap-prepared
```

以上两个路径对应本轮从构建失败中恢复后的输出。完整脚本一次成功时，应使用 `$Z8_BUILD_OUTPUT/z8-desktop` 和 `$Z8_BUILD_OUTPUT/engines`。恢复过程没有放宽 SHA-256 或转换断言。

宿主机使用安装的 Snapcraft 9.0.1 和 snapd 打包，输出目录必须新建：

```bash
bun run desktop:snap:pack \
  --prepared .desktop-local/phase8-input/snap-prepared \
  --output .desktop-local/phase8-snap \
  --snapcraft-root /snap/snapcraft/current
bun run desktop:snap:check \
  --artifact .desktop-local/phase8-snap/z8-work_0.1.0_amd64.snap \
  --prepared .desktop-local/phase8-input/snap-prepared/prepared.json \
  --output .desktop-local/phase8-snap/candidate.json
bun run desktop:test:ui
```

最终文件的隔离验证使用解包副本，不修改原候选：

```bash
unsquashfs -no-progress -processors 2 \
  -d .desktop-local/phase8-snap-extracted \
  .desktop-local/phase8-snap/z8-work_0.1.0_amd64.snap
sudo docker build --platform linux/amd64 --network=none \
  -f docs/desktop/evidence/phase8/Dockerfile.validation \
  -t z8-phase8-final-snap-validation:local \
  '.desktop-local/phase8-snap-extracted/usr/lib/Z8.Work Desktop Dev/engines'
timeout 1200 sudo docker run --rm --platform linux/amd64 \
  --network=none --read-only --user 1000:1000 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --pids-limit=128 --memory=2g --cpus=2 \
  --tmpfs /tmp:rw,nosuid,nodev,size=512m \
  z8-phase8-final-snap-validation:local
```

超时或非零退出均不通过；本轮退出码为 0。ARM64 主机需要配置 AMD64 模拟执行支持，这不是原生 AMD64 硬件测试。

## 后续验收

1. 在原生 AMD64、完整 AppArmor/seccomp 的 Ubuntu 机器安装确切候选，验证 GNOME/GPU content providers、离线首启、输入/输出 portal、home、隐藏路径与外接盘的允许/拒绝/取消及重启授权。
2. 从真实安装位置执行有限转换并确认退出；检查取消、主程序异常退出、升级和卸载，不复用 ARM64 GUI 或解包转换作为安装证明。
3. 为这份 Ubuntu 候选补精确源码、签名、Rust/前端及静态依赖闭包和逐项许可核对。Phase 7 的 Debian ARM64 材料只复用了固定 ImageMagick 源码输入，不能覆盖整套新包；APT 包版本目前通过来源清单记录，尚未冻结为可重现的归档仓库。
4. Windows MSIX 和 macOS 安装件仍需各自的原生构建及运行。正式商店身份、可提交候选与发布是后续独立验收项，`redistributionApproved` 保持 false。

## 官方依据

核对日期：2026-09-08。运行时字段以本机 Snapcraft 9.0.1 的实际展开结果为准，避免把新版扩展的额外字段推断进当前工具。

- [Snapcraft GNOME extension](https://ubuntu.com/docs/snapcraft/latest/reference/extensions/gnome-extension/)：core24 GNOME/GPU/主题运行环境。
- [Snap 格式](https://snapcraft.io/docs/reference/development/yaml-schemas/the-snap-format/)：运行时 `meta/snap.yaml` 与 `meta/gui` 的含义。
- [Snap 中的 XDG portals](https://snapcraft.io/docs/explanation/snap-development/xdg-desktop-portals/)：文件访问与沙箱授权的集成方向。
- [Tauri Snapcraft 分发](https://v2.tauri.app/distribute/snapcraft/) 与 [dialog 插件](https://v2.tauri.app/plugin/dialog/)：桌面打包和文件选择集成；feature 名称、`set_parent` 使用安装的插件源码核对。
