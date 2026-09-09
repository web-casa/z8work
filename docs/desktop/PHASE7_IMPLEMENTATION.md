# Phase 7：补齐历史源码、可恢复下载与 review

日期：2026-09-08。承接 [Phase 6](PHASE6_IMPLEMENTATION.md)，本轮完成 Linux ARM64 本地候选的**已列出引擎源码材料**收集：170 个精确版本全部通过完整性审计。M3/M4 的原生安装、权限、升级/卸载和分发许可验收仍未完成。

## 实现与边界

- [历史源码下载入口](../../scripts/desktop-source-snapshot.mjs) 与 [下载模块](../../scripts/lib/desktop-source-snapshot.mjs)：从现有审计报告选取缺失版本，查询 Debian Snapshot 官方 API。核对返回的源码名称、完整版本（包括 epoch）、文件大小与内容标识，不自动替换为新版。
- 默认先访问 API 实际记录的 Debian 官方镜像路径，失败后尝试 Snapshot 的固定内容地址。只访问两个官方 HTTPS 主机，拒绝跳转；API 响应有 2 MiB 上限和 30 秒单次期限，连接失败最多重试一次，404 不重复查询。最多两个源码包并行，每包默认 900 秒，总期限可配置 30–3600 秒。
- 下载先写 `.part`。恢复时核对 `Content-Range`；服务器返回完整的 200 响应时从头写入。限制响应编码、长度和写入字节数，最终重新校验整份文件，不能只检查新下载的尾部。校验通过后才发布最终文件，不覆盖已有文件。
- Snapshot 的 SHA-1 用于核对历史内容地址；源码归档还必须符合 `.dsc` 的 SHA-256、长度与文件清单。描述文件本身通过 HTTPS 来源及 Snapshot 内容标识核对；**本轮没有进行 OpenPGP 签名验收**。哈希完整性与发布者身份分别记录。
- `--cache` 只读取旧目录，接受已有完整文件或 `.part`，复制到新的工作区再校验。`--resume` 必须匹配原来的引擎清单哈希和精确源码选择；每次重新查询元数据并检查最终文件。符号链接、硬链接下载目标和不安全路径均拒绝。
- 工作区锁拒绝并行写入，保存 PID 与开始时间；下载报告按完成项串行、原子写入。SIGINT/SIGTERM 会取消任务、记录失败并释放锁。强制 SIGKILL 或断电可能留下锁；需核对 `.lock/owner.json` 中进程已退出后，再手动移除该锁，工具不会自动抢占。
- [材料合并入口](../../scripts/desktop-source-assemble.mjs)：将旧审计的完整源码与新下载的补充材料合并到新目录。核对双方绑定的引擎清单、精确源码版本及描述文件哈希；复制前后都检查归档，拒绝覆盖原目录或写入输入缓存。只在全量完成后生成 `assembly.json`，然后仍须运行严格引擎审计。

这些是发行准备工具，不参与桌面转换、队列或 WebView 的运行。没有新增桌面联网行为，也没有改变应用二进制。收集范围仍以引擎包来源元数据为界，不能据此宣称应用、Rust、前端、Pandoc 的全部静态依赖或构建工具的源码闭包已经验收。

## 真实结果

| 检查                   | 结果                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Phase 6 的 13 个旧版本 | 均从官方历史记录取得，精确版本未替换                                                   |
| 三个大包               | fonts-noto、fonts-noto-cjk、texlive-extra 全部完整；TeX Live 主归档 2,840,925,236 字节 |
| 最终下载工具恢复执行   | 16/16 通过，已有最终文件重新核对，报告状态 `verified-awaiting-source-review`           |
| 合并后的源码材料       | 170 组、559 份描述/归档文件，共 4,804,627,271 字节（约 4.80 GB）                       |
| 严格引擎审计           | `ready-for-source-review`，退出码 0；源码缺失 0，坏归档 0                              |
| 原有文件对应关系       | 668 个资源清单通过；434 个运行资源全部对应，缺少版权正文 0，未核对系统元数据 0         |
| 桌面测试               | Node 24 与 CI 使用的 Node 22 均通过 61 项，其中本轮新增 21 项                          |
| 网页回归               | 180 项通过                                                                             |
| 类型与静态检查         | 桌面 svelte-check 0 错误、0 警告；ESLint、Prettier 通过                                |
| 原生安装与商店         | 本轮未执行；没有重建 Phase 5 应用、推送、部署或提交商店                                |

“170 组完整”只说明本轮已列出的源码包文件齐全。`redistributionApproved` 保持 false，签名、来源真实性、构建可复现性和具体许可义务仍需 review。上述约 4.80 GB 是源码材料体积，不是桌面安装包大小。

