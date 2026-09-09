# V1 桌面发行与恢复手册（待验收）

日期：2026-09-10。产品 Z8.Work，网站 `https://z8.work/`，支持邮箱 `contact@web.casa`，源码 `https://github.com/web-casa/z8work`。**当前是预备交接，不能据此上传或宣布 V1 完成。** 本轮门禁与 review 见 [Phase 30](PHASE30_IMPLEMENTATION.md)。

## 当前候选及必须补齐的输入

| 目标                    | 当前本地记录                                                                 | 发行前必须补齐                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Linux ARM64 本地验证    | [R6 写入失败补测与新候选](PHASE29_WRITE_FAILURES.md)，包含最近共享 Rust 修复 | 仅供本机回归，不能替代 AMD64 strict 验收                                                             |
| Windows x64 MSIX        | [Phase 28 包及合成升级输入](PHASE28_CANDIDATES.md)                           | 纳入 Phase 29 修复后重建；原生安装、WebView2、GUI/转换、退出、升级卸载、WACK、正式身份和截图         |
| Linux AMD64 Snap        | [Phase 28 Snap](PHASE28_CANDIDATES.md)，引擎仿真转换证据单独记录             | 纳入 Phase 29 修复后重建；strict 桌面、portal 授权、断网、refresh、数据/卸载、真实目标截图及升级输入 |
| macOS ARM64 本地 `.app` | 组装和门禁工具存在，实际包未生成                                             | 实际原生引擎/动态依赖、签名、最低支持系统和干净账户、文件授权、转换/退出/版本替换                    |

另有跨端门槛：PDF ICC、完整对应源码/依赖许可、目标机器性能，以及 R6 剩余真实故障。当前 `redistributionApproved` 全部保持 false。Store Identity/Publisher、正式版本、定价/分级及 Snap 注册名取自实际账户，不从开发身份推导。此前的本地包版本不是已上架版本。

本轮核对本地候选原件摘要见 `evidence/phase30/candidate-inventory.json`。这不是新的安装证明，也不冻结任何历史包。以后签名、重打包或代码变化均必须生成新摘要和对应报告，不能覆盖旧报告。

## 受审材料与门禁操作

在仓库根目录执行，选择不存在的新输出目录：

```bash
node scripts/desktop-store.mjs --check-pages \
  --output .desktop-local/release-review-next --require-ready
```

当前应返回 1，列出材料和验收缺项；不得移除 `--require-ready` 来制造“发行通过”。不带该选项允许生成未就绪草稿，报告仍为 blocked。

独立候选检查使用已有命令的 `--artifact`、`--file`、`--evidence`，可用 `--root` 指定证据引用根目录。所有引用文件只能位于该根目录之内。该 CLI 只校验证据对应关系；完整商店门禁还检查构建类型、分发批准、身份、截图和公开页面，二者都不提供密码学发布者保证。

验收摘要仍采用 schema 1，增加必填 `sourceCommit`（完整 40 位 Git 提交）。必需项为：`integrity`、`conversion`、`gui`、`install`、`upgrade`、`uninstall`、`licenses`、`faults`、`performance`；Snap 另有 `strict-confinement`、`portal`，Microsoft Store 另有 `identity`、`webview2`、`wack`，macOS 另有 `signature`。

每个 `checks.<name>` 必须是 passed 并引用 `{file, sha256}`。被引用的 JSON 包含以下字段：

| 字段                 | 必需值/意义                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `schema` / `status`  | `1` / `passed`                                                                                      |
| `check` / `artifact` | 确切检查名称和产物矩阵 ID                                                                           |
| `artifactSha256`     | 当前最终候选 SHA-256                                                                                |
| `sourceCommit`       | 与摘要中的源码提交一致                                                                              |
| `os` / `arch`        | 与产物矩阵一致                                                                                      |
| `execution`          | 运行类检查为 `native`；完整性/许可/身份/签名可为 `native`、`static` 或 `manual`                     |
| `evidence`           | 1–64 个 `{file, sha256}` 原始证据引用，单文件最多 8 MiB；超大日志整理为有界证据文件，并保留原件位置 |

