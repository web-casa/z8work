# Cloudflare Pages 部署

项目使用 SvelteKit 静态适配器，Cloudflare Pages 项目名为 `z8work`，关联 GitHub 仓库 `web-casa/z8work`。生产分支为 `main`，生产域名为 `z8.work`。

## 构建设置

| 设置     | 值                    |
| -------- | --------------------- |
| Node.js  | `22.22.2`             |
| Bun      | `1.4.0`               |
| 构建命令 | `npm run build:pages` |
| 输出目录 | `build-pages`         |
| 根目录   | 仓库根目录            |

通过 Pages 的环境变量 `NODE_VERSION` 和 `BUN_VERSION` 固定工具版本。`scripts/build-pages.mjs` 为干净的 Git 构建补齐公开环境变量，并固定 `PUB_ENV=production`，不需要上传本地 `.env`。如需关闭关于页面的自动 GitHub 请求，在 Pages 构建环境设置 `PUB_DISABLE_ALL_EXTERNAL_REQUESTS=true`；转换引擎始终来自本站。

## 大型 WASM 资源

Pages 的[单资源上限为 25 MiB](https://developers.cloudflare.com/pages/platform/limits/)。当前 Pandoc 约 50.44 MiB、FFmpeg 约 30.74 MiB，无法直接上传。

`prepare-pages.mjs` 保留普通 `build/`，另建 `build-pages/`，将超过限制的 WASM 无损 gzip 压缩为 `.wasm.gz`。当前发布大小约 13.89 MiB 和 9.78 MiB；其他资源保持原样。不能压缩至限制内的资源会使构建失败。

生成的 Pages Worker 只处理这两个引擎原本的 URL，流式返回压缩资源。它使用官方 [Response `encodeBody: "manual"`](https://developers.cloudflare.com/workers/runtime-apis/response/) 避免重复压缩，浏览器自动解码，转换代码与 Service Worker 无需改动。Worker 不读取用户文件，只接受 GET/HEAD；不提供上传或服务端转换接口。

`_routes.json` 只将这些引擎 URL 交给 Worker，普通页面、图片、脚本和其他引擎由 Pages 静态托管。两个引擎请求会计入 [Pages Functions / Workers 配额](https://developers.cloudflare.com/pages/functions/pricing/)，访问量增长时需要关注账户用量；没有配置 R2 或额外付费存储。Pandoc 使用 ETag 在线重新验证，带版本指纹的 FFmpeg 使用长期缓存。

不要直接将 `.wasm` 替换为 gzip 后仅在 `_headers` 设置 `Content-Encoding`：Pages 的自动压缩可能导致重复编码。`build-pages` 必须连同生成的 `_worker.js` 和 `_routes.json` 完整部署。

## 本地验证与手动发布

```bash
bun install --frozen-lockfile
npm run build:pages
bunx wrangler@4.129.0 pages dev build-pages --port 5196
```

另一个终端验证 Pages 运行时、引擎字节一致性、文档转换、离线引擎缓存，以及现有浏览器回归：

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run test:pages
CHROMIUM_PATH=/usr/bin/chromium IIPE_TEST_BASE=http://localhost:5196 npm run test:browser
```

已登录 Cloudflare 的环境可以手动发布预览，账户有多个时需要设置目标 `CLOUDFLARE_ACCOUNT_ID`：

```bash
bunx wrangler@4.129.0 pages deploy build-pages --project-name z8work --branch pages-preview
```

正式发布优先推送 `main`，由 Pages 的 Git 集成构建并部署。不要把普通 `build/` 上传到 Pages；普通 Nginx/Docker 部署仍使用 `npm run build` 及 `build/`。

## 自定义域名

在 Pages 项目中添加 `z8.work`，并将该域名的 DNS 指向项目实际的 `pages.dev` 地址。Pages 域名关联、DNS 生效、证书签发都完成后，才能将自定义域名视为上线；仅创建 Pages 域名关联不代表 DNS 已完成。
