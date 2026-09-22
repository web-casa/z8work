# Linux 取消排队项与当前任务完成验收

日期：2026-09-14。承接[全部取消与显式重试验收](LINUX_CANCEL_ALL_ACCEPTANCE.md)，补齐单独取消排队项时对当前转换的影响。本轮复用固定 deb，不修改生产队列、转换算法或安装包。

后续[转换中清空列表验收](LINUX_CLEAR_ACTIVE_ACCEPTANCE.md)扩展到二十四组门禁；本页保留原二十二组覆盖范围。

## 实现与 review

新增 `desktop-packaged-cancel-queued.mjs`，复用已有 AVIF 真实编码进程的 SIGSTOP 夹具。第一项是合成 PNG → AVIF，第二项是微型 PNG → WebP；通过第二项可见的 `Cancel task` 按钮聚焦并发送 Return，取消该排队项。

验收要求：

- 第二项变为 cancelled、无结果，第一项仍 running，processing 为 true；实际 AVIF 编码进程仍处于注入的暂停状态，应用保持运行，未新增文件。
- 测试解除 SIGSTOP 后，不再提交转换。第一项必须以原 attempt=1 正常保存；第二项保持 cancelled、attempt=1、无结果。
- 已观测编码进程正常结束。新文件带 AVIF 标识，由随包 ImageMagick 实际读取，回读尺寸与源 PNG 相同。
- 输出目录精确新增一个 AVIF，不能产生第二项的 WebP 或多余临时文件；两份输入和既有结果字节不变。清空后 AVIF 保留，外层卸载检查继续核对摘要。

Review 重点：

1. 取消目标由任务 ID 和行内可见按钮限定，不通过 IPC 直接取消，不使用全部取消按钮。
2. 分别记录暂停期间和解除暂停后两个状态。单靠 running 文案不足以证明转换可继续，因此要求同一次实际编码完成，不允许用重新提交掩盖受损任务。
3. 使用既有进程身份校验发送 SIGCONT，不把测试释放暂停描述为产品提供暂停/恢复功能。
4. AVIF 检查包含容器标识、实际尺寸读取和目录/字节核对；随包 ImageMagick 回读不是独立解码器交叉画质验证，也不将本测试作为压缩率或性能基准。
5. 当前门禁扩展为完整二十二组，旧二十组、缺项、重复项及错误应用身份均不能通过；此前取消、退出和保存恢复场景继续执行。

本轮未发现需修改生产代码的缺陷，交付内容为最终包业务验收覆盖。

## 验证记录

工具提交 `50f37d2`。本机 Debian 13 ARM64 从固定 deb 解包运行，二十二组 GUI 检查通过；213 项脚本测试、修改文件 ESLint、Prettier 及差异检查通过。未在宿主机安装或卸载应用。

双架构 CI：[34805082977](https://github.com/web-casa/z8work/actions/runs/34805082977)，两个原生 runner 均通过。

| 环境                      | 范围                               | 结果 |
| ------------------------- | ---------------------------------- | ---- |
| 本机 Debian 13 ARM64      | 固定 deb 解包、二十二组 GUI        | 通过 |
| GitHub Ubuntu 24.04 AMD64 | 安装、二十二组 GUI、卸载后结果保留 | 通过 |
| GitHub Ubuntu 24.04 ARM64 | 安装、二十二组 GUI、卸载后结果保留 | 通过 |

最终包与应用哈希、工具提交、两项任务的状态与 attempt 已复核。两架构 AVIF 回读尺寸均为 2048 × 2048，结果摘要与卸载后保留文件一致；实际界面截图已走查。

证据：[linux-skip-20260914](evidence/linux-skip-20260914/)。保存取消前、取消排队项后、当前任务完成后的原始快照，编码进程、回读尺寸、结果摘要和截图。合成大图不复制进文档仓库。

复现入口：

```sh
gh workflow run desktop-builds.yml --ref fix/windows-pdf-path -f target=linux-gui
```

## 边界

本轮仍含 SIGSTOP/SIGCONT 故障注入，覆盖一项活动 AVIF 加一项排队 WebP。不是自然编码性能测试，不替代其他引擎、大批次、取消临近发布的竞态、升级、Wayland、Snap strict、Windows/macOS GUI 或商店审核；R6 其他缺项继续单列。
