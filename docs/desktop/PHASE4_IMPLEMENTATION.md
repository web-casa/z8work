# Phase 4 / M4：商店材料、隐私支持页与提交检查

日期：2026-09-08。按照 [V1 方案](V1_PLAN.md) 的 M4 推进，承接 [Phase3](PHASE3_IMPLEMENTATION.md)。本轮完成可在本地执行的材料准备、校验开发和 review；**M3 的目标平台安装验收尚未完成，M4 也尚未达到“可提交候选”验收条件。**

## 已实现

- [内容源](../../packaging/desktop/store/content.json)：中英文商店介绍、短介绍、功能列表、桌面隐私说明、使用与支持内容。品牌为 Z8.Work，邮箱为 contact@web.casa，源代码指向 web-casa/z8work。
- [提交状态](../../packaging/desktop/store/submission.json)：Microsoft Store 与 Snap 分开管理。包身份、Publisher、Snap 注册名、价格选择及适用的年龄分级均留待真实信息，不猜测账号数据。
- `desktop:store:prepare` 生成两种语言、两个商店的四份介绍 JSON、两份审核说明、四份隐私/支持 HTML，以及完整的未完成事项报告。它们是内部编辑材料，**不是声称兼容外部商店 API 的请求格式**；Snap 的本地化副本按其当时控制台支持使用。
- `desktop:store:pages` 生成四个独立静态页面，`desktop:store:check` 检查生成结果是否漂移。页面复用现有米白、深色边框与橙色提示的视觉风格，支持语言导航、移动端与键盘焦点；没有 JS、转换引擎、外部字体或图片请求。页面明确标为预览说明，并设为 noindex。
- 页面已经纳入本地 Cloudflare Pages 生产构建。路径为 `/desktop-info/en/privacy/`、`/desktop-info/en/support/`、`/desktop-info/zh-Hans/privacy/`、`/desktop-info/zh-Hans/support/`。
- `desktop:store:verify-pages` 是部署后的只读网络核对工具，要求 HTTP 200 和正文哈希匹配；限时、限制响应大小、拒绝重定向、拒绝覆盖已有报告。它不会执行部署。
- `desktop:store:ready` 在资料不完整时返回非零。即使完全符合本地规则，结果也仅是 `ready-for-human-review`，不代表签名验证、审核批准或发布授权。
- CI 增加材料/静态页漂移检查。Rust 测试将商店声明的每条输入输出路线与真实 `output_formats()` 对比，防止宣传范围脱离程序。

本轮没有更换 Phase3 原生引擎或重新发行其候选包。Rust 文件只增加了测试；Phase3 的原始产物和证据作为历史记录保留，不能要求旧记录中的全部源码哈希与本轮新增脚本一致。

## 隐私与功能文案 review

文案只描述桌面已有能力：四种图片输出、PDF 多页、五种音频输出及从支持的视频提取音轨、Markdown/DOCX 提取纯文本。没有套用网页的 23 种 PDF 输出，也没有承诺视频输出、电子表格、OCR、文档排版保真或每次压缩都会更小。

隐私说明明确区分文件内容不上传与其他网络活动，说明本地历史会保存文件名、路径、设置与哈希，异常退出可能留下临时文件。清空队列不等于删除原文件、结果、升级备份或包管理器快照。用户主动提交邮件/公开 issue 是另外的数据流，文案没有把支持邮件写成自动诊断上传。

Windows 审核说明解释 full-trust 原生子进程与文件处理用途，同时要求核对实际 manifest；未把它称为管理员提权。Snap 说明分别要求 portal/home、隐藏文件、外接盘、输出授权、更新回滚，未把 devmode 或 ARM64 tarball 当作 strict amd64 安装证据。两份审核说明均以真实候选完成 M3 为提交前提。

## 校验开发中发现并修复的问题

| 发现                                                                  | 修复与覆盖                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Phase3 的初步检查允许仅用一个字符串描述“已通过”，无法核对具体证据文件 | M4 要求每条通过检查引用真实文件与 SHA-256，报告必须绑定同一候选哈希；缺文件、旧报告、改包、链接和越界路径均被拒绝 |
| 通过报告可能与 `redistributionApproved: false` 同时出现               | 再分发审查必须显式为 true，不能仅靠其他检查覆盖                                                                   |
| Linux ARM64 的 GUI 截图可能被误填到 MSIX 或 Snap amd64 材料           | 每张图绑定平台、架构、语言、候选哈希及截图报告；当前不附商店截图，Phase3 图仅作本地实现参考                       |
| 只检查 PNG 扩展名或尺寸头可以接受损坏图片                             | 验证 PNG signature、chunk CRC、终止块、解压像素长度和滤波字节；有体积/像素上限；Windows 检查最低桌面截图尺寸      |
| 大包可能被整个读入内存，或误受 JSON 证据文件大小上限影响              | 候选使用流式 SHA-256，上限 2 GiB；JSON 引用默认 8 MiB，PNG 为 50,000,000 字节。新增超过 8 MiB 候选的回归测试      |
| 隐私说明变更后，旧的“已部署”报告可能继续放行                          | 对四个语言/页面组合逐一比对当前渲染正文 SHA-256；任何缺失或漂移均不放行                                           |
| 编辑材料中的 HTML 可能进入公开页面或不符合介绍字段要求                | HTML 页面统一转义，商店说明拒绝 HTML 和 URL，执行说明/摘要长度与语言完整性检查                                    |

