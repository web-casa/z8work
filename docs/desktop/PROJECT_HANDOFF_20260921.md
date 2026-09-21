# Z8.Work 项目开发交接（2026-09-21）

> **2026-09-21 晚间更新（发布日增量）**：公开源码交付已完成——GitHub Release `desktop-source-1`（五归档重下载复算 SHA-256 通过，SHA256SUMS 随发），`engines.json` 五个 `sourceDelivery` 已置 `published`；z8.work 生产已部署 `/desktop-source/` 下载页与四个 desktop-info 页。所有者同日批准分发许可审阅（DISTRIBUTION_LICENSE_REVIEW §7.2），五个 `distributionReview` 已置 `approved`——**发行预检已首次全绿（ready: true，0 项阻塞）**，不再是下文所述十项。隐私/支持页的字节证据被 zone 的 Email Obfuscation 设置阻塞（详见 docs/desktop/evidence/public-pages-20260921/deployment-record.md 与 PUBLIC_PAGES_DEPLOYMENT_CHECKLIST §7），`publicPages` 仍为 `not-deployed`。许可批准：所有者已于 2026-09-21 直接批准（见 DISTRIBUTION_LICENSE_REVIEW §7.2），原 §7.1 的候选后审批时序被取代；逐候选证据要求仍有效。

这份文件是当前桌面发行工作的统一交接入口。历史细节仍保留在 `docs/desktop/`、`progress.md`、`findings.md` 和各证据目录中；发生冲突时，以实际代码、`packaging/desktop-web/engines.json` 和发行门禁输出为准。

## 1. 项目背景与当前产品路线

Z8.Work 来源于 VERT.SH 的本地文件转换产品。网页版在浏览器中运行 WebAssembly 引擎，文件不上传转换服务器。当前桌面版使用 Tauri 2 包装同一套 SvelteKit 前端与 WASM 转换引擎，并通过 Rust 提供系统保存对话框、分块写入、原子提交、退出保护、渠道识别和外链限制。

仓库曾长期开发“桌面内置原生 ImageMagick、FFmpeg、Pandoc、MuPDF CLI”的方案，积累了 Phase 1–29 的队列、保存恢复、进程管理、Linux/macOS 候选和格式验收文档。2026-09-20 起，本分支明确切换到“网页 WASM 引擎桌面版”。旧 native 版资料是历史证据，不能当作当前包已经验收，也不能把旧 native MSIX 直接用于当前版本。

当前渠道决定：

- VERT.SH 网页版继续运行。
- Microsoft Store 桌面版继续开发。
- macOS 仅做 Developer ID 官网/GitHub 直发。
- Mac App Store 已撤销；MAS feature、配置生成器、测试和沙箱专用保存路径已删除，不再索取 MAS 身份。
- 当前没有上传、签名、提交审核、发布源码或发布安装包。

## 2. 仓库与工作区状态

- 工作目录：`/home/ivmm/VERT`
- 分支：`feat/desktop-web-conversion`
- 当前基线提交：`28a19b3dc16896c297f12f9a760655f41d4db652`
- 应用版本：`0.2.0`
- Tauri identifier：`work.z8.desktop.m0`
- 当前工作区包含大量已经授权且相互关联的修改和未跟踪文件，尚未提交。不要执行 `git reset --hard`、`git clean`、大范围 checkout 或回退他人改动。
- `static/pandoc.wasm` 已有意替换，属于本轮正式修改。
- `.desktop-local/` 中保存体积很大的重建缓存、工具链、日志和对应源码归档，默认不进 Git；不要为了清理空间删除最终归档。

本机有 Node 20/22/24、Bun、pnpm、npm 和 sudo Docker。项目常用 Node 22.22.2；实际路径和操作原则见用户提供的 `AGENTS.md` 指令。执行前查询真实接口和脚本，不猜命令；修改后主动测试。

## 3. 当前架构与已实现的商店保护

