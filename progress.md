# 实施记录

2026-09-21 第十三批（下一步=Windows 候选 CI 线 + review）：探测确认 zone Email Obfuscation 仍开启（线上页仍有 email-protection 改写），公开页字节证据继续等所有者。主攻 Windows MSIX 候选的 CI 自动化：新增 `.github/workflows/desktop-web-store-msix.yml`（仅 workflow_dispatch，windows-2025/windows-11-arm 双矩阵）：store 配置构建 → 干净 payload（z8-desktop.exe+可选 WebView2Loader）→ 布局准备（绑定 github.sha）→ MakeAppx 打包 → 独立 ZIP/BlockMap 校验 → SDK 解包逐字节比对 → 上传 msix+SHA256SUMS+全部日志。关键设计发现：五个证据共 12 个 buildInputs 与五套归档都在 `.desktop-local/`（不进 Git），release gate 的 prepare 离仓不可运行——新增 `tauri.microsoft-store-ci.json`（store feature，继承基础 beforeBuildCommand），workflow 在构建后跑门禁 check 并断言 issues 全部为"(source archive|build input) unavailable"，任何摘要漂移（changed build input/digest mismatch）都会使作业失败（断言逻辑对真实输出与合成 issue 两分支实测）。自审修复：npm→bun install（仓库只有 bun.lock）、CI 配置移除 tauri schema 外字段、工件清单补 archive-check.log/unpack.log。激活前提：工作区提交并推送（外部动作，等所有者授权）后手动 dispatch。检查清单 §2 已注明 CI 边界；actionlint/prettier/JSON 校验通过。

2026-09-21 第十二批（review 轮）：独立审查代理 + 自查对第十一批及此前改动做全面 review，14 项发现（0 P0）全部处置。P1×4：两个新脚本加 main-module 防护（`import.meta.url === pathToFileURL(argv[1])`，沿用 prepare-pages 先例），导入不再执行 CLI、不再重写静态页——drift 测试由"形同虚设"变为真实断言；DISTRIBUTION_LICENSE_REVIEW 头部/§1 的过时"全部 pending"结论改为批准后状态（§7.2）；`desktop/tests/store.test.mjs` 接入 desktop-web CI（与 msix.test.mjs 同步运行，actionlint 通过），清单文档的 `npm test` 说法同步修正。P2 处置：stage 改为对拼装副本再哈希（关闭 verify→copy 间 TOCTOU，SHA256SUMS 不可能记录未实际写入的字节）；页面生成器双语链接对称化 + draft 状态注入可见草稿标记（published 时为空）；PLAN §3/§5/§6 时态更新为已发布、容量改为 1.51 GiB；LICENSE_REVIEW §5 dossier 句改为引用 §7.2 逐候选边界；handoff §11 命令预期改为"现已全绿"；xml/Copyright 缺口正式补记（digest `5d487388…`，inventory 状态与备注同步）；"6 资产"措辞改为"五归档+SHA256SUMS"。接受不改项：engines.json `pending` 字段名保持 schema 稳定（门禁仅在 blocked 态读取）；stage 单用户本地 TOCTOU 残余风险已由副本复验关闭。同步重部署 z8.work 使生产页与仓库一致（双语链接已上线；与仓库字节差仅剩 zone Email Obfuscation 改写，属已知阻塞）。收尾全量验证：201 JS + 22 store/msix + 源码工具 + Svelte 0/0 + 门禁 ready:true + 双 drift 检查 + lint/diff 全绿。

2026-09-21 第十一批（同日，所有者回复"批准"）：所有者对五个引擎的分发许可审阅给出直接批准。`engines.json` 五个 `distributionReview` 置 `approved`（附 approvedBy/approvedAt/basis 元数据），各引擎 `pending` 文本改写为反映现状（源码已交付、许可已批准，余下为平台候选验收与商店材料）；重跑 desktop:build 刷新 notices dossier 后，**发行预检 `desktop-web-release.mjs check` 首次全绿（ready: true，0 项阻塞）**。DISTRIBUTION_LICENSE_REVIEW 新增 §7.2 批准记录（范围、依据、仍然有效的边界：逐候选 redistributionApproved 证据、publicPages 字节证据仍被 Email Obfuscation 阻塞、xml/Copyright 清单缺口待补、批准不自动延伸到新引擎版本），§7.1 原有时序标注被直接批准取代。handoff 顶部注记与 WEB_STORE_REMEDIATION 状态表同步更新。发行门禁全绿不等于可提交商店：Windows/macOS 候选验收、逐候选证据、公开页字节证据收尾与商店材料冻结仍按清单执行。

