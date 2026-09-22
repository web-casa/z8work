# Windows x64/ARM64 MSIX 真机验收清单（候选级）

更新：2026-09-21。目标：对 Microsoft Store 渠道的当前 WASM 桌面候选完成 Windows 真机验收，形成可审阅证据。**本清单不含签名密钥使用授权、上传或商店提交；签名与提交需所有者提供环境和明确授权。** 历史记录：Windows CI 已有 x64/ARM64 NSIS 构建，但 NSIS ≠ Store MSIX，不能替代本清单。

## 0. 固定事实（来自仓库配置，构建时不得偏离）

- 渠道配置：`packaging/desktop-web/microsoft-store.json`（Identity `53660AlanM.Z8Work`、Publisher `CN=84AC3716-04E0-4D67-8951-0D3E51674CA0`、PFN `..._909n0052ampem`、版本 `1.0.0.0`、`firstSubmission: true`、WebView2 `external-evergreen-required`、最低 Windows `10.0.19041.0`）。
- 正式构建配置：`packaging/desktop-web/tauri.microsoft-store.json`（启用 Rust `store` feature）。
- ARM64 布局准备器会把最低/最高 Windows 版本调为 `10.0.22000.0`（`scripts/desktop-web-msix.mjs`）。
- 布局只接受 `z8-desktop.exe` + 可选 `WebView2Loader.dll`；工具输出恒为 `storeSubmissionAllowed: false`。
- 门禁行为注意（更新于 2026-09-21 门禁全绿后）：`desktop-web-release.mjs prepare` 在门禁 ready 时正常重建前端；若门禁再次报阻塞（例如引擎升级后），prepare 会**跳过前端重建**——届时候选必须基于显式验证过的 `desktop/dist`，并在证据中记录该目录全部引擎摘要。

## 1. 环境前提（所有者提供）

| #   | 前提                                              | 说明                                     |
| --- | ------------------------------------------------- | ---------------------------------------- |
| 1   | Windows x64 真机/虚拟机 ≥ 10.0.19041              | 用于 x64 全流程                          |
| 2   | Windows ARM64 真机 ≥ 10.0.22000                   | 用于 ARM64 全流程（不允许 x64 模拟替代） |
| 3   | Windows SDK（MakeAppx/MakeMSIX）+ WACK（appcert） | 打包与认证工具链                         |
| 4   | 侧载签名材料                                      | 所有者提供并自行保管；仓库不记录秘密     |
| 5   | 候选源码提交号                                    | 完整 40 位 SHA，布局准备必填             |

## 2. 候选构建与包生成（每架构重复）

> **CI 自动化（2026-09-21 新增）**：`.github/workflows/desktop-web-store-msix.yml`（仅 `workflow_dispatch` 手动触发）在 windows-2025（x64）/windows-11-arm（ARM64）上完成下表步骤 2–6 与 8：store 配置构建、干净 payload 暂存、布局准备（绑定 `github.sha`）、MakeAppx 打包、独立 ZIP/BlockMap 校验、解包逐字节比对，并把 `.msix`+`SHA256SUMS`+全部日志作为工件上传（保留 14 天）。
> CI 构建使用 `packaging/desktop-web/tauri.microsoft-store-ci.json`（store feature，保留基础 `beforeBuildCommand`）：release gate 的 prepare 依赖 `.desktop-local/` 的归档与 12 个构建输入，不在 Git 内，离仓无法运行；workflow 因此在构建后运行门禁 check 并断言其 issues **全部为本地文件不可得**——任何摘要漂移（如 changed build input、WASM digest mismatch）都会使作业失败。
> **激活前提：本工作区提交并推送后才能 dispatch（推送属外部动作，需所有者授权）。** 步骤 1、7 与 §3 真机矩阵仍按人工执行。
> **已执行（2026-09-21，所有者授权提交/推送后）**：run 35619046492 双架构成功，产出未签名候选 x64 `e2075625…`、arm64 `7b732d3e…`（Identity `53660AlanM.Z8Work`、版本 `1.0.0.0`、archive-check passed，本机独立复核 passed）。过程中修复四个真实缺陷：tauri CLI 不支持 `--bundles none`（改 `--no-bundle`）、Windows checkout CRLF 破坏字节 drift 检查（新增 `.gitattributes * -text`）、vite receipt 插件在 Windows 上 cwd 分隔符失配导致空模块清单（归一化两侧分隔符）、CI 504 瞬时抖动一次（rerun 通过）。候选摘要与证据：`docs/desktop/evidence/windows-msix-20260921/candidates.json`。**门禁 check 的 CI 断言通过**（仅本地文件不可得类 issue，无摘要漂移）。

