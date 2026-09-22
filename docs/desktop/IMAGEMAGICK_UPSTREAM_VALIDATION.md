# ImageMagick 官方上游资产验证

日期：2026-09-21。结论仅覆盖技术来源对应，不代表分发许可批准或发行就绪。

项目使用 `@imagemagick/magick-wasm 0.0.43` 的 `dist/x86/magick.wasm`，SHA-256 为 `5a4ed1017eda113144c86ae839c22c610afebcfebfa22b1da18e00e98d78b0f7`。该文件与 `dlemstra/Magick.Native` 官方 release `2026.824.1923` 的 `wasm-Q8-x86.zip` 内 `magick.wasm` 逐字节相同；发布 ZIP SHA-256 为 `0d8178eb7e5bd92ac1dc713afefae3f6251b75f6ab14d0157ff8088d10c2ea1f`。

官方发布对应 Magick.Native 提交 `566ae32c14fe7ea7fc139670cefee669a035d335`，内嵌 ImageMagick 提交 `344e9056f43764bfdf82456faf3bc2feee98a6fe`。`ImageMagick/Dependencies` 提交 `6d4b77cebb890ddd48a6ddf65d46aa612effe694` 固定了 23 个 WASM 依赖提交；这些源码树已收集并做 Git blob 校验。完整本地源码归档为 `.desktop-local/store-source-closure-20260920/archives/magick-sources.tar.gz`，SHA-256 为 `f4e6e2dd716404916d01f4fc1eb54c35d1d4bdcd80993e94c582efc4535fc339`。

在 1A 风险分级下，这些证据使 ImageMagick 状态成为 `verified-upstream`：随包字节是未修改的官方发布资产，且能绑定到固定源码与依赖。它与 `verified-rebuilt` 含义不同，门禁会拒绝缺少 release、资产摘要、依赖审阅或本地归档的上游证据。

许可清单已经覆盖 23 个依赖的主要许可文件。`xml` 没有标准顶层许可文件名，需要人工确认 notice；de265、glib、heif、lqr、raw 等包含 copyleft 或双许可条款，需要核对 WASM 静态链接后的义务。对应源码目前也只是本地归档。因此 ImageMagick 仍被以下两项硬门禁阻止：

- `sourceDelivery.status` 尚未变为带 HTTPS URL 的 `published`；
- `distributionReview.status` 尚未得到明确的 `approved`。

机器可读证据见 [source-binding.json](evidence/imagemagick-upstream-20260921/source-binding.json) 和 [license-inventory.json](evidence/imagemagick-upstream-20260921/license-inventory.json)。
