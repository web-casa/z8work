# Phase 28：本地候选与重跑交接

日期：2026-09-09。以下均为开发验证产物，源码提交 `f4cfc0f`，core24 构建配方补充修复 `d1a9c54`、`b62fa70`，正式发行未批准。大体积程序、引擎、源码归档和安装包保留在 `.desktop-local/phase28`，只提交小型证据文件。报告里的旧 HEAD 表示收据捕获时的基线；`inputs-handoff.json` 记录最终代码提交的实际源文件摘要，不能仅凭 HEAD 将其视为 Phase 27 旧二进制。

## 最终字节

| 产物                        | 本地相对路径                                                                        | SHA-256                                                            | 已执行层级                                                |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Linux ARM64 本地包          | `.desktop-local/phase28/linux-reviewed/z8-work-0.1.0-linux-arm64-validation.tar.gz` | `77f70ee0fd8ad40528ce6120349e90d4a62ea3ee6d74fe2ab4990e0611290dbb` | 最终解包、完整转换/质量、同程序 GUI；没有安装验收         |
| Windows x64 当前开发 MSIX   | `.desktop-local/phase28/msix-reviewed/z8-work-development.msix`                     | `fa386cbdc3ac2c4cb75d72cb2cd5e0d569bfa510b32a1fa999741e6208311727` | 538 个载荷文件，8658 个 BlockMap 块及 SDK 解包逐文件复核  |
| Windows x64 合成低版本 MSIX | `.desktop-local/phase28/msix-synthetic-reviewed/z8-work-development.msix`           | `2d4209191779b8b126edf7c626fe42ac8704935ab3c2187c7dea718739a144f0` | 同身份较低包版本，最终字节检查；未签名或安装              |
| Linux AMD64 Snap            | `.desktop-local/phase28/snap-lcms-package/z8-work_0.1.0_amd64.snap`                 | `ada85b958559b0ff7b5d9caaca50a49beecb9ca7609e9a2cf3b6fbe9c0936edd` | 最终解包、架构/版本、应用与完整引擎清单、包装器和桌面入口 |
| macOS ARM64 `.app`          | 未生成                                                                              | 不适用                                                             | 无目标系统和真实引擎输入；只完成工具与静态测试            |

Linux GUI 应用摘要 `e970986cac25daf947a66a5bac031441a5736fc3ae93eb8759aa1b73458cb010`；引擎清单 `9bc5bcf84e4316819ac14001324d387d6616d85012c0b96bcf87aebdd1a5b4ce`。Snap 应用摘要 `d5cd2c16d71340ad8533e80c759430065d6d33235438aa0dc13f0f61ffc1e747`；引擎清单 `b4e505805ab368e23c58c747c8d731fb399352f7b99cc3bcb26a8e35be176fdf`。Windows 引擎清单 `e3307570c4bdd96b78861b4a5d093c162af86f25bbcff7d9e444ee6b426cd768`。

最终 Windows 包使用现有 Microsoft makemsix，工具 SHA-256 `4890d7d3e5257362f831695124665ff796eef83e1ea655390c910f1f2dae8710`；Snap 使用本地 Snapcraft 9.0.1。Windows 仍沿用受控 [引擎锁定](../../packaging/desktop/windows/engines.lock.json) 的输入归档。本轮未执行 Wine 或原生 Windows 转换，不将历史 Wine 结果绑定到当前二进制。

修复后的 Snap 引擎已在显式 AMD64 仿真 scratch 容器完成 84 条转换、20 项质量和 240 次预设校准，退出码为 0；引擎清单与最终 Snap 解包结果一致。原始结果和执行边界见 [AMD64 隔离证据](evidence/phase28/amd64-lcms-evidence.json)及[完整质量报告](evidence/phase28/amd64-lcms-quality.json)。这是仿真引擎验证，未执行 strict 安装、GUI 或 portal。

## 本机重跑入口

以下从仓库根目录运行；输出必须是不存在的新目录。`review-2` 仅为示例新输出名，重复执行应换名称。Bun、Cargo、Node 应按仓库锁定版本配置，临时目录指向有足够容量的位置。

```sh
export PATH=/home/ivmm/.nvm/versions/node/v24.18.0/bin:/home/ivmm/.cargo/bin:/home/ivmm/.bun/bin:$PATH
export TMPDIR="$PWD/.desktop-local/phase28/tmp"

bun run desktop:versions
bun run desktop:check
bun run desktop:test:ui
python3 desktop/tests/msix-archive.test.py

node scripts/desktop-candidate-linux.mjs \
  --binary .desktop-local/phase28/linux-reviewed/z8-work/usr/bin/z8-desktop \
  --engines .desktop-local/phase28/engines-reviewed \
  --output .desktop-local/phase28/linux-review-2

node scripts/desktop-bundle-isolated.mjs --sudo \
  --engines .desktop-local/phase28/engines-reviewed \
  --output .desktop-local/phase28/isolated-review-2

node scripts/desktop-msix-pack.mjs \
  --prepared .desktop-local/phase28/msix-prepared \
  --output .desktop-local/phase28/msix-review-2 \
  --tool .desktop-local/phase13/sdk-build/bin/makemsix --kind makemsix

node scripts/desktop-snap-check.mjs \
  --artifact .desktop-local/phase28/snap-lcms-package/z8-work_0.1.0_amd64.snap \
  --prepared .desktop-local/phase28/core24-input/.desktop-local/snap-prepared-lcms/prepared.json \
  --output .desktop-local/phase28/snap-review-2.json
```

