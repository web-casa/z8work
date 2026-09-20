# 网页转换版 macOS ARM64 验收与签名

日期：2026-09-20。范围为 macOS 直发候选；没有创建 GitHub Release 或提交商店。

## 已发现并修复

真实 macOS 15 ARM64 GUI 在旧预览上复现：队列有转换结果时，Cmd-Q 直接退出，绕过窗口关闭确认。原因为只监听窗口关闭，未接管应用级 `ExitRequested`。

修复将应用退出转交现有窗口关闭确认；前端确认后通过 `finish_close` 明确批准退出。空队列直接批准，重复请求共享同一确认，取消后仍可重新请求退出。去掉前端直接销毁窗口的权限。

复现运行：[35503756301](https://github.com/web-casa/z8work/actions/runs/35503756301)。该运行仅为基础探测成功，**不代表退出验收通过**；报告记录 `exited-without-confirmation`。此前两次失败为 AX 格式控件定位错误，已根据系统实际控件树修正。

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

候选重新构建及完整 GUI 验收进行中；签名、公证及最终 DMG 验收尚未完成。完成后在此记录确切运行、产物和哈希。
