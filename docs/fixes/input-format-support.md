# PNG 识别与电子表格支持提示

2026-09-07。

## 复现与范围

- 当前 ImageMagick 转换器包含 PNG 输入和输出。使用普通 `测试.png` 与 `测试.xlsx` 同时添加，PNG 可以完成转换，原来的“仅支持图片、视频、音频和文档文件”提示出现在 XLSX 行。
- 当前文档转换器没有 XLSX、XLS、ODS 等工作簿格式，不能把“文档”理解为支持全部 Office 文件。`xlxs` 也不等同于常见的 `xlsx` 后缀。本次没有新增电子表格转换引擎。
- 另确认识别边界：缺少后缀但 MIME 为 `image/png` 的图片、PNG 后缀末尾带空白会误判；旧构造逻辑会给无后缀名称错误地加一个前导点，并丢掉 MIME 类型。
- 未取得用户原始 PNG 的完整文件名和内容，不能确定用户文件具体命中了哪一类边界。

## 修正

统一使用 [input-format.ts](../../src/lib/util/input-format.ts) 识别文件格式。扩展名忽略大小写和末尾空白；无后缀时只对列出的常用图片 MIME 和 ZIP MIME 回退识别，未知类型仍保持不支持。显式后缀优先，不能因为 MIME 写成 `application/zip` 就解包 PNG、DOCX 或 XLSX。

VertFile 保留 MIME、修改时间和无后缀文件的原名称；已有后缀继续规范为小写。转换仍由实际引擎解码验证，识别到 PNG 不代表损坏的图片可以转换。

未知格式提示包含具体后缀；电子表格和 `xlxs` 拼写分别说明原因。新文案覆盖英文、西语、简繁中文，其他语言沿用英文回退。

## 验证

- 66 项 Node 测试通过，包含新增的文件名/MIME 边界回归。
- [浏览器脚本](../../tests/browser/input-support.mjs) 实际转换普通 PNG、大写 PNG、仅 `.png` 的名称、尾随不换行空格、无后缀 PNG、MIME 错写为 ZIP 的 PNG，共 6 项。
- 同时添加生成的 XLSX 工作簿、标记为 ZIP MIME 的同一工作簿和 `xlxs` 文件；它们保持为 3 个独立不支持项，不被解包，不阻止图片转换。
- 下载无后缀 PNG 的 JPEG 结果，验证保留原名称和 JPEG 文件签名。
- 开发和生产预览均通过 PNG/表格混合输入测试，见[生产记录](input-format-validation/results.json)和[截图](input-format-validation/png-and-spreadsheets.png)。
- 原有工作区浏览器回归通过；Svelte 检查、目标文件 ESLint、Prettier 和生产构建通过。

复现命令（使用已安装的 Playwright）：

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
IIPE_TEST_BASE=http://localhost:5174 \
node tests/browser/input-support.mjs
```

脚本默认把截图和结果写入 `/tmp/iipe-input-support`，可以通过 `IIPE_TEST_OUTPUT` 更改。素材由脚本生成，不使用用户图片或表格数据。
