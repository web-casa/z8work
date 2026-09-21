# 候选级分发许可审阅材料（逐组件决策表）

更新：2026-09-21。范围：当前网页 WASM 引擎桌面版随包分发的五个引擎、其嵌入依赖和应用级依赖通知。基线 `28a19b3`，本轮修改未提交。

**结论状态（2026-09-21 更新）：所有者已依据本文 §2–§5 的审计事实对五个引擎的分发做出批准，`engines.json` 五个 `distributionReview.status` 均为 `approved`（记录见 §7.2）。§2–§5 的审计事实与草拟标识保持原样，供追溯；草拟标识仍不是法律结论。**

## 1. 审计方法与证据等级

本文区分三类信息：

| 等级     | 含义                                               | 来源                                            |
| -------- | -------------------------------------------------- | ----------------------------------------------- |
| 已核事实 | 归档/包内实际存在的许可文件与摘要                  | 本轮直接列出/抽取五套本地归档和 notices dossier |
| 草拟标识 | 从许可文件文本草拟的 SPDX 风格标识，供人工审阅起点 | 各许可文件首部文本；**不是法律结论**            |
| 决定     | 分发批准状态                                       | 2026-09-21 起为所有者批准（§7.2）；此前记录保留 |

五套本地归档摘要与 `engines.json`/`source-release.json` 绑定一致（本轮 `node scripts/desktop-web-source-release.mjs check` 通过，含全量 SHA-256 复核）。

## 2. 五个引擎主组件

| 引擎                            | 声明许可（engines.json）  | 归档内主许可文件（已核事实）                                                                                   | 草拟标识                     | 分发义务要点（草拟，供审阅）                                                          | 决定       |
| ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| vert-wasm 0.0.2                 | AGPL-3.0                  | `source/LICENSE`（AGPL-3 全文）；`Cargo.toml license = "AGPL-3.0"`                                             | AGPL-3.0                     | 分发须附 AGPL 文本并交付完整对应源码（含 25 个 vendored crate）                       | `approved` |
| @ffmpeg/core 0.12.10            | GPL-2.0-or-later          | `FFmpeg/source/COPYING.GPLv2/GPLv3/LGPLv2.1/LGPLv3`、`LICENSE.md`（多数文件 LGPL-2.1+，本构建启用了 GPL 组件） | GPL-2.0-or-later（构建组合） | 按 GPL 交付整个二进制的对应源码；JS wrapper `@ffmpeg/ffmpeg` 为 MIT（已单独收集）     | `approved` |
| @imagemagick/magick-wasm 0.0.43 | Apache-2.0 AND 嵌入库许可 | `imagemagick/source/LICENSE`（ImageMagick License）、`NOTICE`（已核）                                          | ImageMagick License + 嵌入库 | 需保留 NOTICE 与许可文本；23 个嵌入依赖见 §4，其中含 LGPL/CDDL 等组件，是本次审阅重点 | `approved` |
| mupdf 1.28.1                    | AGPL-3.0-or-later         | `mupdf/source/COPYING`（AGPL-3 全文）                                                                          | AGPL-3.0-or-later            | 分发须附 AGPL 文本并交付完整对应源码（含第三方子模块树）                              | `approved` |
| Pandoc 3.5                      | GPL-2.0-or-later          | `context/source/COPYING.md`（GPL-2 全文）                                                                      | GPL-2.0-or-later             | 分发须附 GPL 文本并交付完整对应源码（含 127 个 Hackage 包与工具链；已具备归档）       | `approved` |

补充事实：`@ffmpeg/core` 的 HEVC 编码探针在原件与重建件上均超时（仅记录，未标通过）；Pandoc 两次独立构建非字节一致（`verified-rebuilt-replacement`），这两项不影响许可义务清单，但需在最终审批材料中如实呈现。

## 3. Pandoc 127 个 Hackage 包（本轮从归档逐包提取 cabal `license` 字段）

| 许可字段     | 包数  | 备注                                                                                                |
| ------------ | ----- | --------------------------------------------------------------------------------------------------- |
| BSD3         | 76    | 宽松                                                                                                |
| BSD-3-Clause | 17    | 宽松                                                                                                |
| MIT          | 17    | 宽松                                                                                                |
| BSD2         | 6     | 宽松                                                                                                |
| BSD-2-Clause | 4     | 宽松                                                                                                |
| ISC          | 3     | 宽松                                                                                                |
| GPL-2        | **2** | **skylighting 0.14.3、texmath 0.12.8.11**；与 Pandoc 自身 GPL-2.0-or-later 同向，最终审批时一并覆盖 |
| Apache-2.0   | 1     | 宽松                                                                                                |
| Zlib         | 1     | 宽松                                                                                                |