材料位置：`.desktop-local/phase7-final/`；完整源码：`.desktop-local/phase7-sources-final/`。源码大文件留在忽略目录，不进入 Git。证据见 [审计报告](evidence/phase7/audit.json)、[下载报告](evidence/phase7/downloads.json)、[合并收据](evidence/phase7/assembly.json)、[测试记录](evidence/phase7/tests.json) 与 [构建/源码绑定](evidence/phase7/build.json)。Phase 6 的缺项报告保留为历史记录。

## Review 发现与修复

| 严重性 | 触发条件与影响                                         | 修复与证据                                                                                        |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 高     | 断点文件头部损坏，但仅验证续传尾部会误判完成           | 校验整个文件的 SHA-1 与 `.dsc` SHA-256；损坏前缀、截断和双哈希反向测试通过                        |
| 高     | 服务器忽略 Range 或返回错误区间，可能拼接出坏文件      | 200 从头写，206 必须精确匹配区间；真实本地 HTTP 续传及错误响应测试通过                            |
| 高     | 恢复目录中的链接可能使下载覆盖其他文件                 | 拒绝符号链接、多重硬链接，打开临时文件使用 `O_NOFOLLOW`；外部文件未变的反向测试通过               |
| 高     | 直接相信旧报告会让之后损坏的缓存混入合并结果           | 复制前后重新验证 `.dsc` 清单与字节，失败不生成完成收据；损坏补充材料测试通过                      |
| 中     | 同一历史内容哈希对应多个名称，取第一项会漏掉正确归档   | 真实 TeX Live 复现；保存名称对应关系，按 `.dsc` 选名，回归与真实下载通过                          |
| 中     | 网络连接失败位于重试逻辑之外                           | 将连接与响应读取一并纳入有限重试；连接失败后恢复及 404 不重试测试通过                             |
| 中     | 中断或并行执行破坏状态，留下假完成报告                 | 工作区绑定、互斥锁、原子检查点及取消；错绑定、锁占用和真实子进程 SIGTERM 测试通过                 |
| 中     | 报告写入失败使一个下载任务提前退出，其他任务还在写目录 | 等待全部任务结束后才释放锁，写报告失败时取消剩余任务；该异常磁盘路径为静态 review，未模拟磁盘故障 |

[下载测试](../../desktop/tests/source-snapshot.test.mjs) 包含本地 HTTP 服务器，不依赖公共网络；[合并测试](../../desktop/tests/source-assemble.test.mjs) 使用合成源码清单验证复制与完整性，不声称编译过这些源码。CI 已有脚本路径规则和 `desktop:test:ui`，自动包含本轮新增测试；本轮未运行远程 CI。

## 复现

以下沿用本地 Phase 6 输入；输出目录应新建。公开仓库本身不包含这些大文件和本机二进制包。

```bash
# 获取审计报告中的缺项；读取旧缓存不会修改它
bun run desktop:sources:snapshot \
  --audit .desktop-local/phase6-final/audit.json \
  --cache .desktop-local/phase6-sources \
  --output .desktop-local/source-supplement \
  --timeout-seconds 1200

# 中途失败后，使用相同审计与选择恢复；也可以通过 --only 指定包名
bun run desktop:sources:snapshot \
  --audit .desktop-local/phase6-final/audit.json \
  --output .desktop-local/source-supplement \
  --timeout-seconds 1200 --resume

# 将先前完整项与补充项汇集到一个新目录
bun run desktop:sources:assemble \
  --audit .desktop-local/phase6-final/audit.json \
  --supplement .desktop-local/source-supplement/downloads.json \
  --output .desktop-local/source-collection

# 最终全量核对；完整性不通过时退出码为 1
bun run desktop:sources:audit \
  --engines .desktop-local/phase5-engines-final \
  --debs /tmp/z8-m0-deps --extracted-root /tmp/z8-m0-deps/extracted \
  --installed-metadata --sources .desktop-local/source-collection \
  --output .desktop-local/source-review --require-complete

bun run desktop:test:ui
```

下一阶段应推进 P0 目标平台的实际安装件与原生验证，优先解决目标系统引擎的构建与依赖来源。当前材料绑定 Debian 13 ARM64 的 Phase 5 验证候选，不能直接当作 Ubuntu/core24 Snap、Windows MSIX 或 macOS 安装包的来源证明。签名和源码闭包 review 也应围绕各自的最终构建继续完成。

## 官方依据

核对日期：2026-09-08。

- [Debian Snapshot](https://snapshot.debian.org/)：官方历史归档，支持按日期和精确版本访问。
- [Snapshot machine-readable API](https://salsa.debian.org/snapshot-team/snapshot/raw/master/API)：`srcfiles?fileinfo=1` 返回内容标识及历史文件信息；同一内容可能具有多个名称，通过 `.dsc` 选择本次所需名称。
- [Debian control 字段](https://www.debian.org/doc/debian-policy/ch-controlfields.html)：源码身份与 `.dsc` 校验清单；沿用 Phase 6 的解析和验证模块。