- `npm run desktop:build` 构建静态前端到 `desktop/dist`，所有转换引擎随包提供，不依赖运行时 CDN。
- Tauri Rust 侧提供受限 IPC 保存：最大 2 GiB、分块写入、临时文件、提交/中止、失败后重试；关闭应用时保护未保存结果。
- `store` feature 仅表示 Microsoft Store 渠道行为：隐藏直发下载入口，并阻止原生壳打开项目 releases 下载路径；源码、隐私和支持链接仍可访问。
- CSP、capability 和命令权限已收紧；渠道由 Rust 返回，前端不自行猜测。
- Microsoft Store MSIX 工具会检查 PE 架构、允许的 payload、符号链接、资源篡改、BlockMap 和解包后字节。`storeSubmissionAllowed` 仍保持 false，直到候选级验收完成。
- 英文/简体中文隐私与支持页已更新为当前 WASM 架构，但 `publicPages.status` 仍是 `not-deployed`。

关键实现入口：

- `scripts/desktop-web-release.mjs`：发行门禁。
- `scripts/desktop-web-browser.mjs`：真实浏览器离线转换和候选引擎注入验收。
- `scripts/desktop-web-msix.mjs`、`scripts/desktop-msix-pack.mjs`、`scripts/desktop-msix-check.py`：Microsoft Store 包准备、打包与检查。
- `src-tauri/src/main.rs`、`src-tauri/src/web_save.rs`：渠道、导航、保存和退出逻辑。
- `packaging/desktop-web/engines.json`：五个 WASM 引擎的唯一当前技术状态清单。

## 4. Microsoft Store 已确认信息

这些字段由项目所有者提供，属于非敏感商店身份；不要索要或记录证书、私钥、密码。

| 字段                   | 值                                                      |
| ---------------------- | ------------------------------------------------------- |
| Identity Name          | `53660AlanM.Z8Work`                                     |
| Publisher              | `CN=84AC3716-04E0-4D67-8951-0D3E51674CA0`               |
| Publisher Display Name | `AlanM.`                                                |
| PFN                    | `53660AlanM.Z8Work_909n0052ampem`                       |
| Store ID               | `9N0S7TK9K4L0`                                          |
| 包历史                 | 用户确认从未上传过 MSIX/AppX                            |
| 首个包版本             | `1.0.0.0`                                               |
| WebView2               | 依赖系统 Evergreen Runtime，最低 Windows `10.0.19041.0` |

配置位于 `packaging/desktop-web/microsoft-store.json`。首次成功上传后必须把 `firstSubmission` 改为 false，记录 Partner Center 最高包版本并使用更高版本；应用版本 `0.2.0` 与四段 MSIX 版本分开管理。

## 5. 历史开发进展

### 旧 native 桌面阶段

Phase 1–29 已实现或研究过任务队列、多页 PDF、保存恢复、诊断、取消/退出、原生引擎进程回收、Linux ARM64 GUI 验收、macOS Developer ID 预览候选、Windows/Snap 打包材料和大规模格式矩阵。它们提供设计经验，但当前 WASM 桌面版不继承旧安装包、引擎、签名或商店通过结论。

### WASM 桌面商店修复阶段

