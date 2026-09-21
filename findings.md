# 调查记录

2026-09-22 第十七批发现：本仓库 pull_request 触发器历史上从未生效（无任何该事件运行），PR 的 GitHub Actions 验证需以 workflow_dispatch 于分支 ref 手动触发替代；desktop-web.yml 与 store-msix workflow 均不在 main 上，dispatch 类触发要求 workflow 存在于默认分支，故功能分支新建的 dispatch workflow 都需要一次 `[skip ci]` 最小提交注册到 main。Cloudflare Email Obfuscation 的探针必须用含 mailto 的页面，SPA 不含邮箱恒显示 0。

2026-09-22 第十六批发现：Cloudflare Pages 项目为 Git 集成（main）+ 直传混用——任何对 main 的推送都会触发生产重建并覆盖此前直传的内容；在 feature 分支合并前，生产依赖"main 推送后重新直传 feature 内容"这一手工步骤。判断"Email Obfuscation 是否关闭"不能用 SPA 页面当探针（SPA 无邮箱，计数恒 0），必须探测含 mailto 的 desktop-info 页面本身。

2026-09-21 第十五批发现：desktop-web-macos-preview.mjs 的验证面（架构单一性、Info.plist 三项一致、codesign --deep --strict、依赖路径白名单、zip 重解压复验、hdiutil verify）可直接作为 Developer ID 正式候选验收的脚本基础，缺的只是真实身份签名与公证环节。macOS 作业在 macos-15 成功跑通 npm test + desktop:build，使 vite receipt 修复获得三平台（Linux/Windows/macOS）实证。

2026-09-21 第十四批发现：tauri 2.11.4 CLI 既不接受 `--bundles none` 也不接受 config `bundle.targets: "none"`（schema 仅 all/列表/单值），跳过打包的正解是 `--no-bundle` 旗标。actions/checkout 在 Windows runner 上的 EOL smudge 会破坏一切"仓库字节 == 工作区字节"的检查（drift、摘要绑定），`* -text` 的 .gitattributes 是字节精确项目的必备件。vite 模块 ID 在 Windows 用正斜杠而 process.cwd() 带反斜杠，任何 `id.startsWith(cwd)` 式过滤都必须先归一化两侧——这类 bug 在 Linux 上永不暴露。GitHub 的 workflow_dispatch 只对默认分支上存在的 workflow 开放：功能分支新增 dispatch workflow 需先以最小提交把文件注册到 main，再以 `--ref` 指定功能分支运行。

2026-09-21 第十三批发现：release gate 的摘要绑定是"发行编排环境"的绑定——`.desktop-local/` 内 12 个 buildInputs（pandoc 3、ffmpeg 2、magick 2、mupdf 4、vert 1）加五套归档都不在 Git 内，任何干净 checkout（含 CI）都必然 5+12 项 unavailable；CI 上的正确姿势是"普通构建 + 门禁 check + 断言仅本地不可得"，而不是绕过 check 或把绑定材料搬进 Git。tauri 构建二进制名由 Cargo 包名（z8-desktop）决定，与 MSIX 布局工具的强制要求一致；--bundles none 可只出 exe。tauri build --config 不支持的额外字段可能被 CLI 拒绝，CI 配置只保留与既有 store 配置相同的字段集。

2026-09-21 第十二批（review 发现）：顶层 CLI 代码的 ESM 副作用会让"导入式"测试静默改写被测文件、使 drift 断言永远为真——测试必须假设 import 即执行，防护用 `import.meta.url === pathToFileURL(process.argv[1])` 且仅在被直接运行时进入 CLI。prettier 会把多行 throw 合并成单行，文本替换式重构的断言必须先读实际文件而非凭记忆。z8.work 的 Email Obfuscation 使"`/desktop-source/` 与仓库逐字节一致"在 zone 设置关闭前不可能成立，只能做功能级核验（链接/摘要/解码脚本）。

2026-09-21 第十一批：所有者单字"批准"的解读与落地——按全项目语境（"分发许可批准"是唯一挂起的批准项）理解为对五个引擎 distributionReview 的所有者批准；批准元数据（approvedBy/approvedAt/basis）直接写入 engines.json 使其可审计、可回退。发行门禁全绿后 `prepare` 模式将开始真正重建前端（此前因 issues 非空而跳过），Windows 候选构建路径恢复设计行为。逐候选 `redistributionApproved` 检查（assessChannel）独立于目录级批准，仍是提交前硬条件。

