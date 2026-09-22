# 实施记录

2026-09-22 第二十三批（flatpak 闭环 + 全目标产出）：flatpak 三层迭代后 CI 通过——①工件内目录层级（find 根改工件根）；②脚本 cd 后相对路径失效（realpath 预解析）；③CI dpkg 的 deb data 成员是 zstd 而写死成员名两侧都可能落空（改 ar t 枚举成员 + tar --auto-compress，apt 补 zstd/xz-utils，矩阵 snap 步骤同款加固）；④flatpak-builder 不自动补装缺失运行时（显式 flatpak install org.gnome.Platform//47 + Sdk//47）。最终 flatpak bundle `23f203b5…`（work.z8.desktop / GNOME 47 / x64）CI 产出且工件自洽，flatpak 拆为独立 dispatch 工作流（desktop-web-flatpak.yml）以脱离 ARM64 长作业依赖。至此全部目标 CI 实证产出：Windows NSIS exe+MSI（x64/ARM64 NSIS）、macOS app（x64/ARM64）、Linux deb/rpm/appimage（x64/ARM64）、snap（x64）、flatpak（x64）。arm64 snap 一次归档断连未验证，留待常规矩阵顺带覆盖。证据：docs/desktop/evidence/linux-packages-20260922/。

2026-09-22 第二十二批（打包 review）：针对扩展矩阵做系统审查，本地构建真实 deb 验证布局（usr/bin/z8-desktop + share/applications/Z8.Work Desktop Dev.desktop + icons/hicolor/192x192/apps/z8-desktop.png，无 usr/lib——资源全内嵌）。三个 P1 全部修复：① 直接下载包用户可见名是 "Z8.Work Desktop Dev"（默认 dev 配置），新增 packaging/desktop-web/tauri.direct-download-ci.json（productName Z8.Work，CI 安全——不用会因本地绑定文件失败的 release 门禁 prepare）并接入矩阵；② flatpak 的 cp -r lib/. 必然失败（无 lib 目录），改为按真实布局安装 bin/desktop/icon，桌面文件改名 app-id 并改写 Icon；③ snap 无桌面文件注册（装上无启动器），改 source 保留 usr/ 前缀 + organize 改名 z8-work.desktop + override-prime 改写 Icon + snap/meta/gui/z8-work.png（192px）。附带修正 snap command 路径。推送后由新矩阵验证。

2026-09-22 第二十一批（合并 + 公开页闭环 + 打包矩阵扩展）：PR #1 已合并（merge commit 0bb2fde），main 自带全部 desktop 静态页，生产站点由 Git 构建接管。所有者关闭 zone Email Obfuscation 后，desktop-store-verify-pages 首次 **passed**（四页 200+逐字节 match，证据 docs/desktop/evidence/public-pages-20260922b/），submission.json publicPages 置 verified + 哈希引用，store 测试断言同步（deployed 阻塞已消失、candidate 仍在）。打包矩阵扩展：Windows x64 加 msi（ARM64 仅 nsis——WiX 无 ARM64 目标）、Linux x64/ARM64 加 rpm+appimage（APPIMAGE_EXTRACT_AND_RUN 兜底）；新增 strict snap（snap/snapcraft.yaml，core24+gnome 扩展供 WebKitGTK，dump 插件装 tauri deb payload，Linux 双架构 CI 产出）与 flatpak（packaging/flatpak/work.z8.desktop.yml，org.gnome.Platform 47 运行时，simple 模块从 deb payload 安装至 /app，x64 CI 产出 bundle）。全部推送 main（自动触发六平台矩阵验证新打包目标）。

2026-09-22 第二十批（PR 全绿）：PR #1 全部检查通过（exit 0）——六平台矩阵（macos×2/ubuntu×2/windows×2）、quality verify（3m17s，格式修复生效）、Cloudflare Pages 预览。PR 处于 MERGEABLE；合并动作与时机归所有者。合并后生产站点由 Git 构建自带 desktop 静态页。剩余外部依赖不变：zone Email Obfuscation 关闭（公开页字节证据）、Windows 实机+签名材料（§3 矩阵）、macOS Developer ID 环境（正式候选）。

2026-09-22 第十九批（矩阵全绿）：第四次矩阵运行（35631580846）六平台全部成功——Windows x64/ARM64（cargo test --features store 含修复的 web_save 测试在 Windows 通过 + NSIS 打包）、macOS x64/ARM64（app）、Linux x64/ARM64（deb）。加上 quality.yml（分支 dispatch）通过，PR #1 的分支已获得完整六平台 + 质量门验证，处于可合并状态（合并是所有者动作；合并后生产站点由 Git 构建自带 desktop 静态页，不再被直传覆盖）。逐层验证最终账：三层真实缺陷（JS 分隔符×2、EOL smudge、vite receipt、Rust 保存文案平台差异）全部修复并在多平台实证。