1. 第一批：核对 Tauri 与当前网页引擎架构，写入 Microsoft Store 身份和首包版本；建立网页 MSIX 准备/校验、store 渠道隔离、双语隐私支持页和初版发行门禁。
2. 第二批：收集 MuPDF、ImageMagick、vert-wasm 固定源码；核验 29,596 个 Git blob；vert-wasm 从固定 Rust/crates/wasm-bindgen/Binaryen 输入重建并与随包 WASM 全字节一致。
3. 第三批：固定 FFmpeg 主仓库和 16 个依赖；收集 Pandoc 主源码、六个补丁仓库和历史 GHC 配置；建立源码上下文工具和手动 CI 工作流。
4. 第四批：FFmpeg WASM 和 ESM JS 从固定来源重建，均与 npm 文件逐字节相同；核心转换、能力清单和离线浏览器验证通过。额外 H.265 编码探针在原件和重建件都超时，当前产品不开放该编码输出，不能把此探针写成通过或解码失败。
5. 第五批：MuPDF 1.28.1 使用固定 Emscripten 4.0.8、TypeScript 5.9.3、Terser 5.51.2 重建；WASM 和两个 JS 均逐字节一致；原版/重建版 PDF 回归和离线浏览器验证通过。
6. 第六批：用户确认路线 1A/2A/3B：ImageMagick 采用官方发布资产验证；Pandoc 用新固定构建替换；放弃 MAS。来源清单升级到 schema 2，门禁开始实际核对归档和每个 build input 的 SHA-256，并把公开源码 URL、许可批准设为独立硬条件。
7. 第七批：Pandoc 3.5 从固定的 8 个 Git 树、127 个 Hackage 包、GHC 9.12.0.20241115、WASI SDK、Cabal、Node、Binaryen 119 和固定 Debian builder 断网重建。两份独立产物都通过应用内 Markdown→DOCX 验证；所选新 WASM 已替换旧文件。

## 6. 五个引擎的当前技术状态

| 引擎                    | 当前状态                       | 已证明内容                                                                   | 仍未完成                                            |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| vert-wasm 0.0.2         | `verified-rebuilt`             | 固定源码和 25 个 vendored crates 重建；WASM 全字节相同                       | 公开源码、AGPL 分发批准                             |
| FFmpeg core 0.12.10     | `verified-rebuilt`             | 固定主仓库/依赖重建；WASM 和 JS 全字节相同；常用转换通过                     | 公开源码、GPL/依赖分发批准；HEVC 编码超时仅保留记录 |
| ImageMagick WASM 0.0.43 | `verified-upstream`            | 随包 WASM 与 Magick.Native `2026.824.1923` 官方资产相同；23 个固定依赖已收集 | 公开源码、嵌入库许可义务批准                        |
| MuPDF 1.28.1            | `verified-rebuilt`             | WASM、主 wrapper、minified loader 全字节重建一致；PDF 回归通过               | 公开源码、AGPL 分发批准                             |
| Pandoc 3.5              | `verified-rebuilt-replacement` | 新 WASM 来自固定输入、断网构建；两份独立产物均通过 DOCX 验收                 | 公开源码、GPL 分发批准；字节非确定性保留记录        |

Pandoc 关键边界：即使加入 `SOURCE_DATE_EPOCH`、固定时区/locale 和 GHC `-fobject-determinism`，两次原始 WASM 大小相同但摘要不同；Binaryen 优化件相差 5 字节。WAT 对照显示 GHC 静态数据布局顺序变化。不要把它改写成 bit-for-bit reproducible。发行门禁为此增加 `verified-rebuilt-replacement`，要求至少两次断网构建、不同且格式正确的摘要、所选摘要绑定、运行验收和非确定性审阅。

所选 Pandoc WASM：

- 文件：`static/pandoc.wasm`
- SHA-256：`e12460b4b7ae74829da41b77b97531ca2eeebbcaf2362d0e1912948b59c21e09`
- 源码 commit：`336228bb8d5e9bf35750cfe6b546ffb4bcd86c15`

## 7. 本地对应源码归档

这些归档是发行门禁绑定的本地证据，目前没有公开 URL。移动或重建后必须同步更新 SHA-256 证据，不能手工改状态绕过门禁。

| 引擎        | 本地归档                                                                          | SHA-256                                                            |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| vert-wasm   | `.desktop-local/store-source-closure-20260920/archives/vert-wasm-sources.tar.gz`  | `dca770d88cd72ab606a5be9a875c21eebd019d769ac5ee5a601f53bd5eb9ce78` |
| FFmpeg      | `.desktop-local/store-source-phase4/ffmpeg-corresponding-source-candidate.tar.gz` | `17546c1c151ef8e16578f213f9ae0c96381a19445819a213b47d2bd3fc93e663` |
| ImageMagick | `.desktop-local/store-source-closure-20260920/archives/magick-sources.tar.gz`     | `f4e6e2dd716404916d01f4fc1eb54c35d1d4bdcd80993e94c582efc4535fc339` |
| MuPDF       | `.desktop-local/store-source-phase5/mupdf-corresponding-source.tar.gz`            | `22f86f6e11d2bff9f9ca5664db48c2e0e4e905fe08b37ae483ccb08310345106` |
| Pandoc      | `.desktop-local/pandoc-rebuild-20260921/pandoc-corresponding-source-final.tar.gz` | `0d71a58d3440e62227ef5212f4b5ad484e735014fd4117a9fd638e8ee95b101e` |