2026-09-21 第十批发现：**Cloudflare zone 的 Email Address Obfuscation 与"部署页字节必须等于仓库渲染"的证据门禁互斥**——z8.work zone 开启该功能时，任何含 `mailto:`/裸邮箱的页面在边缘被改写（实测 `/desktop-info/en/privacy/` 首个差异即 `<a href="/cdn-cgi/l/email-protection#…">`，且注入 email-decode.min.js），`desktop-store-verify-pages` 永远 failed；wrangler OAuth token 只有账号/Pages 级权限（可列 zone 但 settings/rulesets 调用返回 Authentication error 10000），无法代关。改页面内容绕开属产品决策不擅自做。另：Pages 项目为 Git 集成 + 直传混用，`wrangler pages deploy` 不带 `--branch` 时落到当前 git 分支的 Preview，须 `--branch main` 才进生产（生产域 z8.work 挂在项目的 production 环境）；GitHub release 的 API `created_at` 可能显示为标签目标时间，发布时间应取 `published_at`。

2026-09-21 第九批发现：z8.work 下载页直接渲染 `publishedUrl ?? pattern+releaseTag`，因此页面必须晚于 GitHub Release 部署，否则链接 404——顺序已写入计划与部署清单。store 渠道外链守卫（main.rs external_link_allowed）只拦 github.com/web-casa/z8work/releases 前缀，z8.work/desktop-source 全渠道可开，关于页新增入口无渠道冲突。页面渲染为确定性输出（无时间戳），drift 检查可逐字节比对。关于页复用 getLocale 内联双语文案，未动 paraglide 消息目录。

2026-09-21 第八批发现：libxml2（ImageMagick 依赖 xml）的许可在 `Copyright` 文件而非 LICENSE/COPYING，现有 license-inventory.json 记为 null，属清点缺口，需在最终审批前补记。`desktop-store-verify-pages.mjs` 与 `assessChannel` 的公开页证据检查此前用旧 `packaging/desktop/store/content.json` 计算期望摘要，与实际部署来源（`packaging/desktop-web/content.json`）渲染结果逐字节不同（四页全部 DIFFER，已实测），正确部署会被判 stale；本轮改为 web content 并加回归测试（旧内容构造的证据必须被拒绝）。`desktop-web-release.mjs prepare` 在十项外部阻塞未清前不会重建前端，Windows 候选构建必须显式绑定已验证的 `desktop/dist`，已写入 MSIX 清单。Pandoc 127 个 Hackage 包中 skylighting 0.14.3 与 texmath 0.12.8.11 为 GPL-2，其余 125 个为宽松许可（cabal license 字段逐包提取）；FFmpeg 依赖中 zimg 归档内核实为 WTFPL，需审批确认。store 测试夹具的临时 root 需包含 web content 文件才能行使公开页证据路径。另外：`desktop/tests/` 全目录运行时 legacy 的 versions.test.mjs（"Cargo version drift"）在基线树与当前工作区均失败，属既有状态，不在本轮声称的通过集合内，未改动。

2026-09-21 Pandoc 结论：固定输入并加入 `SOURCE_DATE_EPOCH`、固定 locale/timezone 和 GHC `-fobject-determinism` 后，两次原始 WASM 大小相同但摘要仍不同，Binaryen 优化件相差 5 字节；WAT 对照定位到 GHC 静态数据布局顺序。两份产物分别通过相同的 Markdown→DOCX 应用验证，因此选择第一份作为源码构建替换件，并用独立 replacement 门禁状态诚实记录非确定性。对应源码归档 SHA-256 为 `0d71a58d3440e62227ef5212f4b5ad484e735014fd4117a9fd638e8ee95b101e`。

2026-09-21 路线确认：采用 1A 风险分级来源门禁；Pandoc 采用 2A 新建固定可复现构建并替换；采用 3B 放弃 Mac App Store，macOS 只做 Developer ID 直发。MAS 专用特性、生成器、沙箱保存分支和测试已删除。

第六批 review 发现旧发行门禁只要求 `buildInputs` 非空，没有核对各输入摘要；已补逐项 SHA-256 校验，并把公开源码交付和分发许可批准设为独立条件。ImageMagick 与官方 Magick.Native `2026.824.1923` WASM 相同，固定 23 个依赖的技术来源可标为 `verified-upstream`；其源码尚未公开交付，依赖许可兼容仍未批准。

2026-09-21：MuPDF 1.28.1 固定源码配合 Emscripten 4.0.8、TypeScript 5.9.3、Terser 5.51.2 能重建与 npm 相同的 WASM 和两个 JS 文件。完整证明和验收见 docs/desktop/MUPDF_REBUILD_VALIDATION.md；不代表源码公开交付、许可审阅或商店原生验收已完成。