2026-09-21 第十批（同日，所有者授权上传与部署后执行）：GitHub Release `desktop-source-1` 已发布（`--target 28a19b3`、`--latest=false`），6 资产全部 `uploaded` 且全量重下载 `sha256sum -c` 复算通过；`source-release.json` 置 `published`（五个 publishedUrl/publishedAt），`engines.json` 五个 `sourceDelivery` 置 `published`+URL——发行门禁由十项阻塞降为**五项许可批准**（中途 engines.json 变更曾致 notices dossier 过期，按支持路径重跑 desktop:build 重新收集后消除）。Cloudflare Pages 项目 `z8work` 经 `wrangler pages deploy build-pages --branch main` 部署到生产：`/desktop-source/` 与四个 desktop-info 页全部 200，站点健康（首页/convert/about/pandoc.wasm Worker 均正常）。**诚实失败记录**：`desktop-store-verify-pages` 对四页返回 `failed`——zone 的 Email Address Obfuscation 把 mailto/邮箱改写为 `/cdn-cgi/l/email-protection` 并注入解码脚本，字节证据无法生成；wrangler OAuth 无 zone settings/rulesets 权限，不能代为关闭。`submission.json` 保持 `not-deployed`，收尾三步（所有者关闭该设置→重跑验证器→置 verified）写入证据目录 deployment-record.md。下载页功能完整（6 链接+摘要未被改写，解码脚本在）。发布验证临时下载 1.6GB 已清理，验证日志入 evidence。

2026-09-21 第九批（同日）：所有者选定源码发布位置——GitHub Releases（web-casa/z8work，标签 `desktop-source-1`）+ z8.work 新增下载页；并授权代理决定许可批准流程/时机与公开页部署时机。落地：`source-release.json` urlPlan 升级为 `location-selected`（pattern + releaseTag + 替代策略）；新增 `scripts/desktop-web-source-page.mjs` 从清单确定性渲染 `static/desktop-source/index.html`（双语、无脚本、CSP/noindex 与 desktop-info 页一致，含五个最终下载 URL、完整 SHA-256、WASM 绑定与 SHA256SUMS 链接，--check drift 模式）；关于页 Resources.svelte 新增"对应源码"入口（全渠道可见，z8.work 链接不被 store 渠道拦截，已核对 main.rs external_link_allowed）。两项决定入档：许可批准安排在双平台候选验收材料齐全后、提交材料冻结前，由人工/法律对摘要冻结的最终候选执行（§7.1）；隐私/支持页与 /desktop-source/ 同一次站点部署带出，前置条件是 GitHub Release 先上传并复算摘要。测试新增页面渲染/drift/URL 解析断言（4 项）。上传 release 与站点部署仍为外部动作，本轮未执行。

2026-09-21 第八批：公开源码交付与候选级许可审阅材料落地。新增 `packaging/desktop-web/source-release.json`（draft-local-only，绑定五套本地归档与引擎目录）和 `scripts/desktop-web-source-release.mjs`（check 全量复核摘要；stage 校验通过后拼装待发布目录，失败不产生半成品），staging 已生成于 `.desktop-local/source-release-staging-20260921/`（五归档 + SHA256SUMS + README，约 1.6 GiB）。逐包提取 Pandoc 127 个 Hackage 包 cabal 许可：125 个宽松 + skylighting/texmath GPL-2；并核验 ImageMagick 23 个嵌入库、FFmpeg 16 个依赖、Pandoc 6 个 vendor 依赖及五引擎主许可文件首部。交付四份文档：SOURCE_RELEASE_PLAN（含双语下载页草案）、DISTRIBUTION_LICENSE_REVIEW（决定列全部 pending）、PUBLIC_PAGES_DEPLOYMENT_CHECKLIST、WINDOWS_MSIX_ACCEPTANCE_CHECKLIST。修复公开页验证内容源不一致（verify-pages 与 assessChannel 曾按旧 native 商店 content 计算期望摘要，现改为 packaging/desktop-web/content.json），加回归测试。`engines.json` 的 sourceDelivery/distributionReview 五对状态未动；发行门禁仍精确报十项外部阻塞。未上传、未签名、未提交商店。

2026-09-21 第七批：Pandoc 3.5 已从固定的 8 个源码树、127 个 Hackage 包、GHC/WASI/Binaryen 工具链和 Debian builder 断网重建，所选 WASM `e12460b4...` 已替换旧文件。两次独立构建均通过应用内 Markdown→DOCX 验收，但字节摘要不同；证据明确标为 `verified-rebuilt-replacement`，没有虚报 bit-for-bit reproducible。发布门禁新增两次独立断网构建、不同摘要、运行验收和非确定性记录校验。197 项 JS、22 项源码工具、Svelte 0/0、正式静态包离线浏览器回归、归档完整性及工作流语法均通过。门禁只剩五个引擎的公开源码交付和分发许可批准。

2026-09-21 第六批：按用户确认的 1A / 2A / 3B 实施。撤销 MAS 专用代码和配置，macOS 路线改为 Developer ID 直发；来源清单升级到 schema 2。FFmpeg、MuPDF、vert-wasm 标为 `verified-rebuilt`，ImageMagick 标为 `verified-upstream`，Pandoc 保持 `blocked`。门禁现核对每个构建输入摘要，并要求公开源码 URL 与分发许可明确批准。ImageMagick 23 个固定依赖的主要许可文件已清点，但未作最终许可批准。