| #   | 步骤           | 命令/工具                                                                                                                                                                                        | 通过标准与记录                                                                               |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | 前端与门禁基线 | `npm run check`、`npm test`、`npm run desktop:build`、`node scripts/desktop-web-release.mjs check`                                                                                               | build 通过；check 输出 `ready: true`（当前 0 项阻塞）；若出现 issues，先如实处理再构建候选   |
| 2   | 引擎摘要记录   | 对 `desktop/dist/*.wasm` 计算 SHA-256                                                                                                                                                            | 与 `packaging/desktop-web/engines.json` 完全一致（含 `static/pandoc.wasm` 的 `e12460b4...`） |
| 3   | Windows 构建   | `tauri build --config packaging/desktop-web/tauri.microsoft-store.json`（在 Windows 主机）                                                                                                       | 产物为内嵌 web 资源的 `z8-desktop.exe`；记录原始构建日志                                     |
| 4   | 布局准备       | `node scripts/desktop-web-msix.mjs --payload <干净目录> --output <新目录> --arch x64\|arm64 --source-commit <完整SHA>`                                                                           | receipt 含 `layout-prepared`、`storeSubmissionAllowed: false`；架构与 manifest 正确          |
| 5   | 打包           | `node scripts/desktop-msix-pack.mjs --prepared <目录> --tool <MakeMSIX/MakeAppx 绝对路径> --kind makemsix\|makeappx --output <新目录> --python <python> --web-store`（MakeAppx 需 Windows 主机） | 布局校验 + 打包通过                                                                          |
| 6   | 独立校验       | `scripts/desktop-msix-check.py`（`--web-store`，签名后再跑 `--signed`）+ SDK unpack 逐字节比对                                                                                                   | ZIP/BlockMap/资源/架构检查通过；记录输出                                                     |
| 7   | 身份核对       | 解包读 AppxManifest                                                                                                                                                                              | Identity/Publisher/PFN/版本 `1.0.0.0`/最低系统版本与 §0 一致                                 |
| 8   | 最终包摘要     | 对 .msix 计算 SHA-256                                                                                                                                                                            | 记录为该架构候选摘要，后续验收绑定它                                                         |

## 3. 真机验收矩阵（每架构执行，逐项记录原始日志/截图）

| #   | 项目           | 通过标准                                                                                                              |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | 侧载签名安装   | 使用所有者签名材料安装成功；系统显示发布者与包身份正确                                                                |
| 2   | 干净安装首启   | 全新用户/干净环境安装后启动；无网络时界面与引擎全部本地加载（离线四类转换可用）                                       |
| 3   | WebView2 存在  | Evergreen 运行时已装：转换、保存、退出全部正常                                                                        |
| 4   | WebView2 缺失  | 卸载/禁用 WebView2 后按 Store 依赖声明处理（安装器拉起或清晰报错），不得静默白屏；恢复后正常                          |
| 5   | 离线转换       | 图片、音频、文档、PDF 各至少一条真实转换 + 保存；无外部网络请求                                                       |
| 6   | 保存语义       | 系统保存对话框、取消保留结果、失败后换位置重试、崩溃遗留临时文件的可见行为与支持页描述一致                            |
| 7   | 退出保护       | 有未保存结果时关闭应用出现确认；确认后不写坏目标文件                                                                  |
| 8   | store 渠道行为 | 关于页无直发下载入口；项目 releases 下载路径被阻断；源码/隐私/支持链接可开                                            |
| 9   | 升级           | 安装更高四位版本（Partner Center 规则）后设置与功能正常；降级被拒                                                     |
| 10  | 卸载           | 卸载干净；重装可用                                                                                                    |
| 11  | WACK           | `appcert` 全套通过（x64 与 ARM64 各一份报告）                                                                         |
| 12  | 证据归档       | 每项原始日志/截图入库 `docs/desktop/evidence/windows-msix-<日期>/`；两架构最终 .msix 摘要写入该目录 `candidates.json` |

## 4. 完成定义与边界

- 完成定义：§2 两架构全通过 + §3 全部项有原始证据 + 候选摘要冻结。此时才谈得上"候选级验收完成"；`storeSubmissionAllowed` 仍由工具保持 false，商店提交是之后另一个明确授权的外部动作。
- 边界：本清单不包含证书签发/选择、Partner Center 上传、商店认证；任何一项失败必须如实记录失败现象与复现步骤，不得以"预期失败"归档。
