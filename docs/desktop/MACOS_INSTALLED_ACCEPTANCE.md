# macOS 已安装签名包使用验收

日期：2026-09-14。对应[剩余清单 M1](REMAINING_STATUS.md)。复用已完成签名、公证的 DMG，在 GitHub 原生 macOS 临时机器上安装到 `/Applications`，通过 LaunchServices 启动；使用系统 Accessibility API 操作实际窗口。没有重签应用、修改 TCC 数据库或开放内部测试 IPC。

## 候选与环境

| 架构          | 固定来源                                     | DMG SHA-256                                                        |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Apple Silicon | `34769210630 / macos-arm64-signed-notarized` | `f6057c69d3783f4548f1b75dd77490de0a0a8df699ed657b6ef7dee2e43b5596` |
| Intel         | `34769210630 / macos-amd64-signed-notarized` | `357fe4397c259f8a414885487103ad44702c3b9727f6001c276fc75ff1ae821f` |

候选来源、构建和签名证据见[六平台交付](FORMAT_EXPANSION_DELIVERY.md)。原生探测两台系统均为 macOS 15.7.9，辅助功能和截图权限已经可用。它们是新的 CI runner 会话，不代表用户首次下载的隔离属性提示、首次 TCC 授权或最低系统版本实测。

## 检查范围

1. 固定 DMG 哈希、已装订票据及容器 Gatekeeper 评估；只读挂载，拒绝覆盖已有应用；复制至 `/Applications` 后核对主程序哈希、完整签名和 Gatekeeper，再卸载 DMG。
2. LaunchServices 启动安装目录内应用，确认进程和原生窗口。
3. 原生输入选择器打开、取消，队列保持空；重新选择带中文和空格路径的合成 PNG。
4. 从真实格式控件选择 WebP；转换按钮触发输出选择器，取消后不产生结果。
5. 原生选择输出目录并实际转换。检查保存状态、WebP 文件头、macOS 位图解码尺寸以及原图字节不变。
6. 原生退出，再从安装目录启动；检查历史恢复、输入需要重新选择、输出目录需要重新授权，没有自动转换。
7. 清空列表后原图和保存结果仍在；原生退出后移除仅由本测试安装的副本，结果文件字节保持。

GUI 不使用网页 DOM 或队列 IPC。Swift 辅助程序通过实际控件角色和标签操作；窗口结构和截图作为原始证据保留。程序只允许 GitHub-hosted macOS 执行安装脚本，不能直接在个人 Mac 上运行该安装/清理入口。

## 实施与 review

- 首轮 `34815376471` 是环境与窗口结构探测：两架构均完成固定包检查、安装签名验证、LaunchServices 启动、读取窗口结构、正常退出及删除测试副本；脚本主动返回失败，明确“仅启动探测不是完整验收”。不计为应用故障或最终通过。
- 第二轮 `34815664164` 在 Swift 编译阶段失败，未进入新交互测试。测试代码误用了不可用的 `NSBitmapImageRep(contentsOfFile:)`；改用 Apple 文档中的 `init(data:)`，并移除已弃用的激活选项。
- 第三轮 `34815822989` 已通过 Swift 编译、安装、启动、输入选择器打开和取消，但文件路径自动输入后选择器未关闭；保留截图与窗口结构。测试侧改用定向按键事件和系统快捷键，并增加路径框中间快照；不据此断言生产转换逻辑有缺陷。
- 第四轮 `34816121972` 的中间快照确认“前往文件夹”已打开，但 `PathTextField` 的值仍为空。改为对实际原生文本框设置 AXValue，并回读完整路径后继续，取消对模拟 Unicode 按键的依赖。
- Review 修正重启预期：应用保留历史输出路径并提示重新授权，不应断言路径为空。
- 第五轮 `34816699026` 两架构基础使用流程均通过。最终 review 增加输出选择器取消后的 Ready 状态断言、归档实际 WebP 字节，并移除已弃用的模拟 Unicode 按键路径；第六轮对工具提交完整复跑（另见下方 Gatekeeper 拒绝记录）。
- 第六轮 `34816994966` ARM64 完整通过，Intel 在安装后 `spctl` 返回 `Unnotarized Developer ID`。DMG 和主程序哈希与之前通过的候选相同，拒绝原因尚不能仅凭一次结果归结为网络或应用缺陷。修正验收顺序：先 validate 已装订 DMG 票据并评估分发容器，再挂载安装、独立评估应用；保留原拒绝证据，不禁用 Gatekeeper、不重新公证。
- 清理修正：签名检查在启动前失败时，也删除本测试刚安装且尚未启动的副本；启动状态不明时不冒险删除。
- 第七轮 `34817333505` 两架构容器与安装应用 Gatekeeper 均通过，ARM64 完整通过；Intel 输入框已正确选择文件、Open 按钮可用，但固定延时后的回车没有完成确认。改为等待 GoToWindow 消失和原生 OKButton 可用，直接执行该按钮的 AXPress。第八轮验证最终实现；不把这次结果写为第一轮 Gatekeeper 拒绝根因已证实。
- 新增报告门禁及负例测试：启动探测、缺少检查、错误包哈希、缺少权限、错误图像尺寸、退出/卸载失败和结果未保留均不能通过。
- 清理发生错误时仍保存失败报告；拒绝用旧候选的成功证据覆盖新结果。不重试公证、不接触签名 Secrets。