- 当前为网页 WASM 引擎桌面版；旧 native MSIX 需要 engines/engines.json，不能直接用于此版本。
- 发行预检拒绝五项 WASM 来源/完整源码材料；不能用 npm 包或版本标记替代对应源码。
- 当前正式配置沿用 `work.z8.desktop.m0`；已有 Mac 证据仅适用于旧 Developer ID 直发候选，不能替代最新候选验收。
- Windows 商店身份尚未在仓库提供；原 MSIX 工具强制开发身份，需保留其保护。
- Windows CI 已有 x64/ARM64 NSIS 构建，不等于 Store MSIX 验收。
- Tauri 官方 App Store 文档（2026-09-20 核对）支持 macOS.files 嵌入 profile、macOS.entitlements、Mac 分发签名和 productbuild PKG；本地 CLI schema 确认相应字段。Context7 月配额耗尽，改查官方页面。
- GitHub 仓库变量列表为空，尚无可复用的非敏感 Store 身份配置。
- FFmpeg 0.12.10 确切发布提交 Dockerfile 仍引用 x264 4-cores、lame master 等浮动分支，不能把今日分支 HEAD 当成已发布 WASM 输入。
- 原生后端保留 `store` 编译特性及渠道查询，阻断商店构建直接下载链接；UI 默认不显示下载，等原生渠道确认后显示。
- 用户提供 Microsoft Store 正式身份 53660AlanM.Z8Work、Publisher CN=84AC3716-04E0-4D67-8951-0D3E51674CA0、显示名 AlanM.、PFN 53660AlanM.Z8Work_909n0052ampem、Store ID 9N0S7TK9K4L0；确认从未上传，首包版本 1.0.0.0。
- 源码快照检查：Magick wrapper 从 @dlemstra/magick-native@2026.824.1923 取得 WASM；MuPDF 快照不含 .gitmodules 对应 thirdparty 内容；vert-wasm 有 Cargo.lock，仍需 crates 归档与构建工具链；Pandoc 上游当前 workflow 使用浮动 fork 和 ghc-wasm-meta 分支，无法证明 2025-04-12 导入的旧二进制来源。

## 第二批发现

- vert-wasm 当前 WASM producers 指明 rustc 1.85.1 (4eb161250 2025-03-15)、wasm-bindgen 0.2.100、walrus 0.23.3；已安装指定 Rust 工具链（不改变默认），按原 Cargo.lock 收集 vendor。
- Magick.Native 2026.824.1923 对应提交 566ae32c14fe7ea7fc139670cefee669a035d335；官方发布 ZIP SHA-256 0d8178eb7e5bd92ac1dc713afefae3f6251b75f6ab14d0157ff8088d10c2ea1f 已核对，其 magick.wasm 与项目 WASM SHA-256 完全相同。
- MuPDF 固定提交的 gitlink 已从 GitHub Git tree 读取，并按 .gitmodules 收集确切子模块，不采用 branch 字段的当前 HEAD。
- 编译遇到系统 /tmp tmpfs 19 GiB 已满；清理本轮临时编译目录的 rm 命令被自动工具策略拒绝，改为保留原目录，仅将 TMPDIR/CARGO_TARGET_DIR 定向到本轮 .desktop-local 私有目录重试。

## 第二批完成记录

见 docs/desktop/STORE_SOURCE_CLOSURE.md：三份本地源码归档、29,596 个 Git blob 核验、vert-wasm 全字节重建成功；198 + 7 项测试和 9 个功能样例通过。发行门禁保持失败。

构建遇到 /tmp 空间耗尽；改用项目忽略目录的 TMPDIR 和 Cargo target 后成功。Git 归档遗漏/规范化的文件已从固定 blob 恢复并复验。未提交商店。

## 第三批记录

FFmpeg 主仓库及 16 个固定依赖、Pandoc 主仓库候选及 6 个补丁仓库、历史 GHC 配置已收集。25 组/19,759 个 Git blob 通过核验和解包复验。GHC 归档摘要和版本头匹配；不能替代完整构建对应证明。详见 docs/desktop/STORE_SOURCE_RECONSTRUCTION.md。

失败及处理：首次 FFmpeg 构建无限 make 并行导致资源压力，主动中止（130）；改为 make -j2、BuildKit 两步骤、6 GiB/4 核后重试，900 秒超时（124），没有最终 WASM。专用 builder 已停止，保留缓存；没有修改共享 builder 或应用引擎。Python unittest discover 对原文件命名发现 0 项，已改成明确执行两个测试文件，实跑 15 项通过。

## 第四批完成记录

FFmpeg WASM 与 ESM JS 从固定源码重建后均与当前 npm 文件逐字节相同。核心 6 项检查、能力清单、7 个离线页面转换/下载流程通过；包含合成 HEVC/AAC 视频的音频提取和解码信号验证。19 组来源、30,446 个 Git blob 及解包复验通过。见 docs/desktop/FFMPEG_REBUILD_VALIDATION.md。

观察与失败：Docker 以 sudo 导出目录归 root 且权限 700，首次读取失败；只调整本轮产物目录所有权后验收通过。版本文件含 JSON 引号，改用 JSON 解析后确认 3.1.40。链接器有 x265 签名警告；独立 8/10/12 位编码补测在原件和重建件上均 20 秒超时，未归因、未标通过。当前应用不提供该视频编码输出，HEVC 视频提取音频验收通过。专用 builder 已停止、缓存保留。发行门禁仍阻止提交。
