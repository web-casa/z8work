# 网页转换版 macOS ARM64 验收与签名

日期：2026-09-20。范围为 macOS 直发候选；没有创建 GitHub Release 或提交商店。

## 已发现并修复

真实 macOS 15 ARM64 GUI 在旧预览上复现：队列有转换结果时，Cmd-Q 直接退出，绕过窗口关闭确认。原因为只监听窗口关闭；且 macOS 默认退出菜单直接调用 `NSApplication.terminate`，绕过 Tauri 的 `ExitRequested`。

修复将 macOS 默认退出菜单替换为普通菜单项，经 `app.exit` 进入 `ExitRequested`，再转交现有窗口关闭确认；前端确认后通过 `finish_close` 明确批准退出。空队列直接批准，重复请求共享同一确认，取消后仍可重新请求退出。去掉前端直接销毁窗口的权限。

复现运行：[35503756301](https://github.com/web-casa/z8work/actions/runs/35503756301)。该运行仅为基础探测成功，**不代表退出验收通过**；报告记录 `exited-without-confirmation`。此前两次失败为 AX 格式控件定位错误，已根据系统实际控件树修正。

第二轮 [35504679501](https://github.com/web-casa/z8work/actions/runs/35504679501) 四类转换及批量保存均通过，确认仅增加 `ExitRequested` 仍不足以保护默认菜单退出。因此追加菜单修复后重新构建。

本地：189 项 JavaScript 测试、4 项 Rust 测试通过；Svelte 检查 0 errors / 0 warnings。新增退出测试覆盖取消、确认、空队列和重复请求。

## 候选与流水线

- `packaging/desktop-web/macos-candidate.json` 固定构建运行、源码和 ZIP SHA-256。
- `.github/workflows/desktop-web-macos-acceptance.yml` 先执行凭据预检和真实 GUI 回归。
- 提交标题包含 `[sign-macos]` 且两个前置任务成功时，才执行签名公证；同一 workflow 的重跑不会重新提交公证。
- 公证保存 submission ID 和提交前文件哈希；等待超时或失败时保留候选及报告，不自动重复提交。
- 最终 DMG 经签名、公证、staple、Gatekeeper 检查后，再挂载、安装到 `/Applications`，执行同一 GUI 回归。
- 签名 GUI 先安装、启动用户已试用的旧预览，再替换为签名候选。此步骤验证替换安装与启动，不等同于全部历史版本偏好迁移。

使用组织已有 Developer ID 证书及 Apple 认证，预检已成功。秘密仅进入 runner 临时钥匙串，不写入报告。

## GUI 检查范围

图片转换和独立解码、中文输入输出路径、打开/保存对话框取消、取消保存后重试、Markdown→HTML 内容、多页 PDF→ZIP 图片数量和尺寸、WAV→FLAC 时长/采样率及大于 1 MiB 的分块保存、双文件批量 ZIP、Cmd-Q/Cmd-W 取消保护、确认退出、重启和已保存文件保留、空队列退出。

真实磁盘满、断电、极端大文件/低内存和完整格式矩阵不在本轮 GUI 验收范围；已有保存故障单元测试不能替代这些系统故障测试。Windows/Linux 发行和商店提交也不在本轮范围。

## 最终结果

[验收与签名运行 35510545929](https://github.com/web-casa/z8work/actions/runs/35510545929) 全部成功。前置候选 12 项检查通过，最终签名 DMG 13 项检查通过（增加旧预览替换安装启动）。

| 项目                                    | 结果与证据                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------- |
| 渠道 / 架构                             | macOS 直发测试候选 / ARM64                                                 |
| 应用源码                                | `6f166c4a271a9cb49c1d5133efd038bf3bb8bc11`                                 |
| 构建                                    | [35505026289](https://github.com/web-casa/z8work/actions/runs/35505026289) |
| 验收工具源码                            | `07a805a417666d2e8a256239d72286c360bbf709`                                 |
| 最终文件                                | `Z8.Work-0.2.0-macos-arm64-signed.dmg`，35,947,531 字节                    |
| Developer ID / hardened runtime         | 通过                                                                       |
| Apple 公证                              | 通过：`Accepted`，ID `b2b8f368-5c07-4e78-9aa4-0323ae38eb94`                |
| Staple / Gatekeeper / DMG / 签名完整性  | 通过                                                                       |
| 签名 DMG 挂载安装、旧预览替换与实际 GUI | 通过；四类转换、批量保存、退出取消、确认退出及重启                         |
| 下载后 SHA-256 核对                     | 通过，与 runner 最终报告一致                                               |

最终 SHA-256（公证票据已附加）：

```text
16ea1be9b47cbbb3a0ae1414ebe8018581d027798ec5697e7b05173b1e899914
```

- [下载签名 DMG 与 SHA256SUMS](https://github.com/web-casa/z8work/actions/runs/35510545929/artifacts/10605097893)（Actions 产物保留 30 天）。
- [完整报告与截图](https://github.com/web-casa/z8work/actions/runs/35510545929/artifacts/10605156723)。
- [仓库内验收摘要](evidence/web-macos-arm64-20260920.json)。

本轮退出 GUI 覆盖应用菜单快捷键与窗口关闭；Dock 退出、系统注销及转换中强制终止未验收。签名测试候选仍沿用 0.2.0 / `work.z8.desktop.m0` / `Z8.Work Desktop Dev` 身份；公开发行及商店提交不属于本次交付。
