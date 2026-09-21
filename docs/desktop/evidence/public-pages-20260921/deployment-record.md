# 公开页与源码下载页部署记录（2026-09-21）

## 部署事实

- GitHub Release：`web-casa/z8work` 标签 `desktop-source-1`，`published_at 2026-09-21T13:34:47Z`，目标提交 `28a19b3`，`--latest=false`。
- 资产：5 套归档 + `SHA256SUMS` 全部 `uploaded`，尺寸与 `source-release.json` 一致；随后全量重下载并 `sha256sum -c` 复算通过（见 `release-asset-redownload-verification.log`）。
- Cloudflare Pages 项目 `z8work`（账号 d21ea03ded5500cc6d6bb84f8f27b7d0）：`wrangler pages deploy build-pages --branch main`，部署 ID `85119729`（生产）与 `6988ad8b`（分支预览，先行验证用）。
- 生产验证（HTTP 200）：`/desktop-source/`、四个 `/desktop-info/{en,zh-Hans}/{privacy,support}/`、`/`、`/convert/`、`/about/`；`/pandoc.wasm` 经 Worker 以 `application/wasm` 正常提供。
- 下载页线上内容：6 个 release 下载链接与全部 SHA-256 未被改写；pandoc 归档 URL 实测 200。

## 未通过项（如实记录）

`scripts/desktop-store-verify-pages.mjs --output pages-verification.json` 返回 `failed`：四个 desktop-info 页面 HTTP 200 但字节摘要与仓库渲染不一致。原因（已实测定位）：z8.work zone 的 **Email Address Obfuscation** 把页面内 `mailto:contact@web.casa` 及可见邮箱改写为 `/cdn-cgi/l/email-protection#…`（并注入 `email-decode.min.js`），任何含邮箱的页面都无法与源渲染逐字节一致。

wrangler OAuth 凭据无 zone settings/rulesets 权限，无法由本次操作关闭该设置。

## 待所有者执行后的收尾

1. 在 Cloudflare 仪表盘为 z8.work 关闭 Email Obfuscation——建议用 Configuration Rule 仅对 `starts_with(http.request.uri.path, "/desktop-info/") or starts_with(http.request.uri.path, "/desktop-source/")` 生效 `email_obfuscation=off`；或整区关闭（站点级取舍由所有者定）。
2. 重跑：`node scripts/desktop-store-verify-pages.mjs --output docs/desktop/evidence/public-pages-<新目录>/pages-verification.json`。
3. `status: passed` 后把 `packaging/desktop/store/submission.json` 的 `publicPages` 改为 `verified` + 证据哈希引用，并按 `desktop/tests/store.test.mjs` 中对应断言同步测试预期。
