# Linux 活动任务移除与队列继续验收

日期：2026-09-14。承接[单项暂存任务移除验收](LINUX_REMOVE_UNSAVED_ACCEPTANCE.md)，补齐正在编码时移除该任务、后续排队任务继续保存的固定 deb GUI 回归。

## 实现与 review

复用活动编码夹具及 `desktop-packaged-cancel-current.mjs`，新增 `remove-current` 分支。夹具确认应用所属 AVIF 编码进程的 PID、启动时间、父进程、可执行文件和命令参数，使用 SIGSTOP 保持第一项 running，同时第二项 WebP queued。通过可见 `Remove task` 按钮聚焦并发送 Return。

要求第二项自动完成保存，不手动恢复编码进程或重新提交队列：

- 第一项记录消失，仅剩原排队任务；后者 ID 不变、attempt=1、状态 saved，epoch 不变。
- processing、clearing、closing 均为 false；输出目录及授权保持，同一应用进程仍存活。
- 已观测 AVIF 编码进程在测试清理之前退出。
- 保存结果具有 WebP 头且经 WebKit 实际解码，尺寸匹配第二项原图；结果目录仅增加此文件，两个输入及已有结果逐字节不变。
- 最后清空列表不删除新结果；外层卸载后继续核对其摘要。

Review 重点：

1. 复用编码进程及结果检查流程，显式区分取消和移除的断言。取消仍保留 cancelled 记录，移除必须删除记录；原取消场景继续独立回归。
2. 活动处理函数映射同时负责允许项检查和分发，新动作不会遗漏在另一份名单；分发变量由 `checkCancel` 改为 `checkAction`，覆盖清空和移除的实际用途。
3. 故障注入只针对已核实属于测试应用的编码进程；成功必须先观察进程退出，finally 清理不能替代通过证据。
4. 保持报告名和场景文件目录独立；原取消报告字段和检查名保持兼容。
5. 门禁新增两项，要求完整三十项，拒绝旧二十八项、缺项、重复项及错误状态/架构/应用哈希。

## 验证记录

工具提交 `248e162`。本机 Debian 13 ARM64 使用固定 deb 解包后的应用，三十项 GUI 回归及 213 项脚本测试通过；修改文件 ESLint、Prettier 和差异检查通过。未在宿主机安装或卸载应用；独立核对了实际 deb、应用及保存结果哈希。本机和双架构回归均未发现需要修改生产逻辑的缺陷。

双架构 CI：[34813471269](https://github.com/web-casa/z8work/actions/runs/34813471269)，两项原生架构作业均通过。

| 环境               | GUI 门禁 | 安装与卸载 | 原排队任务保存   |
| ------------------ | -------- | ---------- | ---------------- |
| Ubuntu 24.04 AMD64 | 30/30    | 通过       | WebP 32×32，82 B |
| Ubuntu 24.04 ARM64 | 30/30    | 通过       | WebP 32×32，82 B |

下载原始报告后独立核对固定 deb 与应用哈希、工具提交、三十项门禁、移除前后任务快照、编码进程退出及卸载后结果摘要，均通过。人工查看两个架构截图，均仅保留已保存的 queued.png，显示 Saved · Attempt 1。包来源仍为固定构建 `34769213214`，没有重建或发布新安装包。

证据：[linux-remove-current-20260914](evidence/linux-remove-current-20260914/)。

复现：

```sh
gh workflow run desktop-builds.yml --ref fix/windows-pdf-path -f target=linux-gui
```

## 边界

新增场景含 SIGSTOP 注入，覆盖一项活动 AVIF 加一项排队 WebP；不代表自然编码性能、大批次、移除排队任务、保存中移除、多页 PDF、升级、Snap strict、Windows/macOS GUI 或商店验收。生产代码及安装包本轮不变，R6 整体仍有缺项。
