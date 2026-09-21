# 公开对应源码交付计划与下载页

更新：2026-09-21（同日三次更新：**已发布**）。范围：五个随包 WASM 引擎的公开对应源码交付。**所有者于 2026-09-21 选定 GitHub Releases + z8.work 下载页并授权执行；release `desktop-source-1` 已于同日发布并经全量重下载复算 SHA-256 通过，z8.work 生产已部署 `/desktop-source/` 页面（部署与验证记录见 evidence/public-pages-20260921/）。`source-release.json` 状态已置 `published`，五个 `publishedUrl`/`publishedAt` 已记录。**

配套文件：

- 机器可读清单：[packaging/desktop-web/source-release.json](../../packaging/desktop-web/source-release.json)
- 校验/拼装脚本：`scripts/desktop-web-source-release.mjs`（`check` / `stage --output DIR`，只操作本地文件，无网络）
- 下载页生成器：`scripts/desktop-web-source-page.mjs`（渲染 [static/desktop-source/index.html](../../static/desktop-source/index.html)，`--check` 做 drift 检查；双语、无脚本、CSP 与 desktop-info 页一致）
- 许可审阅配套：[DISTRIBUTION_LICENSE_REVIEW](DISTRIBUTION_LICENSE_REVIEW.md)

## 1. 当前状态

- `source-release.json` 状态 `published`，`urlPlan.status = published`：标签 `desktop-source-1`，五个 `publishedUrl` 已记录并经重下载复算一致。
- 待发布目录已本地拼装：`.desktop-local/source-release-staging-20260921/`（约 1.51 GiB（1.62 GB），含五套归档 + `SHA256SUMS` + `README.txt`）。该目录在 Git 之外，可随时由脚本重建；`SHA256SUMS` 随归档一起作为 release 资产上传。
- z8.work 下载页 `static/desktop-source/index.html` 已生成并入库，内容直接渲染自清单（含五个最终下载 URL、完整 SHA-256、许可与 WASM 绑定）。应用关于页已加"对应源码"入口（web 与桌面渠道均可见；桌面 store 渠道不拦截 z8.work 链接）。
- 发行门禁 `node scripts/desktop-web-release.mjs check` 已全绿（`ready: true`，2026-09-21）：源码交付与许可批准两项十阻塞全部消除。

## 2. 摘要清单（与 SHA256SUMS 一致）

| 发布文件名                                             | 引擎                            | 字节数        | SHA-256                                                            |
| ------------------------------------------------------ | ------------------------------- | ------------- | ------------------------------------------------------------------ |
| z8work-pandoc-3.5-corresponding-source.tar.gz          | pandoc 3.5                      | 1,167,506,140 | `0d71a58d3440e62227ef5212f4b5ad484e735014fd4117a9fd638e8ee95b101e` |
| z8work-ffmpeg-core-0.12.10-corresponding-source.tar.gz | @ffmpeg/core 0.12.10            | 126,377,117   | `17546c1c151ef8e16578f213f9ae0c96381a19445819a213b47d2bd3fc93e663` |
| z8work-magick-wasm-0.0.43-corresponding-source.tar.gz  | @imagemagick/magick-wasm 0.0.43 | 192,143,363   | `f4e6e2dd716404916d01f4fc1eb54c35d1d4bdcd80993e94c582efc4535fc339` |
| z8work-mupdf-1.28.1-corresponding-source.tar.gz        | mupdf 1.28.1                    | 133,495,540   | `22f86f6e11d2bff9f9ca5664db48c2e0e4e905fe08b37ae483ccb08310345106` |
| z8work-vert-wasm-0.0.2-corresponding-source.tar.gz     | vert-wasm 0.0.2                 | 1,281,196     | `dca770d88cd72ab606a5be9a875c21eebd019d769ac5ee5a601f53bd5eb9ce78` |

每个归档绑定一个随包 WASM 的精确 SHA-256（`source-release.json` 的 `wasmSha256` 字段，与 `engines.json` 一致）：

- pandoc → `e12460b4b7ae74829da41b77b97531ca2eeebbcaf2362d0e1912948b59c21e09`（`static/pandoc.wasm`）
- @ffmpeg/core → `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`
- @imagemagick/magick-wasm → `5a4ed1017eda113144c86ae839c22c610afebcfebfa22b1da18e00e98d78b0f7`
- mupdf → `5a30ef7b027f541ea8fc54e7c73f16414b0b59940741a12efe5e55f1fd0a99d7`
- vert-wasm → `5ce6cbfaf8701c82e8dc16a887e01793db962b407897e870849135fe81e24239`

