# SEO 实施与审查记录

本轮以可抓取的真实工具页面、准确文案和首屏加载为重点。页面使用现有 Pixel Desktop 组件，文件仍在浏览器处理。

## 页面与收录范围

- 英语使用根路径，西班牙语、简体中文、繁体中文分别使用 `/es/`、`/zh-Hans/`、`/zh-Hant/`。标题、描述、H1、Open Graph、Twitter 卡片与页面语言一致。
- 15 种语言共预渲染 195 个页面；目前完整提供新功能翻译的四种语言共 44 页进入站点地图，其余语言仍可使用，但暂设 `noindex, follow`，避免把英语回退内容当成完整翻译发布。
- `/convert/`、`/settings/` 及其语言版本不收录。转换队列仅在内存中，不进入 URL、站点地图或结构化数据。
- 每个可收录页面有自身 canonical、四种语言的相互 `hreflang` 和英语 `x-default`。统一域名为 `https://z8.work`，忽略查询参数产生的重复地址。
- `sitemap.xml` 从同一份路由定义生成，包含 44 个规范网址；`robots.txt` 声明其地址。不使用虚构的更新时间。
- JSON-LD 包含 WebSite、WebPage、首页 SoftwareApplication 和工具页 BreadcrumbList；不添加虚构评分或承诺搜索结果一定显示富媒体样式。序列化时转义 `<`，避免脚本标签注入。

实现入口：`src/lib/seo/`、`src/routes/sitemap.xml/+server.ts`。新增可收录页面时，同时更新 `routes.mjs` 和四种语言的 `content.ts`，运行生成 HTML 检查。

## 六个可以直接使用的入口

| 路径                       | 匹配输入的默认输出 |
| -------------------------- | ------------------ |
| `/tools/heic-to-jpg/`      | HEIC / HEIF → JPG  |
| `/tools/png-to-webp/`      | PNG → WebP         |
| `/tools/png-to-avif/`      | PNG → AVIF         |
| `/tools/pdf-to-png/`       | PDF → PNG          |
| `/tools/pdf-to-jpg/`       | PDF → JPG          |
| `/tools/image-compressor/` | 常见图片 → WebP    |

入口包含实际工作区、操作说明、格式限制及相关工具链接。预设只作用于从当前入口新添加且符合输入类型的文件，不覆盖队列内已有文件和用户选择。压缩页允许调整输出与画质，不保证每个文件都会变小。PDF 页面明确 144 DPI、100 MiB、200 页及其他资源限制，不宣称支持 OCR。

## 语言切换与队列

URL 是语言来源；浏览器保存的偏好不能覆盖明确的语言 URL。根路径默认英语。

Paraglide 的一般路由文档建议语言切换使用完整导航；本项目使用 SvelteKit `goto`，导航后重建翻译界面，并保留模块中的文件、结果和 Worker，因为完整刷新会丢失本地转换队列。当前页面的 load 数据没有语言相关业务状态。浏览器测试覆盖转换中切换语言、完成结果保留、前进后退和格式预设。将来加入语言相关服务端数据或新根布局状态时，必须重新审查这一约束。

首次水合直接采用 URL 语言，避免先以英语初始化 store，再重建已有中文界面。页脚提供可抓取的原生语言链接；正常点击保持单页导航，修饰键与新标签页行为仍由浏览器处理。

## 加载与容量

- ImageMagick、Pandoc 在首次实际转换时下载，浏览页面、添加文件不下载编码引擎。Service Worker 不再安装时预取 Pandoc。
- 同一引擎的并发下载合并；单个任务取消不打断其他任务，最后一个任务取消会中止下载。失败后可重试，有下载期限和 HTTP / WASM 文件头校验。
- 音频元数据解析改为添加音频时动态导入；Host Grotesk 字体使用 `font-display: swap`。
- 移除首页反复申请大块 ArrayBuffer 的容量探测。支持的单文件缓冲上限采用 2 GiB 减 2 MiB，并保留旧缓存中更低的有效上限。此数值不等于设备可用内存，小内存设备仍可能无法转换更小文件；各引擎原有资源限制继续生效。

