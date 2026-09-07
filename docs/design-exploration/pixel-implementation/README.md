# Pixel Desktop 实现

按照 [01-pixel-desktop.png](../round-03-five/01-pixel-desktop.png) 实现现有 VERT 前端，沿用 SvelteKit、Paraglide、文件 store 和实际转换引擎。

改造范围、组件职责与维护方式见 [前端改造说明](../../FRONTEND_REDESIGN.md)；最新修复与验证见 [第二轮 review](review-02/README.md)。

## 本地预览

按下列命令启动后，生产预览地址为 `http://localhost:4188/`。首页为空状态，添加真实文件后进入转换工作区。

```sh
bun install --frozen-lockfile
bun run dev --host 0.0.0.0 --port 4187 --strictPort
```

构建预览：

```sh
bun run build
bun run preview --host 0.0.0.0 --port 4188 --strictPort
```

使用项目现有 `.env` 配置；新环境按 `.env.example` 配置。开发服务器首次优化 WASM 依赖可能刷新页面，完整转换流程建议使用生产预览验证。重新构建后需重启预览服务器。

## 实现范围

- 首页、文件转换工作区、顶部工具栏和底部状态栏。
- 像素字体、折角文件框、青绿与奶油色界面、桃色按钮、点阵装饰。
- 单文件与批量格式选择、转换、取消、下载、ZIP 打包、移除文件和拖放；完成后可重新转换。
- 显式排队状态、排队取消与移除检查，图片/文档 Worker 和 ZIP 子任务的取消处理，失败状态跨页面保留。
- 转换质量、元数据设置，以及原有设置、关于、隐私页面的统一外观。
- 深浅主题，中文与英文文案；其他现有语言通过 Paraglide 回退英文新增文案。
- 手机和平板布局、键盘焦点、格式菜单搜索与 Escape 关闭。

## 截图

| 文件                                                             | 状态                       |
| ---------------------------------------------------------------- | -------------------------- |
| [01-home-desktop.png](01-home-desktop.png)                       | 首页空状态                 |
| [02-convert-desktop.png](02-convert-desktop.png)                 | 3 个 PNG，批量输出 WebP    |
| [03-convert-complete.png](03-convert-complete.png)               | 真实转换完成               |
| [04-mobile-light.png](04-mobile-light.png)                       | 390px 浅色手机界面         |
| [05-mobile-dark.png](05-mobile-dark.png)                         | 390px 深色手机界面         |
| [06-settings-dark.png](06-settings-dark.png)                     | 设置页                     |
| [07-mobile-format-menu.png](07-mobile-format-menu.png)           | 手机格式菜单               |
| [08-error-state.png](08-error-state.png)                         | 损坏图片的失败提示         |
| [09-mobile-english.png](09-mobile-english.png)                   | 英文手机界面               |
| [10-mobile-320.png](10-mobile-320.png)                           | 320px 混合文件与长文件名   |
| [11-desktop-format-menu.png](11-desktop-format-menu.png)         | 桌面格式菜单               |
| [12-desktop-keyboard-focus.png](12-desktop-keyboard-focus.png)   | 桌面菜单键盘焦点复验       |
| [review-02/mobile-reconvert.png](review-02/mobile-reconvert.png) | 最新手机完成状态与重新转换 |
| [review-02/cancel-queue.png](review-02/cancel-queue.png)         | 取消首项后后续文件继续完成 |

编号 01–12 为首轮截图，第二轮新增操作和状态以 `review-02/` 中的截图为准；`history/` 保存首轮修正前的对照图。

截图中的文件是测试时实际添加的文件。3 张图片来自仓库已有图片，经测试脚本编码为 PNG 并命名为 forest/coast/studio；没有在产品中预置假文件或假转换结果。

## 资源来源

- Pixelify Sans：`@fontsource-variable/pixelify-sans`，SIL OFL 字体许可。
- Pixelarticons：`pixelarticons`，MIT 图标许可；使用包内 SVG 作为 CSS mask。
- `static/pixel-file-frame.png`、`static/pixel-dither.png`：依据已选参考图生成的透明 PNG 资源。

首轮完整验证见项目根目录 [design-qa.md](../../../design-qa.md)，第二轮修复记录见 [review-02/README.md](review-02/README.md)。浏览器结果保存在对应目录的 JSON 文件中，单元测试通过 `bun run test` 运行。
