# 商店源码补齐：2026-09-20 第二批

本轮补齐可确定的源码和依赖，并验证现有 WASM 的来源；没有替换应用引擎，没有上传或发布商店包。Microsoft Store 首包仍使用已确认的 1.0.0.0。

| 引擎            | 本轮证据                                                                                                                     | 尚未完成                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| vert-wasm 0.0.2 | 固定源码、25 个 vendored crates；独立脚本重建的整个 WASM 与应用 SHA-256 完全相同；9 个解析样例对照通过                       | 对外提供源码及工具链获取说明，完成分发许可审阅                   |
| ImageMagick     | npm 内 WASM 与 Magick.Native 2026.824.1923 官方发布资产一致；收集 wrapper、native、ImageMagick、构建依赖仓库及 23 个固定依赖 | 已按 1A 完成官方上游验证；仍需公开源码、嵌入库许可与分发义务审批 |
| MuPDF 1.28.1    | 收集固定主仓库及递归子模块共 20 个源码树，逐文件验证 Git blob                                                                | 从归档重建、构建工具链归档及分发许可审阅                         |
| FFmpeg          | 保留前批固定主仓库快照                                                                                                       | 恢复浮动依赖实际版本或从固定输入重建替换                         |
| Pandoc          | 保留当前 WASM 摘要和导入记录                                                                                                 | 恢复确切构建来源或从已知源码重建替换                             |

## 可复核产物

报告位于 [evidence/store-source-closure-20260920](evidence/store-source-closure-20260920)。`archives.json` 记录三份本地源码归档的位置、大小与 SHA-256；这些大文件在忽略目录 `.desktop-local/store-source-closure-20260920/archives/`，尚未作为公开源码交付，也不会随 Git checkout 自动存在。

MuPDF 与 Magick 的 27 个收集组共核验 29,596 个 Git blob，全部通过。GitHub tarball 的 export-ignore、换行和符号链接规范化会导致归档与 Git 对象不同；收集器使用固定 blob 内容恢复后重新核验，不把 tarball 下载成功当成源码完整性证明。源码树字节对应性和 WASM 构建对应性分别记录。

`magick-binary-binding.json` 对应官方资产：<https://github.com/dlemstra/Magick.Native/releases/download/2026.824.1923/wasm-Q8-x86.zip>。依赖锁位于 `packaging/desktop-web/magick-source-dependencies.json`。

## vert-wasm 重建

源码 commit：`4f99ef9abad355a390f1e1dfab4769ef815f54f3`。工具为 Rust 1.85.1（含 rust-src、wasm32-unknown-unknown）、wasm-bindgen Git commit `2405ec2b4bcd1cc4e3bd1562c373e9d5f0cbdcb5`、Binaryen 117，优化参数 `-O`。crates.io 版 CLI 缺少原始 Git 版本标签，不能重建相同 producer 段，须使用上述 Git commit 构建 CLI。

解开 vert-wasm 源码归档后，使用独立的新输出目录运行：

```sh
python3 scripts/desktop-web-vert-rebuild.py \
  --source /absolute/extracted/source \
  --wasm-bindgen /absolute/tools/bin/wasm-bindgen \
  --wasm-opt /absolute/binaryen/bin/wasm-opt \
  --output /absolute/new-output
```

脚本按旧二进制包含的构建路径进行 rustc 路径重映射，使用 Cargo `--frozen` 和 vendored crates 编译，再调用绑定生成器和优化器；没有修改产物 metadata 来凑摘要。预期整个 WASM 摘要为 `5ce6cbfaf8701c82e8dc16a887e01793db962b407897e870849135fe81e24239`，不一致即失败。当前验证平台是 Linux ARM64。

## 验证与门禁

- 应用/工具回归：198 项通过。
- 源码工具离线测试：7 项通过，覆盖归档越界、重复路径、元数据篡改、遗漏与符号链接恢复；Linux CI 已接入。
- vert-wasm：全字节一致，9 个功能样例通过。
- 格式检查与新增 JavaScript ESLint：通过。
- 发行预检：按预期失败，仍保留五个未完成的分发源码/许可条目。没有用本地收集报告直接改成 `verified`。
- Windows 最终 MSIX 安装、WebView2、WACK；macOS 签名、沙箱、PKG：本轮未执行。Apple 身份与签名材料仍未提供。

下一批优先解决 Pandoc/FFmpeg 的不可确定输入，以及归档复建和许可审阅；其后在对应系统验收最终包，才能判断提交准备是否完成。

第三批 FFmpeg/Pandoc 固定来源、构建入口及新证据见 [STORE_SOURCE_RECONSTRUCTION.md](STORE_SOURCE_RECONSTRUCTION.md)。