第六批验证：197 项 JavaScript 测试、21 项源码工具测试、5 项旧 MSIX 测试、Rust default/store 各 8 项、Svelte 诊断及离线浏览器四类转换均通过；静态页面、格式、ESLint 和 diff 检查通过。发行预检按设计返回 `ready=false`：Pandoc 技术来源阻塞，另四个技术已验证引擎均缺公开源码交付和许可批准。

2026-09-21 第五批：MuPDF 断网重建成功，WASM 和两个 JS 文件与当前 npm 文件一致；固定 TypeScript 5.9.3、Terser 5.51.2。原版和全套重建版各 38 项 PDF 回归、7 个离线浏览器流程通过。198 项应用测试、21 项源码工具测试通过。证据见 docs/desktop/MUPDF_REBUILD_VALIDATION.md，未提交商店。

本批差异：Terser 5.39.2 压缩字节不同，5.51.2 一致；SDK 省略 25 个维护/格式文件、规范化版本字符串，已保留原始差异并分类核对；Python data 解包过滤器规范化链接末尾斜杠导致 Git 复验失败，GNU tar 保留原文后通过。最初查找不存在的 phase2/manifest/PDF 测试路径失败，随后按实际目录继续。一次文档补丁因标题不匹配未应用，按实际标题重新应用。构建容器均已退出，无后台编译任务。

2026-09-20：开始审计与计划，工作区基线干净。读取 desktop-release-playbook、planning-with-files 和 context7-mcp。未触发构建工作流、签名、上传或发布。

完成渠道配置与保护的首轮实现。用户提供 Windows 身份并确认首包 1.0.0.0。198 项 JS 测试通过；旧 MSIX 测试 5 项通过（含 Python archive 测试）；Linux ARM64 上 default/store/mas 三种 Rust feature 各 8 项通过；Svelte 0 errors/0 warnings；静态前端构建通过。四份上游固定提交源码快照已取得，仅作审阅输入。

验证问题：Ajv 6 不认识 Tauri schema 的 double format，schema 校验首次失败；需显式注册数值格式后重新验证，不能把此失败当配置通过。

最终：注册数值格式后两套配置均通过 schema。离线浏览器四类转换、许可及 direct/store 入口验证通过。ESLint、Prettier、cargo fmt 与 git diff --check 通过。额外旧商店/验收 34 项首次 33/34：页面已迁移而测试仍对照旧 native 文案；修正源对照且保留双版 renderer 转义检查后 34/34。更新中英公开说明并运行生成器一致性检查。发行预检退出码 1，五项来源问题保留。证据位于 docs/desktop/evidence/store-remediation-20260920/。

本轮交付修复方案与第一批本地实现；没有生成正式 Store 安装件、调用 Windows/Mac 安装测试、使用签名秘密、推送或提交商店。后续依赖与顺序写入 WEB_STORE_REMEDIATION.md。文档补丁曾因格式化后表格空白不匹配而未应用，已按实际文本重新应用。

## 第二批完成记录

见 docs/desktop/STORE_SOURCE_CLOSURE.md：三份本地源码归档、29,596 个 Git blob 核验、vert-wasm 全字节重建成功；198 + 7 项测试和 9 个功能样例通过。发行门禁保持失败。

构建遇到 /tmp 空间耗尽；改用项目忽略目录的 TMPDIR 和 Cargo target 后成功。Git 归档遗漏/规范化的文件已从固定 blob 恢复并复验。未提交商店。

## 第三批记录

FFmpeg 主仓库及 16 个固定依赖、Pandoc 主仓库候选及 6 个补丁仓库、历史 GHC 配置已收集。25 组/19,759 个 Git blob 通过核验和解包复验。GHC 归档摘要和版本头匹配；不能替代完整构建对应证明。详见 docs/desktop/STORE_SOURCE_RECONSTRUCTION.md。

失败及处理：首次 FFmpeg 构建无限 make 并行导致资源压力，主动中止（130）；改为 make -j2、BuildKit 两步骤、6 GiB/4 核后重试，900 秒超时（124），没有最终 WASM。专用 builder 已停止，保留缓存；没有修改共享 builder 或应用引擎。Python unittest discover 对原文件命名发现 0 项，已改成明确执行两个测试文件，实跑 15 项通过。

## 第四批完成记录

FFmpeg WASM 与 ESM JS 从固定源码重建后均与当前 npm 文件逐字节相同。核心 6 项检查、能力清单、7 个离线页面转换/下载流程通过；包含合成 HEVC/AAC 视频的音频提取和解码信号验证。19 组来源、30,446 个 Git blob 及解包复验通过。见 docs/desktop/FFMPEG_REBUILD_VALIDATION.md。

观察与失败：Docker 以 sudo 导出目录归 root 且权限 700，首次读取失败；只调整本轮产物目录所有权后验收通过。版本文件含 JSON 引号，改用 JSON 解析后确认 3.1.40。链接器有 x265 签名警告；独立 8/10/12 位编码补测在原件和重建件上均 20 秒超时，未归因、未标通过。当前应用不提供该视频编码输出，HEVC 视频提取音频验收通过。专用 builder 已停止、缓存保留。发行门禁仍阻止提交。