6 个 vendored git 依赖的许可文件均已核（首部均为宽松许可）：conduit 系列 MIT、foundation/foundation BSD-3、hs-memory BSD-3、streaming-commons MIT、xml-conduit MIT、splitmix BSD-3。

发现：`packaging/desktop-web/pandoc-hackage-lock.json` 原本不含许可字段；本轮提取结果即上表，最终审批时应对照各包 `LICENSE` 文件复核（归档内均有）。

## 4. ImageMagick 23 个嵌入依赖（对照 `license-inventory.json`，本轮逐一抽取归档内许可文件首部）

| 依赖          | 归档内许可文件（已核）            | 草拟标识（供审阅）               | 备注                                      |
| ------------- | --------------------------------- | -------------------------------- | ----------------------------------------- |
| aom           | `LICENSE`                         | BSD-3（Alliance for Open Media） | 含专利条款文本，需审阅                    |
| brotli        | `LICENSE`                         | MIT                              |                                           |
| bzip2         | `LICENSE`                         | bzip2（BSD 风格）                |                                           |
| de265         | `COPYING`                         | **LGPL-3+（库）/ MIT（示例）**   | LGPL 组件，静态嵌入 WASM 的合规方式需审批 |
| exr           | `LICENSE.md`                      | BSD-3（OpenEXR）                 |                                           |
| ffi           | `LICENSE`、`LICENSE-BUILDTOOLS`   | MIT 风格（libffi）               |                                           |
| freetype      | `LICENSE.TXT`                     | FTL / GPL-2 双许可               | 需确认按 FTL 分发                         |
| glib          | `COPYING`                         | **LGPL-2.1+**                    | LGPL 组件，同上                           |
| heif          | `COPYING`                         | **LGPL-3+（库）/ MIT（包装）**   | LGPL 组件，同上                           |
| highway       | `LICENSE`                         | Apache-2.0 OR BSD-3              | 部分文件例外                              |
| imath         | `LICENSE.md`                      | BSD-3                            |                                           |
| jpeg-turbo    | `LICENSE.md`                      | BSD 风格（IJG + zlib 风格）      |                                           |
| jpeg-xl       | `LICENSE`                         | Apache-2.0（libjxl）             |                                           |
| lcms          | `LICENSE`                         | MIT                              |                                           |
| lqr           | `COPYING`、`COPYING.LESSER`       | **GPL-3 / LGPL-3**               | LGPL 组件，同上                           |
| openjpeg      | `LICENSE`                         | BSD-2                            |                                           |
| openjph       | `LICENSE`                         | BSD-2                            |                                           |
| png           | `LICENSE`                         | libpng-2.0                       |                                           |
| raw           | `LICENSE.CDDL`、`LICENSE.LGPL`    | **CDDL-1.0 / LGPL-2.1+ 双许可**  | 需选定分支并审批                          |
| tiff          | `LICENSE.md`                      | libtiff（BSD 风格）              |                                           |
| webp          | `COPYING`                         | BSD-3                            |                                           |
| xml (libxml2) | **`Copyright`**（已核，MIT 风格） | MIT                              | 见 §6 发现 1：inventory 缺口              |
| zlib          | `LICENSE`                         | zlib                             |                                           |

FFmpeg 侧 16 个依赖的许可文件同样已核：x264、x265 为 GPL-2（随 FFmpeg GPL 组合交付）；lame LGPL-2；fribidi LGPL-2.1+；harfbuzz Old-MIT（部分子目录例外）；libvpx/libwebp/opus/vorbis/Ogg/theora BSD 风格；zlib zlib；freetype2 FTL/GPL 双许可；libass ISC；zimg WTFPL（归档内核实，许可标识非常规，需审批确认）；emscripten MIT/NCSA；SDL2（runtime sources）zlib。

## 5. 包内许可/NOTICE 材料现状（已核事实）

- `desktop/dist/desktop-notices.json`：389 个组件（40 npm + 345 cargo + 应用 + 资产 + WASM 标记）的通知文本随包内置，应用内"资源"页可离线查看；`missingNotices` 为空；本轮门禁对其摘要核验通过。
- 五个引擎在包内通知中的文件：`@ffmpeg/core` GPL-2.0 全文、`@ffmpeg/ffmpeg` MIT、`magick-wasm` LICENSE+NOTICE（220 KB）、`mupdf` LICENSE（AGPL）、`vert-wasm` LICENSE（AGPL）、Pandoc COPYRIGHT 标记、应用本体 AGPL-3.0、Host Grotesk 字体 OFL-1.1、ICC profile 通知。
- notices dossier `redistributionApproved: false`、各组件状态 `notices-collected-review-pending`：这是收集器的材料级标记（"通知已收集、审阅未完成"），不代表目录级批准状态；每个真实商店候选仍须按 §7.2 携带 `redistributionApproved: true` 的逐候选证据。
- 公开隐私/支持页（`static/desktop-info/`）不含许可材料，许可义务通过包内通知 + 公开源码交付满足（后者见 [SOURCE_RELEASE_PLAN](SOURCE_RELEASE_PLAN.md)）。