Pandoc 归档约 1.1 GB，已检查 3,882 个成员和必需文件。各引擎的详细证据在 `docs/desktop/evidence/`，说明文档为：

- `FFMPEG_REBUILD_VALIDATION.md`
- `IMAGEMAGICK_UPSTREAM_VALIDATION.md`
- `MUPDF_REBUILD_VALIDATION.md`
- `PANDOC_REBUILD_VALIDATION.md`
- `STORE_SOURCE_CLOSURE.md`
- `STORE_SOURCE_RECONSTRUCTION.md`

## 8. 最近一次验证结果

- `npm test`：197 项通过，0 失败。
- `npm run desktop:test:sources`：22 项通过，覆盖 Git/source context、FFmpeg、MuPDF、Pandoc 和 Hackage 锁。
- `npm run check`：Svelte 0 errors / 0 warnings。
- `npm run desktop:build`：通过；`desktop/dist/pandoc.wasm` 与所选新文件摘要一致。
- `node scripts/desktop-web-browser.mjs`：正式静态包的图片、音频、文档、PDF 离线转换通过，无外部资源请求。
- 两个独立 Pandoc 候选分别执行 Markdown→DOCX，检查 DOCX content types、`word/document.xml`、英文和中文内容，均通过。
- MSIX/Store 相关 Python 与 Node 测试：40 项通过。
- `npm run lint:changed`、Prettier、ESLint、`git diff --check`：通过。
- 四个相关 GitHub Actions 工作流经 actionlint：通过。
- Pandoc 对应源码归档摘要和必需成员：通过。

发行预检 `node scripts/desktop-web-release.mjs check` 预期退出码为 1。当前只报告 10 项阻塞：五个引擎各自缺少公开对应源码 URL，以及五个引擎各自缺少分发许可批准。它不再报告 Pandoc 技术来源阻塞、摘要不匹配或缺失构建输入。

## 9. 当前不能声称的事项

- 不能说 Microsoft Store 已可提交或已通过认证。
- 不能把本地源码归档当成公开对应源码交付。
- 不能自行把 `distributionReview.status` 改为 approved；这需要针对最终候选的人工/法律分发审阅。
- 不能说 Pandoc 两次构建字节可复现。
- 不能用 Linux 浏览器测试替代 Windows MSIX 安装、WebView2、WACK 或 macOS 签名、公证、Gatekeeper 验收。
- 不能用旧 native 桌面候选或旧 macOS 签名记录替代当前 WASM 候选。
- 不要上传、发布、签名、推送或提交商店，除非项目所有者明确授权对应外部动作。

## 10. 下一步执行顺序