2026-09-22 第十八批（矩阵第三层）：修复后的矩阵（35629270129）JS/MSIX 侧全绿（201+22，分隔符修复生效），揭出第三层——Rust web_save 测试在 Windows 失败：rename 覆盖目录报 Access Denied → PermissionDenied 文案缺 retry 引导。按产品语义修复（权限拒绝统一含"重试"引导，Unix rust 测试仍过），推送后重新 dispatch 矩阵（第四次，等结果）。gh run rerun --failed 不带新提交的事实已记录。

2026-09-22 第十七批（评审面 + 矩阵验证）：创建 PR #1（feat → main，含全部发行说明）。发现仓库历史上从未有过 pull_request 事件运行（尽管 quality.yml 在 main 上带该触发器）——PR checks 仅 Cloudflare Pages 预览；GitHub 侧验证改用等价方式：dispatch quality.yml（分支 ref，通过）并发现 desktop-web.yml 同样不存在于 main，照 MSIX 先例以 `[skip ci]` 最小提交注册到 main 后从分支 ref dispatch 六平台矩阵（run 35626699546，结果见后续记录）。生产站点此前因推 main 被 Git 集成构建覆盖（main 无 desktop 静态页），已重部署 feature 内容恢复；Email Obfuscation 探针修正——SPA 页无邮箱、计数恒 0 不能作探针，实测 desktop-info 页改写仍在，公开页字节证据继续等所有者关闭设置。

2026-09-22 第十六批（PR 评审线 + 生产回归修复）：发现推 main 注册 workflow 触发了 Git 集成 Pages 的生产重建，main 无 desktop-info/desktop-source 静态页，生产站点两处路径回退为 SPA（回归，系我方 main 推送的副作用）。已用 feature 构建重新部署生产恢复（2049306e）。公开页字节验证仍 failed：zone Email Obfuscation 改写依旧存在（此前 email-protection 计 0 系 SPA 无邮箱所致，不代表设置已关），继续等所有者仪表盘操作（已在报告中给出精确路径）。创建 PR #1（feat/desktop-web-conversion → main，含完整发行说明），触发 quality + desktop-web 六平台矩阵对整条分支做权威验证；**合并 PR 是生产不再被 main 推送覆盖的持久修复**。商店文案草案 STORE_LISTING_DRAFT.md 落地（上一批），本轮一并入 PR。

2026-09-21 第十五批（review 轮 + macOS 候选线）：探测确认 zone Email Obfuscation 仍开启。dispatch macOS ARM64 web 预览工作流（run 35622039167）成功：当前分支 b01db4c 在 macos-15 构建并验证 app+dmg（ad-hoc 签名 codesign 严格校验通过、依赖仅系统框架、版本/标识一致；未公证与 GUI 冒烟如实标注），工件 SHA256SUMS 本机复算一致，证据入 docs/desktop/evidence/macos-web-preview-20260921/——这是当前分支最新的 macOS 可构建证据，不替代 Developer ID 正式候选验收。商店文案草案 STORE_LISTING_DRAFT.md 落地（双语 display name/摘要/描述/关键词/更新说明/截图说明，摘要长度 73/36 字符合限，与 content.json 隐私表述一致），README 索引同步。本轮 review 复核：macOS 作业在 macOS 上跑通 npm test 与 desktop:build，等于第三方平台实证了 vite receipt 修复与 .gitattributes 的跨平台正确性（Linux/Windows/macOS 三平台全部绿）。

2026-09-21 第十四批（所有者授权提交/推送后）：工作区以三笔主题提交落库（feat：引擎源码发布与分发批准+全部代码/证据 168 文件；docs：发行/许可/验收四份计划与 handoff 更新；docs：progress/findings），推送 feature 分支（28a19b3..5f95d65）并把 MSIX workflow 以最小提交注册到 main（workflow_dispatch 需默认分支可见；推送 main 会触发 quality.yml 常规门，属预期）。dispatch 后经四次诚实迭代完成首轮 CI 候选：① tauri CLI 拒绝 --bundles none → 改 --no-bundle；② Windows checkout CRLF 破坏字节 drift → 新增 .gitattributes（\* -text，全仓字节精确原则）；③ vite receipt 插件在 Windows 上 cwd 分隔符失配产生空模块清单（963 模块/372 node_modules 修复后实测）→ 归一化分隔符，这是 CI 暴露的仓库真实跨平台缺陷；④ x64 一次 GitHub CDN 504 抖动。run 35619046492 双架构成功：未签名 Store MSIX 候选 x64 `e2075625…`/arm64 `7b732d3e…`（identity 53660AlanM.Z8Work、1.0.0.0、web-store archive-check passed），本机用 desktop-msix-check.py 独立复核双 passed，候选摘要与证据入 docs/desktop/evidence/windows-msix-20260921/。门禁 CI 断言通过（仅本地文件不可得）。待真人真机：签名侧载、干净安装、WebView2 有/无、离线转换保存退出、升级/卸载、WACK（清单 §3）。

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