## 运行记录

最终工具提交 `318bf1c`，[运行 34818201423](https://github.com/web-casa/z8work/actions/runs/34818201423) 两架构均通过。

| 系统         | 架构          | 基础门禁 | 实际结果          | 退出与卸载         |
| ------------ | ------------- | -------- | ----------------- | ------------------ |
| macOS 15.7.9 | Apple Silicon | 10/10    | WebP 32×32，380 B | 通过，用户结果保留 |
| macOS 15.7.9 | Intel         | 10/10    | WebP 32×32，380 B | 通过，用户结果保留 |

独立下载核对当前 DMG 字节、签名后主程序哈希、工具提交、十项检查、原生窗口状态和实际 `converted.webp`，全部一致。原生截图显示 Saved · Attempt 1。两架构输出 SHA-256 为 `243c3ab9c3df3fb53b8ef8f27bf75fa6ac79136a3dd7173d14dd46dea1de836b`。

本机 215 项脚本测试、修改文件 ESLint、Prettier、actionlint、文档链接与差异检查通过。本机为 Linux，只执行工具测试和证据核对；macOS 安装、窗口、选择器与解码均在对应原生 runner 上执行。

[原始证据](evidence/macos-installed-20260914/)包含每轮报告、失败截图、最终截图、原图、实际输出及 SHA256SUMS。第六轮 Intel Gatekeeper 拒绝仍保留为首次下载流程需要跟进的风险，不能仅凭后续通过宣称根因已消除。M1 更新为“基础使用通过、完整验收部分完成”。

```sh
gh workflow run desktop-builds.yml --ref fix/windows-pdf-path -f target=macos-gui
```

## 仍需验收

- 用户实际首次下载、quarantine/Gatekeeper 提示、TCC 允许与拒绝、外接盘授权。
- 活动编码时退出/取消、批量/大文件、多页 PDF、其他格式的实际 GUI 路径。
- 语言和设置完整持久化、旧版本替换及数据迁移、卸载/重装兼容性。
- Intel/Apple Silicon 最低支持系统；本轮 runner 版本不能替代最低版本实机。

这些缺项不因基础 GUI 通过而关闭；公证也不代表 Mac App Store 审核通过。

## 官方接口核对

- [Apple：AXIsProcessTrustedWithOptions](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)：查询辅助功能信任状态，不修改系统授权。
- [Apple：NSBitmapImageRep init(data:)](https://developer.apple.com/documentation/appkit/nsbitmapimagerep/init%28data%3A%29)：从实际图像字节解码。
- [GitHub：原生 runner 与全新实例](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)：CI 环境边界。
