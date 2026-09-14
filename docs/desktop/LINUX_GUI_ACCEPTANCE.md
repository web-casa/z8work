# Linux 已安装包原生界面验收

日期：2026-09-14。承接[安装后离线转换验收](LINUX_INSTALLED_ACCEPTANCE.md)，本轮补齐真实 WebKit 窗口与 portal 文件选择的有限验收。应用、引擎和转换格式范围保持上一轮最终 deb 的字节；没有重编应用或发布新的包。

## 覆盖内容

使用 Tauri 的外部 `tauri-driver` 2.0.6、系统 WebKitWebDriver、Xvfb、独立 D-Bus 会话和 GTK portal backend。WebDriver 操作正式应用的 WebView，xdotool 操作系统文件选择窗口及键盘；不使用浏览器 IPC mock，不注入测试插件或替换转换后端。读取队列状态使用正式只读 IPC，导入、格式选择、转换、清空使用可见控件。

五组检查覆盖：

1. 打开输入文件对话框后取消，队列仍为空，按钮恢复可用。
2. 从界面导入生成的 PNG，选择 WebP 后转换按钮可用；点击转换会打开保存目录对话框，取消后 attempt 仍为 0，输出目录没有被授权。
3. 通过系统对话框选择输出目录，键盘激活转换按钮，等待真正保存；核对 WebP 容器并在 WebKit 解码，尺寸与输入 PNG 一致，原件字节不变。
4. 切换中文、结束 WebDriver 应用会话后重新启动，语言和任务历史恢复；输入及输出目录授权均没有跨进程沿用，也没有自动重复转换。
5. 键盘清空队列后，原件和已保存文件的字节保持不变。

这是 **一条 PNG → WebP 界面转换路线与五组交互检查**，不把先前 167 条命令行转换路线称为本轮 GUI 全覆盖。测试使用仓库的微型合成图片；不代表大文件压力、照片画质、多声道音频或复杂 PDF 的 GUI 验收。

## 实现与 review

- `desktop-preview-gui.mjs --packaged-product` 复用现有 WebDriver、原生 picker、截图和隔离 XDG 目录工具；要求显式 `Z8_GUI_BINARY`，不再依赖开发引擎生成图片。新增 `Z8_GUI_OUTPUT`，拒绝复用已有证据目录。
- 新增严格报告门禁：检查模式、平台架构、应用 SHA-256 和五个必需检查，拒绝旧模式报告、缺项、重复项、不同二进制及失败报告。
- 静态 review 发现旧工具在删除 WebDriver 会话失败后仅写日志，仍可能输出 passed。现在清理失败会改变报告及退出码，并等待 driver 退出，超时尝试终止。没有把这项静态缺陷描述为本轮已发生的应用关闭故障。
- `desktop-gui-session.sh` 为 portal 服务和应用分别隔离数据、配置、缓存与 runtime 目录。正常完成后结束测试 portal 进程；不使用用户桌面会话，也不禁用 WebKit sandbox。
- `desktop-installed-gui.mjs` 只接受匹配架构的 GitHub-hosted Linux runner，拒绝普通本地调用和已有应用安装。核对固定 deb 哈希及包身份，在临时 runner 安装后核对主程序，确认随包引擎及 `xdg-portal` 构建模式；验收后卸载，确认主程序移除、用户生成的转换结果仍在。
- `desktop-builds.yml` 新增 `linux-gui`，双架构独立执行且只上传报告；不走构建和发布分支。常规 desktop CI 的路径过滤补齐本轮 GUI 及上一轮 deb 工作流。

## 验证记录

本地 212 项脚本测试通过，修改脚本的 ESLint、Prettier、工作流 actionlint 与 shell 语法检查通过。宿主机是 Debian 13 ARM64；从固定 Ubuntu deb 解包后按原资源布局运行，没有安装到宿主机。新五组界面检查通过；原有 `--product-only` 的八项产品界面检查也通过，包括语言、隐私说明、离线许可、键盘清空和最小窗口布局。

本机主程序 SHA-256 为 `e6c6d7317d2af5a0726c71f6198b4df83845a9fb2ba562c7830b2d03ba7ea7ae`，与前轮 ARM64 最终 deb 记录一致。报告中的 `installation: not-run` 是本机解包验收的真实边界，不能改成安装通过。

GitHub 双架构运行：[34797976916](https://github.com/web-casa/z8work/actions/runs/34797976916)，工具提交 `e8c79d4`。两个原生 runner 均已通过。

| 环境                        | 安装                 | 五组 GUI 交互              | 卸载后结果保留 |
| --------------------------- | -------------------- | -------------------------- | -------------- |
| Ubuntu 24.04 AMD64 / GitHub | 通过                 | 通过                       | 通过           |
| Ubuntu 24.04 ARM64 / GitHub | 通过                 | 通过                       | 通过           |
| Debian 13 ARM64 / 本机      | 未执行，按原布局解包 | 通过；另通过旧产品八项检查 | 未执行安装卸载 |

原始报告和截图见[证据目录](evidence/linux-gui-20260914/)。已复核两个 CI 的工具提交、最终 deb 哈希、安装后主程序哈希和完整 GUI 必需检查；截图已逐一查看。CI 安装状态由外层 `report.json` 记录，内层 `gui/report.json` 仅负责界面交互，不改写其 `installation: not-run` 字段。

GitHub 报告下载：[AMD64](https://github.com/web-casa/z8work/actions/runs/34797976916/artifacts/10330447323)、[ARM64](https://github.com/web-casa/z8work/actions/runs/34797976916/artifacts/10330586839)，保留 30 天。应用包下载仍见前轮交付记录。

## 复现

GitHub 入口使用已固定的最终 deb；需要对应 artifact 尚在保留期内：

```sh
gh workflow run desktop-builds.yml --ref fix/windows-pdf-path -f target=linux-gui
```

本地先准备独立会话目录，设置 `Z8_GUI_SESSION_ROOT`、尚不存在的 `Z8_GUI_OUTPUT`、真实应用路径 `Z8_GUI_BINARY` 和 `Z8_XDOTOOL`；随后在项目根目录执行：

```sh
xvfb-run -a -s '-screen 0 1280x1024x24' dbus-run-session -- bash scripts/desktop-gui-session.sh
```

需要 Node 22.22.2 或当前已验证 Node 24、tauri-driver、WebKitWebDriver、Xvfb、D-Bus、GTK portal backend 与 xdotool；独立 xdotool 如有私有依赖，可沿用 `Z8_XDOTOOL_LIBRARY_DIR`。本地命令只运行指定应用，不安装 deb。

## 仍未覆盖

- GNOME/KDE 的完整用户桌面、Wayland、真实显示缩放和辅助技术；Xvfb + GTK portal 的结果不等于这些环境都通过。
- 首次拒绝授权、外接盘、Snap strict confinement、睡眠、强制退出恢复及旧版本安装升级。
- Windows/macOS 原生界面及商店验收。
- 本轮没有隔离 GUI 会话的网络，也没有抓包；离线转换证据仍引用上一轮断网容器检查。结束会话由 WebDriver 执行，不代表应用退出确认对话框已验收。

官方资料于 2026-09-14 核对：[Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/)、[portal backend 配置](https://flatpak.github.io/xdg-desktop-portal/docs/portals.conf.html)。采用项目现有外部 driver 路线；未因文档介绍其他 provider 就给发布应用增加测试插件。
