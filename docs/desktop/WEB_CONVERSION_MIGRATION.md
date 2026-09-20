# 桌面版网页引擎迁移

2026-09-20；开发分支 `feat/desktop-web-conversion`。
原生版本完整快照：`archive/desktop-native-20260920`，提交 `00389e9`。

## 当前架构

桌面内置项目的 SvelteKit 静态网页与 WASM 资源，不加载 vert.sh 在线站点。
网页和桌面复用 `src/lib/converters`、任务队列、设置、格式选择与工作区。
图片使用 ImageMagick WASM，音频使用 FFmpeg WASM，文档使用 Pandoc WASM，
PDF 使用 MuPDF WASM。没有原生 FFmpeg/ffprobe、ImageMagick、Pandoc、MuPDF 子进程。
远程 vertd 未启用。桌面构建关闭外部请求功能，CSP 限制资源为本地。

Tauri 负责窗口、单实例、用户选择保存位置和分块原子保存。
输入采用 WebView 文件选择和 HTML 拖放；不开放任意路径读取权限。
保存先由系统对话框授权目标，再传输每块最多 1 MiB 的字节。
写入同目录临时文件，核对总字节数后同步并原子发布；失败不会截断已有目标。
取消选择不产生文件，失败可以保留 Blob 并重新保存；没有原生引擎回退。
桌面批量队列按单任务执行，降低同时加载多份 WASM 的内存压力。

## 开发与验证

```sh
npm run desktop:dev
npm run desktop:build
npm run desktop:check
npm test
npm run desktop:test
npm run desktop:test:browser
npm run desktop:package -- --bundles deb
```

Linux 真机 WebView 自动测试（需 tauri-driver、WebKitWebDriver、xdotool、Xvfb）：

```sh
cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol
xvfb-run -a dbus-run-session -- node scripts/desktop-web-native.mjs
```

CI 的 `desktop-web.yml` 构建六种 OS/架构的无签名测试包，不发布。
旧原生引擎 workflow 已移至 `legacy-workflows/`，不再由 GitHub Actions 执行。
旧 `desktop/src`、`src-tauri/native`、原生辅助模块、`scripts/desktop-*` 历史工具及
`packaging/desktop` 发行材料仅保留作迁移参考，不属于新的构建/测试/发行入口。
不要运行旧签名、候选检查、原生格式扩展或 store-ready 工具来认证此版本。

## 行为变化与边界

- 使用网页工作区；旧桌面队列和偏好不迁移，旧数据不删除。
- 当前任务与结果仅保留在会话中，关闭应用会丢失；有任务时关闭会询问。
- 格式、质量和 PDF 选项以网页端实际实现为准。原生扩展格式不保证保留。
- 没有原生版的断点历史、磁盘缓存、结果目录定位、原生版本诊断和 PDF 部分页重试。
- 多文件导出使用网页端 ZIP；大文件仍受 WASM、WebView 和可用内存限制。
- WASM 与原生程序的许可义务不同但不会消失；旧原生许可包不能作为新版本的发行材料。
- Windows/macOS 实际安装、商店包、签名、公证、升级和大文件压力验收尚需目标环境。

## 验证及 review

执行结果与剩余风险记录在 [review 与验证记录](WEB_CONVERSION_REVIEW.md)，不沿用原生分支的验收结论。

双语隐私/支持页由 `packaging/desktop-web/content.json` 与 `scripts/desktop-web-pages.mjs` 生成。桌面构建会检查页面与内容一致。