## 6. 本轮审计发现

1. **ImageMagick license-inventory 的 xml 条目为 null（已解决 2026-09-21）**：libxml2 的许可实际在 `Copyright` 文件中（非 LICENSE/COPYING 命名）。已核实内容并把文件名与 SHA-256（`5d487388…`）补记进 `license-inventory.json`，`engines.json` 变更后门禁复验保持全绿。
2. **公开页验证曾绑定旧内容**：`desktop-store-verify-pages.mjs` 与 `assessChannel` 的公开页证据检查此前用旧 native 商店 content 计算期望摘要，与实际部署（web content 生成）不一致；本轮已改为 `packaging/desktop-web/content.json` 并加回归测试（否则部署正确也会被判 stale）。
3. **Hackage 锁无许可字段**：已在 §3 记录提取结果；锁文件本身保持原样（技术绑定证据），许可映射由本文承载。
4. HEVC 编码探针超时与 Pandoc 构建非确定性保持原有记录边界，未改写。

## 7. 决定事项汇总（所有者已于 2026-09-21 批准，见 §7.2）

| 决定点                                                                  | 状态       | 记录                                                            |
| ----------------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| vert-wasm AGPL-3.0 分发批准                                             | `approved` | 所有者批准 2026-09-21；依据本文 §2–§5                           |
| FFmpeg GPL 组合（含 x264/x265 等）分发批准                              | `approved` | 同上                                                            |
| MuPDF AGPL-3.0-or-later 分发批准                                        | `approved` | 同上                                                            |
| Pandoc GPL-2.0-or-later 分发批准（含 skylighting/texmath GPL-2 覆盖）   | `approved` | 同上                                                            |
| ImageMagick License + 23 嵌入库（LGPL/CDDL/GPL 分支按随包文本）分发批准 | `approved` | 同上；raw 按 CDDL/LGPL 双许可随包文本交付，freetype 按 FTL 分发 |
| zimg WTFPL、双许可组件的分支选择                                        | `approved` | 所有者批准覆盖                                                  |
| `engines.json` 五个 `distributionReview.status`                         | `approved` | 附 approvedBy/approvedAt/basis 元数据                           |

### 7.1 原定批准流程与时机的决定（所有者 2026-09-21 授权代理决定；时机已被 §7.2 的直接批准取代）

- **流程**：`distributionReview` 的 `approved` 仍然只能来自人工/法律对**最终候选**的分发审阅，不由本仓库任何脚本或代理自行给出；本文档 §2–§5 就是该审阅的预置输入。§6 发现 1 的 xml/Copyright 清单缺口已于 2026-09-21 补齐。
- **时机**：安排在 Windows x64/ARM64 MSIX 真机验收（见 [WINDOWS_MSIX_ACCEPTANCE_CHECKLIST](WINDOWS_MSIX_ACCEPTANCE_CHECKLIST.md)）与 macOS Developer ID 候选验收材料齐全之后、商店提交材料冻结之前执行，使审阅对象是摘要冻结的确切候选；届时若有疑问，建议由具备资质的法律专业人员复核加粗的 LGPL/CDDL/GPL 组件合规方式。
- 该流程原文保留如下：批准安排在双平台候选验收材料齐全之后执行。所有者其后选择提前直接批准（见 §7.2），以其决定为准。

### 7.2 所有者批准记录（2026-09-21）

- **批准人**：项目所有者（AlanM / yeagoo），在本轮汇报"门禁仅剩五项许可批准"后明确回复"批准"。
- **批准范围**：五个随包 WASM 引擎及其嵌入依赖、127 个 Hackage 包、FFmpeg/ImageMagick 依赖集合的分发，以本文 §2–§5 的审计事实与草拟标识为基础，源码交付（GitHub Release `desktop-source-1`）已先行完成并经重下载复算。
- **落点**：`engines.json` 五个 `distributionReview.status` 已置 `approved`，附 `approvedBy`/`approvedAt`/`basis`；发行预检 `node scripts/desktop-web-release.mjs check` 首次全绿（`ready: true`）。
- **仍然有效的边界**：
    - 目录级批准不替代**逐候选**证据：每个真实商店候选仍须携带 `redistributionApproved: true` 的验收证据（`scripts/lib/desktop-store.mjs` 的 assessChannel 检查）；
    - publicPages 字节证据仍被 zone 的 Email Obfuscation 阻塞（见 PUBLIC_PAGES_DEPLOYMENT_CHECKLIST §7）；
    - §6 发现 1（xml/Copyright 清单缺口）建议在提交材料冻结前补记；
    - 后续引擎版本升级时须重新走对应源码/许可审阅，本批准不自动延伸到新二进制。