1. **准备公开源码交付。** 选择长期稳定的 HTTPS 地址，规划五套归档的文件名、版本、摘要、下载页和保留策略。可以先完善待发布目录和校验清单；真正上传/公开发布前需要所有者确认目标位置和外部发布动作。
2. **完成许可矩阵和人工批准。** 按实际最终二进制逐项核对 GPL/AGPL/LGPL/CDDL/Apache/MIT 等义务、静态/动态链接、修改说明、源码 offer、NOTICE 与包内文本。重点是 MuPDF AGPL、vert-wasm AGPL、Pandoc/FFmpeg GPL 和 ImageMagick 的嵌入依赖。完成后才更新 `distributionReview`。
3. **部署隐私/支持公开页。** 当前文件已生成但 `publicPages.status=not-deployed`；部署后记录 URL、时间和内容摘要。
4. **Windows 真机候选。** 在 Windows x64/ARM64 构建 Store feature 的 Tauri 可执行文件，生成 MSIX；核对 Partner Center identity 和 `1.0.0.0`；完成签名侧载、干净安装、WebView2 有/无、离线转换、保存、退出、升级/卸载和 WACK。记录原始日志与最终包 SHA-256。
5. **macOS Developer ID 直发候选。** 需要 Team ID、签名/公证环境，但不需要 MAS App ID。完成签名、公证、staple、Gatekeeper、干净安装、转换、保存、退出和升级验收。
6. **冻结提交材料。** 完成商店文案、截图、价格、年龄分级、隐私、加密声明和支持 URL；把所有材料绑定到最终候选摘要，再运行发行门禁。
7. **最后才上传。** 上传 Microsoft Store 或发布 macOS 包属于外部动作，需在可审阅候选和全部证据完成后执行。

## 11. 建议接手时先运行

```sh
cd /home/ivmm/VERT
git status --short
git diff --check
npm run check
npm test
npm run desktop:test:sources
npm run desktop:build
node scripts/desktop-web-browser.mjs
node scripts/desktop-web-release.mjs check
```

**（2026-09-21 更新）最后一条现已全绿（`ready: true`）；若它再报 issues，则是新回归，按 issues 如实处理。**

## 12. 给下一位模型的交接提示词

```text
你正在接手 /home/ivmm/VERT 的 Z8.Work 桌面发行工作。先完整阅读 docs/desktop/PROJECT_HANDOFF_20260921.md、WEB_STORE_REMEDIATION.md、packaging/desktop-web/engines.json、progress.md 和 findings.md，再检查 git status。不要 reset、clean 或覆盖大量未提交修改。当前分支 feat/desktop-web-conversion，基线 28a19b3；产品已从旧 native CLI 桌面方案切换为 Tauri 2 + SvelteKit + 随包 WASM，与 VERT.SH 网页版共享引擎。目标渠道只有 Microsoft Store 和 macOS Developer ID 直发，Mac App Store 已撤销。

Microsoft Store 身份已确认：Identity 53660AlanM.Z8Work，Publisher CN=84AC3716-04E0-4D67-8951-0D3E51674CA0，Display Name AlanM.，PFN 53660AlanM.Z8Work_909n0052ampem，Store ID 9N0S7TK9K4L0；从未上传，首包 1.0.0.0。不要索要或记录秘密。

五个引擎的技术来源已闭环：vert-wasm、FFmpeg、MuPDF 为 verified-rebuilt；ImageMagick 为 verified-upstream；Pandoc 为 verified-rebuilt-replacement。Pandoc 使用固定源码、127 个 Hackage 包和固定 GHC/WASI/Binaryen 断网重建并替换 static/pandoc.wasm，两份产物都通过 Markdown→DOCX，但字节不同；必须保留非确定性结论，不能写成 bit-for-bit reproducible。不要删除 .desktop-local 中已绑定摘要的五套最终源码归档。

最近验证：197 项 JS、22 项源码工具、40 项 Store/MSIX、Svelte 0/0、正式静态包离线转换及格式/工作流检查均通过。发行预检目前应只因十项外部条件失败：五个公开源码 URL 和五个许可批准。当前不能声称可提交 Store。

请从“公开源码交付准备和候选级许可矩阵”继续：审计归档、NOTICE、许可证和包内材料，生成可审阅的发布目录、摘要清单、下载页草案及逐组件许可决策表。不得擅自把 distributionReview 改为 approved，也不要上传、发布、签名或提交商店。随后准备隐私/支持页部署证据和 Windows x64/ARM64 MSIX 真机验收清单。每一步查询真实脚本与接口，复用现有工具并运行相关测试；严格区分技术通过、人工许可批准和目标系统验收，诚实记录失败。完成可逆本地工作后，再向所有者询问确实需要的发布位置、法律批准或签名环境。
```