## HTTP 与域名

Pages 使用独立 `404.html`，未知地址返回真实 HTTP 404 和 `noindex`；Nginx 同样改为 404，不再把不存在的地址映射成首页 200。正常多语言深层链接由预渲染文件直接提供。

`z8work.pages.dev` 及其预览子域通过 `_headers` 返回 `X-Robots-Tag: noindex`，避免临时部署域参与收录。这个规则不作用于 `z8.work`。域名尚未切换时不强制把 Pages 访问者重定向到旧网站。

截至 2026-09-08，Pages 已关联 `z8.work`，但域名状态仍为 pending / CNAME record not set，正式域名仍提供旧站。当前 Cloudflare OAuth 可以部署 Pages，DNS API 返回 403，因此未修改 DNS。需在 Cloudflare 的 z8.work 区域将根记录设为 CNAME：`@ → z8work.pages.dev`，处理同名旧记录，并等待 Pages 域名与证书状态 active。不要仅凭部署成功宣称正式域名已经上线。

Google Search Console 需要站点所有者的账号验证。当前没有 Google 账号连接或验证值，未代为验证或提交。域名切换后，建议建立域名属性、完成 DNS 验证，再提交 `https://z8.work/sitemap.xml`，检查首页及四种语言代表页面。之后以实际展示、点击和 Core Web Vitals 数据继续优化，不承诺排名。

## 验证与 review

可复现命令：

```bash
npm run build:pages
npm run check
npm test
npm run lint:changed
npm run test:seo
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
# 另启 wrangler pages dev build-pages --port 5196
CHROMIUM_PATH=/usr/bin/chromium npm run test:pages
```

- 180 项单元测试通过，包括共享下载的取消、失败重试、超时、非法响应和缓冲上限边界。
- `svelte-check`：0 errors / 0 warnings；变更文件格式与 ESLint 检查通过。
- 195 个生成页面检查通过：唯一标题、描述、H1、语言、canonical、收录范围、语言替代链接、JSON-LD 和 44 条 sitemap URL。
- 12 组 Chromium 回归通过，包括资源释放、音频、PDF 23 种输出、两个 PDF 引擎下载失败重试、格式选择、像素保真，以及新增 SEO 导航测试。
- Pages 本地运行时验证通过：未知地址 HTTP 404、引擎解压后哈希一致、HEAD / 304、真实文档转换和 Service Worker 离线缓存。
- 320 / 390 / 1366 像素宽度及深浅主题检查；修复首页工作区与工具入口并排、说明区缺少边距，以及工具链接样式误作用于图标导致文字挤窄的问题。
- 复查移除了重复 metadata、首次语言水合导致的界面重建，以及启动时的大内存分配探测。未扩大上传权限或加入第三方统计。

## 性能测量的边界

本地生产构建、Lighthouse 13.4.1、移动端默认模拟限速：SEO / Accessibility / Best Practices 均为 100，Performance 为 69，FCP 3.0 秒、LCP 10.9 秒、TBT 0 毫秒、CLS 0。没有把这个结果描述为性能优化已全部完成；当前共享业务与多语言 JavaScript 仍较大，后续需要继续拆分首屏依赖，并在正式域名获得真实访问数据后验证。此处是本地实验室测量，不是线上用户 Core Web Vitals，也没有可据此报告的真实 INP。

系统 Chromium 149 与本次 Lighthouse 的协议连接两次失败；改用环境中已有的 Playwright Chromium 后完成审计。启动内存探测的移除有独立代码依据，不把协议错误归因于该探测。

参考：[Google 多语言页面](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)、[规范网址](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[Paraglide SvelteKit](https://paraglidejs.com/sveltekit)、[Pages 页面与 404](https://developers.cloudflare.com/pages/configuration/serving-pages/)、[Pages 响应头](https://developers.cloudflare.com/pages/configuration/headers/)。
