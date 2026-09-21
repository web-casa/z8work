# 隐私/支持公开页部署证据清单

更新：2026-09-21（已执行部署；字节证据被 zone 设置阻塞，见文末执行记录）。目标：把已定稿的双语隐私与支持页部署到 `https://z8.work/`，并形成发行门禁与商店提交评估都认可的部署证据。

## 1. 背景与当前状态

- 页面源：`packaging/desktop-web/content.json`（en / zh-Hans × privacy / support，内容已更新为当前 WASM 桌面架构）。
- 静态产物：`scripts/desktop-web-pages.mjs` 渲染到 `static/desktop-info/{locale}/{kind}/index.html`，随 SvelteKit `static/` 目录进入 `z8.work` 网站构建。
- `packaging/desktop/store/submission.json` 的 `publicPages.status` 当前为 `not-deployed`（如实记录）。
- 本轮已修复：验证脚本与提交评估的期望摘要现按实际部署来源（web content）计算，并有回归测试防止回退（`desktop/tests/store.test.mjs`）。

## 2. 部署前（本地）

| #   | 步骤         | 命令                                                                                                                          | 通过标准                                             |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | 页面无 drift | `node scripts/desktop-web-pages.mjs --check`                                                                                  | 四个文件与 content.json 渲染逐字节一致               |
| 2   | 测试回归     | `npm test`（含 `desktop/tests/store.test.mjs`）                                                                               | 全部通过                                             |
| 3   | 记录内容基准 | `node scripts/desktop-store-verify-pages.mjs --output <tmp>`（部署前会失败 exit 1，但输出中 `expectedSha256` 即四页基准摘要） | 把四个 `expectedSha256` 记入证据目录 `baseline.json` |

## 3. 部署（外部动作，需所有者执行/授权）

1. 将包含最新 `static/desktop-info/**` 的 `z8.work` 构建发布到生产。
2. 四个最终 URL（由 `content.json` 的 `website` 与 `pagePath` 决定，无重定向）：
    - `https://z8.work/desktop-info/en/privacy/`
    - `https://z8.work/desktop-info/en/support/`
    - `https://z8.work/desktop-info/zh-Hans/privacy/`
    - `https://z8.work/desktop-info/zh-Hans/support/`

## 4. 部署后验证与证据

1. 建证据目录：`docs/desktop/evidence/public-pages-<部署日期>/`。
2. 运行只读验证（脚本只做 GET + 摘要比对，`--output` 已存在时拒绝写入）：

    ```sh
    node scripts/desktop-store-verify-pages.mjs --output docs/desktop/evidence/public-pages-<日期>/pages-verification.json
    ```

    通过标准：`status: "passed"`；四页 `match: true`、`status: 200`、`sha256 === expectedSha256`；报告含 `checkedAt` 时间戳。失败时退出码 1，如实记录失败原因，不得改用人工"目测通过"。

3. 把证据绑定进提交源（`packaging/desktop/store/submission.json`）：

    ```json
    "publicPages": {
      "status": "verified",
      "evidence": { "file": "<相对仓库的证据 JSON 路径>", "sha256": "<该文件 SHA-256>" }
    }
    ```

    注意 `evidence` 必须是 `{file, sha256}` 哈希引用，评估器会核对该文件摘要与其中每页 URL/200/摘要。

4. 复核：`node scripts/desktop-store.mjs` 报告中四个页面的 `deployment` 变为 `verified`；`assessChannel` 不再出现 "not been deployed and verified" 阻塞（其余候选/截图等阻塞按当时状态如实保留）。

## 5. 边界

- 本清单不请求也不记录任何秘密。
- 验证只证明"生产 URL 的字节与仓库渲染一致"；页面内容的法律/文案审阅属于所有者职责。
- 若部署后 content.json 再改动，必须重复 §2–§4（旧证据会因摘要不匹配被判 stale，这是有意设计）。

## 6. 部署时机的决定（所有者 2026-09-21 授权代理决定，已定）

- **一次站点部署同时带出**：更新后的隐私/支持页 + 新增的 `/desktop-source/` 源码下载页（见 [SOURCE_RELEASE_PLAN](SOURCE_RELEASE_PLAN.md) §5）。
- **前置条件**：GitHub Release `desktop-source-1`（五套归档 + `SHA256SUMS`）已上传并复算摘要一致（五归档逐字节复算；`SHA256SUMS` 随下载获取）。顺序不能反，否则下载页链接 404。
- **时间窗**：下一次获得授权的 z8.work 生产部署即执行，不再单独等待；部署后立即按 §4 完成验证与证据归档。
- 部署本身仍是外部动作（需要生产部署凭据），由所有者执行或明确授权后执行；本清单的本地步骤保持可逆。

## 7. 执行记录（2026-09-21，所有者授权后）

- 部署已完成：GitHub Release `desktop-source-1` 先行发布（6 资产重下载复算通过），随后 Cloudflare Pages 项目 `z8work` 以 `--branch main` 部署到生产；五个目标 URL 与 `/desktop-source/` 均 200，站点整体健康（详情见 `docs/desktop/evidence/public-pages-20260921/deployment-record.md`）。
- `pages-verification.json` 为 `failed`：zone 的 Email Address Obfuscation 改写页面内邮箱链接，字节证据无法生成；现有凭据无权关闭该设置。`submission.json` 因此**保持 `not-deployed`**（如实），`desktop/tests/store.test.mjs` 的现有断言不需改动。
- 收尾三步（关闭该 zone 设置后）见 deployment-record.md 末节；完成后门禁中"公开页"相关阻塞才会消除。
