# Phase 6：原生引擎来源、源码材料与 review

日期：2026-09-08。承接 [Phase 5](PHASE5_IMPLEMENTATION.md)，本轮补 M3 的引擎依赖与源码材料准备。**工具开发、来源核对和本地 review 已完成；源码交付仍有缺项，M3/M4 发行验收未完成。**

## 实现

- [审计入口](../../scripts/desktop-sources.mjs) 与 [校验模块](../../scripts/lib/desktop-sources.mjs)：先检查 schema 2 引擎包的整个文件清单、长度及流式 SHA-256，再按文件建立运行资源、二进制包、源码包精确版本、版权文件及源码归档的对应关系。
- [Debian 归档读取器](../../scripts/desktop-deb-catalog.py)：对显式提供的 `.deb` 读取 control 与 tar 内容，以真实成员的字节哈希对应提取过的资源。它不安装包、不向文件系统解压归档、不执行包的维护脚本。读取有限时、文件数量和解压数据总量限制。
- `--installed-metadata` 读取当前系统的包控制信息；只有二进制版本、源码名称及源码版本与既有 provenance 全部匹配时，才用于补充静态来源。不拿升级后的系统信息覆盖旧候选。
- 同时读取 `Built-Using` 与 `Static-Built-Using`。二进制与源码名称不同、epoch、`+b1` 等 binNMU 后缀都由实际 `Source` 字段决定，不能直接拼猜源码版本。
- `.dsc` 检查：解析普通或 clearsigned control，拒绝重复字段、不安全路径、符号链接、重复文件；核对列出的每份归档长度及 SHA-256，quilt 格式必须包含 Debian 补丁/构建资料归档。源码归档按流读取，单文件上限 4 GiB，与二进制文件限制区分。
- [下载入口](../../scripts/desktop-source-fetch.mjs)：仅接受已审计的 Debian 13 精确源码选择器，在新建的私有 APT 目录中使用官方 trixie / security / updates 源；不更改系统 sources、不安装包、不使用 sudo。最多四个下载任务并发，默认每项 180 秒，可配置 30–3600 秒；任何未完成项写入报告并返回非零。
- 生成 `audit.json`、`source-requests.json`、包控制信息目录、可阅读的 README 与独立版权正文副本；标准许可证正文也一并复制，复制后再次检查哈希。源码大文件保留在明确指定的本地归档目录，不放进 Git。
- `--require-complete` 要求自动核对项齐全；通过也只叫 `ready-for-source-review`，`redistributionApproved` 始终为 false。解析 `.dsc` 不等于验证其 PGP 签名，校验归档哈希不等于证明源码可复现对应二进制。
- 桌面 CI 已覆盖新 Node 测试，并增加 Python 文件的路径触发。归档读取器的 Linux 测试使用现场构造的 `.deb`；本轮未推送，远程 CI 未执行。

这里按元数据保守收集源码材料，不判断每个包具体需要履行何种分发义务。范围是原生引擎包；应用、Rust 静态依赖、前端、构建工具，以及包元数据没有完整表达的静态依赖仍需另行形成源码闭包。尤其不能因为 Pandoc 的二进制 control 没列出所有 Haskell 库，就认定没有这些依赖。

## 真实结果

审计对象是 Phase5 的确切 Linux ARM64 引擎包，未修改引擎或重新发行应用。绑定的 `engines.json` SHA-256：

```text
5c31a431c87adfe666050477161ada4248a05b39ad314be9c845ff8fed292fd7
```

| 项目            | 结果                                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| 完整清单        | 668 个资源的哈希与大小通过                                                         |
| 运行资源        | 434 个逐文件对应，未对应 0                                                         |
| 系统包          | 206 个版本与已记录 provenance 相符；控制元数据缺失 0                               |
| 单独提取的包    | 7 份实际 `.deb` 被使用；通过内容核对，而非只看文件名                               |
| 包版权正文      | 需要的文件缺失 0；保留标准许可证正文                                               |
| 源码版本        | 170 组，包括静态构建来源；不能仅按 157 个系统源码版本收集                          |
| 源码归档        | 154 组完整通过 SHA-256 核对；16 组未完成                                           |
| 真实下载入口    | 使用新工具获取 mujs 和 unicode-data 的精确版本成功                                 |
| FFmpeg 编译信息 | 包内程序报告 `--enable-gpl`，未报告 `--enable-nonfree`；不据此自动批准再分发       |
| 自动检查        | 40 项桌面测试（含 15 项来源测试）、180 项网页测试通过；桌面类型检查 0 错误、0 警告 |
| 格式/静态检查   | ESLint、Prettier、Python AST 检查通过                                              |
| 严格源码检查    | 如预期返回 1：16 组缺项，未误标通过                                                |

169 组的首次收集使用本轮临时批处理并保留下载记录；随后从精确匹配的已安装包控制信息中又找到 `unicode-data=15.1.0-1`，使用正式下载入口取得，最终是 170 组。最终审计以归档文件本身为准，下载命令退出成功不代替 `.dsc` 核对。

当前官方 APT 索引不能取得的 13 个精确版本：

| 源码包      | 版本                       |
| ----------- | -------------------------- |
| graphite2   | 1.3.14-2                   |
| imagemagick | 8:7.1.1.43+dfsg1-1+deb13u7 |
| jpeg-xl     | 0.11.1-4                   |
| libass      | 1:0.17.3-1                 |
| libcaca     | 0.99.beta20-5              |
| librabbitmq | 0.15.0-1                   |
| libsndfile  | 1.2.2-2                    |
| libsodium   | 1.0.18-1                   |
| libtasn1-6  | 4.20.0-2                   |
| libvpx      | 1.15.0-2.1                 |
| mpg123      | 1.32.10-1                  |
| openssl     | 3.5.5-1~deb13u1            |
| xz-utils    | 5.8.1-1                    |