这里是项目自己的验收协议，不是 Microsoft/Snap API。现有平台脚本的原始报告保持原样：由审阅者在实际验收后编写逐项摘要并引用原件，不能只为满足字段添加 passed。完整故障报告必须覆盖 R6 必需范围；Phase 29 基础及新增文件大小限制故障仍不足以代表整个 `faults` 验收。性能报告应使用已冻结配置、阈值与实际测量，不能只写“速度正常”。

实际源码需结合构建时收据和干净提交核对。不同提交之间只核对文字标签不足以证明字节相同；未提交变更必须逐文件审阅，工具或文档差异与应用/引擎差异分开记录。门禁能检测摘要与报告之间的提交不一致，但不会自动证明二进制的构建来源。

## 安装、保存失败与数据恢复

1. 只在目标系统测试账户使用对应候选。先核对包哈希、系统/架构、开发身份和所需运行时，再按已有 [Windows/Snap/macOS 交接](PHASE28_CANDIDATES.md)执行。不要从“本地包能解压”推导“普通用户能安装”。
2. 转换成功但保存失败，且界面提供“重试保存”时，重新选择空间充足、有写权限的目录。保留结果时只执行保存；取消选择可稍后重试。先保存待保存任务，再退出或升级。
3. 暂存仅本次进程会话有效，空闲 30 分钟、单文件 256 MiB、总计 1 GiB。重启不恢复可信暂存；需重新授权输入/输出并转换。缓存过期/损坏/超预算时按提示重新转换。PDF 使用独立页面恢复流程。
4. 异常退出后先检查结果目录：结果可能已经保存，而历史尚未写入。不要批量删除不认识的输出文件。重新授权后重试，比较结果并保留原件。
5. 更换版本前完全退出应用，在测试副本上备份应用数据与必要结果。备份含文件名和路径，不作为公开 issue 附件。历史 schema 1/2 升到 3 会保留原始备份；已有不同字节的同名备份会阻断迁移，不能直接删除备份“解决”。
6. 回退程序版本不等于恢复历史数据。旧程序可能拒绝新 schema；应在独立测试数据副本验证旧程序与旧备份的组合，不能覆盖唯一当前数据。Snap 的包管理器恢复也不能替代用户输出文件备份。MS Store 对已收到高版本的用户，修复通常需要更高版本；撤回新包不等同于已安装用户自动降级。
7. 清空列表不会删除原图、保存结果或迁移备份。卸载后的数据与包管理器快照按实际目标验收记录处理，不承诺自动擦除所有副本。

Windows 修复/回退说明依据 [Microsoft 包版本和回退规则](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)，Snap 更新依据 [官方更新说明](https://snapcraft.io/docs/how-to-guides/manage-snaps/manage-updates/)。实施恢复前以实际包身份、版本及数据位置为准。

## 页面与最终提交顺序

已更新的四个页面位于 `static/desktop-info/{en,zh-Hans}/{privacy,support}/index.html`。本机浏览器验证通过；2026-09-10 只读检查对应生产 URL 均为 404。因此 `submission.json` 的 `publicPages` 仍保持未部署，未填写虚构成功报告。

完成网页部署后，运行 `node scripts/desktop-store-verify-pages.mjs --output` 并提供一个不存在的新报告文件。必须得到四个 HTTP 200 且正文摘要匹配，再将真实报告作为公开页面证据。根域名可访问不等于桌面支持 URL 已存在。

最终顺序：补齐 R5 候选和许可 → 三端 R6 安装/业务/故障/性能 → 核对源码和最终包 → 收集目标候选双语截图 → 复核账户和公开页面 → 运行本地门禁与人工 review → 按届时明确授权提交。上传、审核和用户可下载分别记录外部 ID 与状态。

本轮不增加新渠道或格式，不以继续增加本地工具替代剩余实机验收。后续仍在 R5–R7 内补齐以上缺项。