以上会运行实际转换或解析本地包，但不安装到宿主系统。Linux 候选脚本会重新压缩，摘要可能与旧包不同，因此记录新报告，不覆盖旧验收证据。Windows 相同载荷重新打包也不预设压缩包逐字节确定。

应用构建仍使用既有 Tauri 配置和锁文件：

```sh
bun run desktop:build
cargo build --locked --release --manifest-path src-tauri/Cargo.toml \
  -p z8-desktop --no-default-features \
  --features packaged-engines,custom-protocol,gtk-dialog
cargo build --locked --release --manifest-path src-tauri/Cargo.toml \
  -p z8-native --features engine-validation --bin bundle-check
node scripts/desktop-notices.mjs --target aarch64-unknown-linux-gnu \
  --output .desktop-local/phase28/notices-review-2
```

这些构建命令自身不收集原生引擎。Linux 显式引擎组装仍用 `desktop-bundle-linux.mjs` 的 `--manifest`、`--magick-modules`、`--magick-config`、`--heif-plugins`、`--verifier` 和 `--extra-license-dir`；路径从所用原生构建记录获取，不在 PATH 中猜测引擎。

core24 在隔离源副本中采用已存在的 AMD64 builder 镜像 `sha256:b024a987052967755ed076d49592b4b1a6aa8aefbdfe6251517f25a59c3910f6`，在 ARM64 主机显式使用 `--platform linux/amd64 --network=none`；属于仿真构建。保留 [初始构建记录](evidence/phase28/core24-rebuild-phase28.sh)和[修复后的组装记录](evidence/phase28/core24-finish-phase28.sh)，其中 Git 操作仅发生在当时的独立 `/work` 副本，不能直接在共享主工作区执行。ImageMagick 安装前缀保存在 `.desktop-local/phase28/core24-input/.desktop-local/magick-prefix`；本轮使用历史源码构建缓存，未完成新机器零缓存重建证明。

core24 补充修复在上述 builder 基础上安装 `liblcms2-dev=2.14-2ubuntu0.1`，镜像为 `sha256:6722e45e00bf5525071dd4b98e4ba74e1c24612319f343f8495886d7b07b042e`。真实重建过程见 [LCMS 重建脚本](evidence/phase28/core24-rebuild-lcms-phase28.sh)，新前缀为 `.desktop-local/phase28/core24-input/.desktop-local/magick-prefix-lcms`。旧包 `snap-package/` 的完整质量检查失败，不能作为当前质量候选。

重新准备 core24 源副本时，先在构建主机执行 `bun run desktop:build`，同时复制 `desktop/dist` 与 `.desktop-local/frontend-modules.json`，并保留锁文件、所需前端包的 package.json/许可文件、平台筛选所需 Cargo registry 及当前完整源码。不能继续使用 Phase 8 历史记录中的极简源码子集；不要把宿主 ARM64 Rollup 可执行模块当作 AMD64 编译工具。当前标准脚本读取既有前端收据，不在容器内调用宿主 Vite/Rollup。

## macOS 接口与待提供输入

现有两个入口必须搭配真实 macOS 原生构建流程，不能把测试合成 Mach-O 文件用作产品资源：

```sh
node scripts/desktop-bundle-macos.mjs \
  --resources /absolute/prepared-native-resources \
  --manifest /absolute/development-engines.json \
  --record /absolute/native-build-record.json \
  --output /absolute/new-engine-bundle

node scripts/desktop-candidate-macos.mjs \
  --binary /absolute/release/z8-desktop \
  --engines /absolute/new-engine-bundle \
  --output /absolute/new-app-candidate
```

上面路径为待提供输入的说明，不是已存在产物。resources 包含五个引擎、动态库/delegates、Pandoc 数据、字体、配置、`licenses/` 与 `validation/bundle-check`；引擎 manifest 使用既有 schema 1 development 格式和真实路径/摘要。build record 要求 schema 1、os macos、arch aarch64、非空 sources 和 redistributionApproved false。引擎的重定位、签名必须在生成清单之前完成；组装器验证这些输入，不负责从 Homebrew 选择版本或自动生成来源。

原生 `.app` 工具校验包内全部 Mach-O 签名、组装后的清单与真实质量矩阵，最后仅对复制出的应用进行本地 ad-hoc 签名。实际引擎的最低系统版本、SDK/deployment target 兼容性仍需原生检查；不能仅凭 plist 中的版本字符串宣称支持对应最低系统。干净账户 GUI、对话框、替换版本仍归 R6。该签名不代表 Developer ID、公证或公开分发批准。

## 升级和后续执行

开发 MSIX identity 为 `Z8Work.Desktop.Dev`、publisher 为 `CN=Z8.Work Development`。当前包 `1.0.1.0` 和合成包 `1.0.0.0` 的应用均为 `0.1.0`。因此它只能作为“同身份、低包版本”的安装输入；设置、历史和旧数据迁移还需准备受控数据以及原生执行证据。不得称合成包为公开发行旧版。

[升级映射](evidence/phase28/upgrade-inputs/upgrade.json)仅记录输入生成；其中 `packagesBuilt: false` 描述该生成器本身没有构建任何安装包。实际单独生成的两份 MSIX 以各自 prepared/report 为准；低版本 Snap/macOS 仍未构建。

后续顺序：完成 macOS 原生引擎与候选、MuPDF ICC 重建和依赖/源码审查；补齐剩余升级输入；使用相应原生测试环境对确切包执行离线转换、GUI、权限、升级卸载和性能/故障验收。正式 Store 身份、Snap 注册与提交状态继续独立记录，不以本地候选替代。