本地 PNG 检查接受非交错、8 位 RGB/RGBA，最多 16 百万像素，是当前项目的输入约束，不是对所有合法 PNG 的完整解码器。截图文件与报告的真实性、OS 签名、SDK/WACK、实际安装体验仍需人工和平台工具判断。测试中的合成包只验证规则分支，不算安装包通过。

## 本轮验证

| 检查                                   | 结果                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 原生默认特性测试                       | 39 通过，1 个子进程夹具由监督测试调用；含材料与真实转换路线比对                                            |
| 桌面/打包/商店材料测试                 | 24 通过；包含旧哈希、错误平台、损坏 PNG、未批准再分发、缺报告、过期隐私说明等反向测试                      |
| 网页原有单元测试                       | 180 通过                                                                                                   |
| Cloudflare Pages 生产构建              | 通过，四个静态页均为生成器的确切正文                                                                       |
| 浏览器                                 | 中英文 × 隐私/支持 × 1366/390 宽，共 8 项通过；禁用 JS，额外网络请求 0，语言导航与键盘焦点通过，无横向溢出 |
| ESLint、Prettier、rustfmt、原生 Clippy | 通过                                                                                                       |
| 严格提交检查                           | 按预期失败：账号/分发设置、目标候选、截图和公开页面证据未齐                                                |
| 四个生产页面 URL                       | 本轮只读查询均为 HTTP 404；尚未部署，不标为有效商店链接                                                    |
| 商店登录、上传、审核、发布             | 未执行                                                                                                     |

证据位于 [Phase4 目录](evidence/phase4/readiness.json)，包括 [浏览器报告](evidence/phase4/browser.json)、[移动端页面截图](evidence/phase4/privacy-zh-Hans-mobile.png) 和 [生产 URL 查询](evidence/phase4/public-pages.json)。查询结果是本轮时间点的记录，不代表以后部署后的状态。

## 使用方式

在项目根目录运行：

```bash
# 修改 content.json 后刷新静态页面
bun run desktop:store:pages

# 检查文案及生成页面；允许保存仍有待办项的草稿
bun run desktop:store:check
bun run desktop:store:prepare --check-pages --output .desktop-local/new-store-dossier

# 要求全部条件满足，否则退出码为 1
bun run desktop:store:ready

# 复现静态页面浏览器验证
bun run build:pages
bun run desktop:test:store-pages

# 完成经过授权的网站部署后，核对生产正文
bun run desktop:store:verify-pages --output .desktop-local/new-public-page-evidence.json
```

材料输出目录必须不存在，避免覆盖已 review 的版本。本轮可查阅的完整材料在 `.desktop-local/phase4-store-reviewed/`。`--require-ready` 会在写完可审阅报告后返回非零；它不会通过登录商店来补齐缺项。

`submission.json` 的引用格式统一为：

```json
{ "file": "relative/path/in/workspace.json", "sha256": "文件的完整 SHA-256" }
```

这里的示例描述内部数据结构，示意的哈希文本不会被校验器接受。候选引用包含 `package` 与 `evidence` 两个文件引用；候选 evidence 使用 Phase3 结构，并将每个通过的 `checks.*.report` 改为上述引用。检查报告要有 `status: passed`、`artifactSha256`；包身份应来自实际包内提取结果，MSIX 对应 name/publisher/version，Snap 对应注册名称。截图还要提供 locale、os、arch、candidateSha256、caption、captureReport；截图报告绑定实际图片哈希。公开页面报告使用验证工具的输出。

## 尚未满足的阶段门槛

1. 完成 P0 Windows x64、Linux amd64 strict Snap、macOS arm64 的实际候选安装、权限、升级/卸载及许可/对应源码验收。
2. 提供真实 Partner Center Identity/Publisher、四段包版本、Snap 注册名，确认价格选择，并完成适用的年龄分级问卷。本轮未取得这些账号信息。
3. 对实际 Windows/Snap 候选分别抓取截图并保存证据；不能放大本地 Linux 图来假装 Windows 截图。
4. 将本轮准备的隐私与支持页部署至 z8.work，核对正文，再附上通过的部署证据。
5. 人工核对当前控制台字段与候选内容后，依据用户明确的发布指令执行外部操作，并分别记录上传、审核与公开状态。

## 官方资料核对

- [MSIX 商店介绍字段](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/add-and-edit-store-listing-info)：描述为纯文本，最长 10,000 字符；不在描述中插 HTML/URL；首次提交不填 What's new。
- [MSIX 截图要求](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images)：按实际设备/语言提供截图，桌面最低 1366 × 768，PNG 与大小要求；项目对头像/宣传素材不作虚构填充。
- [MSIX 支持信息](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/support-info)：使用项目自己的隐私/支持网页。
- [Snap 商店介绍建议](https://snapcraft.io/blog/make-your-snap-store-page-pop)：79 字符摘要。其他更保守的长度/图像限制是本地检查约束，提交前仍需核对当时控制台。