另外 `fonts-noto=20201225-2`、`fonts-noto-cjk=1:20240730+repack1-1`、`texlive-extra=2024.20250309-2` 下载超时，留下的部分文件未通过哈希检查。描述文件声明的主归档大小分别约 904 MB、252 MB、2.84 GB（十进制）；这些大体积是源码包范围，不是桌面安装包体积。没有用当前最新版或不完整归档替代。

证据：[审计报告](evidence/phase6/audit.json)、[来源目录](evidence/phase6/source-requests.json)、[引擎编译信息](evidence/phase6/engine-buildinfo.json)、[下载结果](evidence/phase6/downloads.json)、[构建/测试与源码哈希](evidence/phase6/build.json)。完整可读材料及版权正文位于 `.desktop-local/phase6-final/`；已取得的源码在 `.desktop-local/phase6-sources/`。旧 Phase3–5 证据保留历史状态。

## Review 发现并修复

| 严重性 | 问题                                                         | 修复与验证                                                                                    |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 高     | 报告输出放入原始引擎目录会破坏完整清单                       | 规范化路径后拒绝输出到引擎包内部；反向测试确认原包保持完整                                    |
| 高     | 提取资源此前只标记 extracted-deb，不能确定对应的包与精确源码 | 对 `.deb` 实际成员核对大小与 SHA-256；错误内容、重复归属反向测试不放行                        |
| 高     | 将二进制版本当源码版本，或拿同名新版本补缺                   | 正确解析 Source、epoch 和 binNMU；错版本与旧系统元数据测试通过                                |
| 高     | 仅收集动态库包来源，遗漏静态构建来源                         | 两类 Built-Using 字段均读取；真实审计新增 unicode-data 等来源                                 |
| 高     | 损坏、截断、缺少补丁归档可能被当成已收集                     | 按 `.dsc` 全量检查哈希/大小，缺少 `.debian.tar`、越界路径、坏归档均拒绝；真实三个超时包未放行 |
| 中     | 将任意“变换说明”当成来源哈希不一致的豁免                     | 仅接受现有 libtool 模块变换类型并列为人工 review 项；任意二进制变换被拒绝                     |
| 中     | 版权正文与运行资源未对应问题混在一起                         | 分别统计未对应运行文件、缺少版权文件；测试覆盖                                                |
| 中     | 源码归档误受 2 GiB 二进制大小上限约束                        | 根据实际 TeX Live 描述文件改为独立 4 GiB 源码上限，流式计算哈希                               |
| 中     | 复制正文后可能仍沿用复制前结果                               | 再核对副本哈希，最后才写出审计报告；输出目录拒绝覆盖                                          |

本轮没有改动转换逻辑、队列、IPC 或桌面 UI，因此未重建 Phase5 原生安装候选，也不重复宣称 GUI 或跨平台安装验收通过。

## 复现

```bash
# 第一次审计：现有引擎与原始 .deb；输出目录必须不存在
bun run desktop:sources:audit \
  --engines .desktop-local/phase5-engines-final \
  --debs /tmp/z8-m0-deps --extracted-root /tmp/z8-m0-deps/extracted \
  --installed-metadata --output .desktop-local/new-source-plan

# 获取全部精确源码；也可加 --only mujs 先检查一个小包
# 大包可调 --timeout-seconds 1800；超时/版本缺失仍会记录并返回非零
bun run desktop:sources:fetch \
  --audit .desktop-local/new-source-plan/audit.json \
  --output .desktop-local/new-source-downloads

# 核对已下载的源码及补丁；缺项时输出完整报告并返回非零
bun run desktop:sources:audit \
  --engines .desktop-local/phase5-engines-final \
  --debs /tmp/z8-m0-deps --extracted-root /tmp/z8-m0-deps/extracted \
  --installed-metadata --sources .desktop-local/new-source-downloads/archives \
  --output .desktop-local/new-source-review --require-complete

bun run desktop:test:ui
```

没有对应 Linux 包数据库时，省略 `--installed-metadata`；报告会明确标出控制信息未经核对，不能作为完整材料放行。省略 `.deb` 参数不会猜测提取资源属于哪个包。脚本目前只生成 Debian 13 官方源配置；Ubuntu/core24、Windows、macOS 的来源收集需要对应构建体系，不能套用本机系统包记录。

下一步应补齐上述精确源码，或改为从冻结且可交付的源码构建目标引擎，再做原生 P0 安装/权限/升级/卸载验收。商店身份、截图、公开隐私支持页和许可 review 仍未完成；本轮未推送、部署或提交商店。

## 官方依据

核对日期：2026-09-08。

- [Debian control 字段](https://www.debian.org/doc/debian-policy/ch-controlfields.html)：Source 的可选版本、Built-Using、Static-Built-Using、`.dsc` 校验字段。
- [Debian 源码包](https://www.debian.org/doc/debian-policy/ch-source.html)：上游源码、Debian 修改及构建资料的结构。
- [FFmpeg 许可说明](https://ffmpeg.org/legal.html)：最终构建配置会影响许可；只知道项目名称不足以判断具体二进制的分发条件。