## 3. 发布目录布局（已拼装并发布）

```
<发布根>/
├── SHA256SUMS
├── README.txt
├── z8work-pandoc-3.5-corresponding-source.tar.gz
├── z8work-ffmpeg-core-0.12.10-corresponding-source.tar.gz
├── z8work-magick-wasm-0.0.43-corresponding-source.tar.gz
├── z8work-mupdf-1.28.1-corresponding-source.tar.gz
└── z8work-vert-wasm-0.0.2-corresponding-source.tar.gz
```

复现命令（本地、可逆）：

```sh
node scripts/desktop-web-source-release.mjs check
node scripts/desktop-web-source-release.mjs stage --output .desktop-local/source-release-staging-20260921
```

`stage` 会先核对清单与目录、证据 `archiveSha256`、实际归档摘要和大小，全部通过才创建输出；失败不产生半成品。

## 4. 保留策略

- 桌面分发的任何二进制一旦绑定某套归档，该归档及其字节必须长期可获取（不低于对应桌面版本的可下载期，建议永久）。
- 若需要替换归档内容（例如补充遗漏文件），以新文件名发布新版本并在 `source-release.json` 记录取代关系；**已发布字节不可变更**。
- 本地最终归档（`.desktop-local/` 五套）与 staging 目录同样保留；`SHA256SUMS` 是唯一认可的摘要记录，不要手改。

## 5. z8.work 下载页（已生成并部署到生产）

页面不再用手写草案：`scripts/desktop-web-source-page.mjs` 直接从 `source-release.json` + `engines.json` 渲染 [static/desktop-source/index.html](../../static/desktop-source/index.html)，包含：

- 每个归档的最终下载 URL（由 `urlPlan.pattern` + `releaseTag` 解析；若设置了 `publishedUrl` 则优先）、字节数、完整 SHA-256、许可、对应 WASM 摘要与源码提交；
- `SHA256SUMS` 资产链接与 `sha256sum -c` 核验说明；
- 应用自身 AGPL-3.0 与 GitHub 源码链接、联系方式；
- 与 desktop-info 页一致的样式：无脚本、内联 CSP、`noindex,follow`、双语。

生成与检查：

```sh
node scripts/desktop-web-source-page.mjs          # 重新生成
node scripts/desktop-web-source-page.mjs --check  # drift 检查（tests 亦覆盖）
```

测试（`tests/desktop-web-source-release.test.mjs`）断言入库页面与渲染输出逐字节一致、无脚本标签、URL 解析正确；`publishedUrl` 设置后渲染自动切换。

## 6. 发布顺序（所有者已定方向；上传与部署是外部动作）

1. **上传 GitHub Release**（已完成 2026-09-21，所有者授权执行）：标签 `desktop-source-1`，五套归档 + `SHA256SUMS`；上传后全量重下载复算 SHA-256，与 `source-release.json` 完全一致（日志见 evidence/public-pages-20260921/release-asset-redownload-verification.log）。
2. **部署 z8.work 站点**（已完成 2026-09-21）：`/desktop-source/` 与四个隐私/支持页均已上线；`desktop-store-verify-pages.mjs` 的字节证据仍被 zone Email Obfuscation 阻塞（见 [PUBLIC_PAGES_DEPLOYMENT_CHECKLIST](PUBLIC_PAGES_DEPLOYMENT_CHECKLIST.md) §7）。
3. **（已完成 2026-09-21）** 五个 `sourceDelivery` 已置 `published` + 最终 URL；`source-release.json` 已记录 `publishedUrl`/`publishedAt`。
4. **（已完成 2026-09-21）** 所有者批准分发许可，五个 `distributionReview.status` 已置 `approved`（记录见 DISTRIBUTION_LICENSE_REVIEW §7.2）。
5. **（已完成 2026-09-21）** 发行门禁已全绿：`node scripts/desktop-web-release.mjs check` 输出 `ready: true`。

注意顺序约束：**先上传 release，再部署站点页面**，否则 `/desktop-source/` 的下载链接会 404。
