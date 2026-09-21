# Microsoft Store 与 macOS 直发修复计划

第七批进展（2026-09-21）：Pandoc 固定源码替换已完成。两次断网重建和两次 Markdown→DOCX 验收通过；GHC/WASM 输出存在已记录的字节非确定性，因此采用受严格证据约束的 `verified-rebuilt-replacement`，不宣称可复现字节相同。技术来源闭环已覆盖五个引擎；剩余发行阻塞为公开源码交付、许可批准和目标系统最终包验收。

第六批进展（2026-09-21）：用户确认路线 1A / 2A / 3B。Mac App Store 已退出范围并删除专用实现；macOS 改为 Developer ID 直发。发行门禁升级为可复现重建、官方上游校验、阻塞三级，逐项校验构建输入，并单独要求公开源码交付与分发许可批准。ImageMagick 已完成官方上游资产技术验证；Pandoc 仍按 2A 阻塞等待替换。

第五批进展（2026-09-21）：MuPDF 的 WASM 与两个 JS 文件完成全字节重建；原版/重建版各 38 项 PDF 回归、7 个离线转换流程通过。24 个源码树、24,085 个 Git blob 已归档复验。源码分发/许可和原生商店包验收仍待完成，见 docs/desktop/MUPDF_REBUILD_VALIDATION.md。

基线：28a19b3，2026-09-20。目标：落实 Microsoft Store 与 macOS Developer ID 直发准备方案并实施可验证修复；不上传或发布，不编造账户身份、源码来源或实机证据。

1. 已完成：核对当前网页引擎版、Tauri 官方配置、引擎来源与现有工具复用边界。
2. 已完成本轮调查与收集：方案见 docs/desktop/WEB_STORE_REMEDIATION.md，已下载四份源码快照；完整对应源码及许可审阅仍待补齐。
3. 已完成本地实现：后端渠道隔离；Windows 真实身份、1.0.0.0、网页 MSIX 准备及显式 pack/check 模式。已撤销 MAS 配置与专用运行路径。原生签名/安装未执行。
4. 历史验证结果保留在证据目录；第六批修改后的最终验证结果以本轮新增记录为准。

后续尚未完成：公开源码交付与许可闭合、Windows 最终构建/安装/WebView2/WACK、macOS Developer ID 最终签名/公证/安装验收、候选对应材料与实际提交或发布。详情见 docs/desktop/WEB_STORE_REMEDIATION.md。

验收：本地工具及相关测试通过；所有未满足的商店条件明确失败/未执行；最终包原生验收、商店后台身份和签名条件单独记录。

错误：首次读取假定的 src-tauri/src/lib.rs 失败；改用 rg 查找真实入口。

验证错误：Context7 配额耗尽，已改查官方文档；Ajv 对 double format 的识别失败，已注册数值格式后通过；旧商店页面测试仍对照旧 native 文案，已改用现行 web 内容并保留旧 renderer 转义校验。

## 第二批（用户已要求继续）

1. 已完成本轮可确定来源收集：MuPDF 递归子模块、Magick 固定依赖、vert-wasm 离线 vendoring 与全字节重建。
2. 已保存三份本地源码归档及摘要、Git blob 报告、重建和功能对照报告；公开分发与许可状态仍待完成。
3. 已通过 198 项回归、7 项源码工具测试、9 个重建功能样例；发行门禁按预期阻止提交。详情见 docs/desktop/STORE_SOURCE_CLOSURE.md。

## 第三批（用户要求继续）

1. 已收集：FFmpeg 主仓库与 16 个固定依赖；Pandoc 候选源码、6 个补丁仓库、历史 GHC 工具链配置。
2. 已完成构建工具及候选收集：固定镜像/本地源码上下文、Pandoc 编译器归档摘要及版本校验。FFmpeg 本机模拟编译重试达到 900 秒上限，未生成最终 WASM；原生 x86 工作流已准备但未执行。
3. 已完成本轮归档、25 组源码解包复验、198 项回归、15 项源码工具测试和原引擎 6 项转换检查。最终重建、分发审阅及商店包验收仍未完成，见 docs/desktop/STORE_SOURCE_RECONSTRUCTION.md。

## 第四批（用户要求继续）

1. 已完成：FFmpeg 续建正常退出，WASM 与 ESM JS 均和现有文件全字节一致。
2. 已完成候选验收：6 项核心检查、能力清单全同、7 个真实离线浏览器转换/下载流程通过（含 HEVC 视频提取音频）。
3. 已补齐 Emscripten/SDL 源码：19 组/30,446 个 Git blob 及归档解包复验通过；保留原引擎与重建引擎 H.265 编码补测超时记录。来源证明、分发审阅、原生包验收分别记录，见 docs/desktop/FFMPEG_REBUILD_VALIDATION.md。
