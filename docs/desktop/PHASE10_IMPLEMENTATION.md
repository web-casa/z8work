# Phase 10：Windows x64 主程序构建与运行检查

日期：2026-09-09。范围是 Windows 主程序的实际 Release 构建、依赖检查和有限运行入口；本地开发及 review 完成。Windows 引擎包、MSIX 和原生 Windows 验收尚未完成。Phase 9 的 Snap 实机缺项继续保留，不重复制造安装通过记录。

## 本轮实现

- `packaging/desktop/windows/build-cross.sh`：检查工具，构建桌面前端、Windows Release EXE 和原生核心测试程序，保存日志并检查最终 EXE。输出目录必须不存在；失败不会覆盖旧产物。
- `packaging/desktop/windows/cargo-config.toml`：仅对 Windows x64 MSVC 静态链接 C runtime。实际检查曾发现 `VCRUNTIME140.dll` / `VCRUNTIME140_1.dll` 缺口，修正后主程序不再直接依赖它们。这个配置不能替代未来四类转换引擎自己的 DLL 检查。
- `scripts/lib/desktop-windows.mjs`：读取 PE32+ 架构、子系统、普通及延迟 DLL 导入，递归检查目录内 EXE/DLL。拒绝损坏表、越界 RVA、重叠段、架构混入、大小写冲突、符号链接和系统 DLL 遮蔽；私有 DLL 必须随对应程序放置，不搜索开发机 PATH。
- `scripts/desktop-windows-check.mjs` / `desktop:windows:check`：保存带最终文件哈希的静态报告；`--runtime` 在 Windows x64 环境有限执行主程序的构建信息命令，校验版本、正式编译开关、Job Object 与对话框后端，并重新核对所有 EXE/DLL。报告始终保留 `acceptance: incomplete`。
- `src-tauri/src/build_report.rs`：新增 `--build-info-file ABSOLUTE_NEW_FILE`，不依赖 GUI 子系统的控制台句柄。只创建新文件，拒绝相对路径和已有文件；参数错误直接失败，不意外启动 GUI。原 `--build-info` 继续可用。
- `scripts/desktop-windows-inputs.mjs`：保存实际工作区输入的 SHA-256，构建前后检查一致性。包含桌面、Rust、共享像素样式/图标、根 PostCSS/Tailwind 配置与锁文件；只记 HEAD 不足以识别本工作区的未提交实现。
- `.github/workflows/desktop.yml`：新增 Windows Release 构建、应用/核心测试和构建信息运行任务，保存报告。工作流已通过本地 `actionlint`；本轮没有推送或触发远端运行。

依赖解析属于静态预检：系统 DLL/API-set 名称被识别不代表最低系统版本、所有导出函数及动态 `LoadLibrary` 路线已验证。资源表存在也不等于 MSIX 图像/版本资源合格。报告不将这些结果称为安装或分发许可验收。

## 本地产物

最终目录：`.desktop-local/phase10-final/`。早期 `phase10-cross-*` / `phase10-delivery` 是中间构建记录，不能替代下列最终字节。

| 项目          | 结果                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| 程序          | `application/z8-desktop.exe`                                                   |
| 字节          | 11,610,624                                                                     |
| SHA-256       | `a527f26ecfa649dcf0809c2910479003b4434d6f29d725377ba9daa17f69f9ae`             |
| 格式          | x64 PE32+，Windows GUI 子系统，有资源表，无内嵌证书表                          |
| 静态 DLL 导入 | 14 个 Windows DLL/API-set；额外私有 DLL 缺失 0                                 |
| 输入记录      | `inputs.json`，250 个实际工作区文件，构建前后一致                              |
| 源码基线      | HEAD `c554d15c578d54713d9ab0cf58e7a6ec221f35a9` 加输入记录中的未提交实现       |
| 工具          | Rust 1.96.0、cargo-xwin 0.23.1、LLVM/Clang 19.1.7、Node 24.18.0、Bun 1.4.0     |
| SDK 缓存标识  | Win11SDK 10.0.26100；Microsoft.VC.14.44.17.14 CRT；原始缓存回执保存在 evidence |
| 主机          | Debian 13 / Linux ARM64，交叉编译；没有执行此 Windows EXE                      |

这是一份主程序开发产物，**没有 Windows 原生转换引擎和 WebView2 Runtime，不是可交付用户的完整桌面包，也不是 MSIX**。程序仍沿用开发身份 `work.z8.desktop.m0`。构建信息中 `engines: bundled` 表示编译模式，不证明引擎文件已随包提供。

SDK 下载缓存和宿主工具并非仓库中的完整可重建工具链；本轮记录精确输入与最终字节，不声称跨机器逐字节可复现。静态 CRT 的来源和许可证也需要纳入将来的 Windows 发行材料。

## 验证与 review

| 检查                                                | 结果   | 证据或范围                                                 |
| --------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Windows Release EXE 链接                            | 通过   | `evidence/phase10/windows-build.txt`                       |
| Windows 应用/核心测试程序编译                       | 通过   | 仅 `--no-run`，不计入 Windows 测试执行                     |
| 最终 EXE 静态检查                                   | 通过   | `evidence/phase10/inspection.json`                         |
| 与 LLVM 独立解析对照                                | 通过   | 14 个导入、AMD64 和 GUI 子系统一致                         |
| Node 22 / Node 24 桌面测试                          | 通过   | 各 96 项；新增 11 项 Windows 工具测试                      |
| Linux ARM64 应用单元测试                            | 通过   | 2 项报告路径与不覆盖测试                                   |
| Linux ARM64 原生核心回归                            | 通过   | 46 项通过、1 项子进程 fixture 按设计忽略                   |
| Linux 无显示器 CLI 实际执行                         | 通过   | 6 个成功/重复/相对路径/错误参数场景；stdout 与文件内容相同 |
| Svelte、ESLint、Rust fmt/Clippy、脚本格式与 CI 语法 | 通过   | 报告见 `evidence/phase10/`                                 |
| Windows EXE 实际启动与 Job Object 执行              | 未执行 | 本机 Linux ARM64，`--runtime` 如实退出 2                   |
| Windows GUI、WebView2 和真实转换                    | 未执行 | 缺原生 Windows 环境及其引擎包                              |
| MSIX、侧载、升级卸载、WACK、商店审核                | 未执行 | 尚无安装件，Partner Center identity/publisher 仍未配置     |

Review 修正：

1. 第一份 EXE 的额外 VC runtime 依赖真实可见，使用静态 CRT 配置后检查最终 PE，未把复制开发机 DLL 当作完成依赖处理。
2. cargo-xwin 在缓存内创建 clang-cl，Debian 的 Clang 包没有独立 `clang-cl` 命令；构建前检查改为实际需要的 `clang`，不误拒绝可工作的工具链。
3. 源码回执最初漏了桌面直接引用的共享 CSS/PixelIcon 及根构建配置，补入并增加断言后重新构建最终产物。
4. 运行后从只复核 EXE 改为复核整个 EXE/DLL 清单，防止相邻依赖变化未被发现。
5. 普通/延迟导入都检查，VC runtime/WebView2Loader 不列入系统依赖免检项；测试覆盖跨目录错误解析、系统 DLL 遮蔽及大小写冲突。
6. OS/CPU 字段只能描述运行环境，不能单凭它排除 Wine 等兼容层；文案已明确这一限制。原生验收仍需可信 Windows 测试机/runner 的执行记录。
7. 本地应用测试首次误用了 Windows 的无默认对话框配置，触发 rfd 缺 Linux 后端。改用 Linux 的 GTK 默认功能重测通过；Windows 构建继续采用原生对话框。

## 复现命令

在仓库根目录运行。工具需预先安装；构建脚本不会安装系统软件或发布产物。首次 cargo-xwin 构建需要下载 Microsoft SDK/CRT，缓存下载不是应用运行时联网。

本机已安装 LLVM 19 和隔离的 cargo-xwin 0.23.1，可使用：

```bash
env PATH="/usr/lib/llvm-19/bin:/home/ivmm/VERT/.desktop-local/phase10-tools/bin:$PATH" \
  XWIN_CACHE_DIR=/home/ivmm/VERT/.desktop-local/phase10-xwin \
  bash packaging/desktop/windows/build-cross.sh \
  /home/ivmm/VERT/.desktop-local/windows-next-build
```

通用工具准备可参照 Tauri/cargo-xwin 官方文档；需要 Rust 的 `x86_64-pc-windows-msvc` target、LLVM 的 `llvm-rc`/Clang/LLD、Node 与 Bun。不要复用已经存在的输出目录。

任意主机静态检查已有应用目录：

```bash
bun run desktop:windows:check \
  --root .desktop-local/phase10-final/application \
  --output .desktop-local/windows-static-next
```

原生 Windows x64 开发机：按现有 Windows CI 的命令构建后，将 `z8-desktop.exe` 放入独立目录；不要把 Cargo 的所有测试 EXE 混入应用目录。

```powershell
bun run desktop:build
cargo build --locked --manifest-path src-tauri/Cargo.toml --config packaging/desktop/windows/cargo-config.toml -p z8-desktop --release --target x86_64-pc-windows-msvc --no-default-features --features packaged-engines,custom-protocol
New-Item -ItemType Directory .desktop-local/windows-app-next
Copy-Item src-tauri/target/x86_64-pc-windows-msvc/release/z8-desktop.exe .desktop-local/windows-app-next/
bun run desktop:windows:check --root .desktop-local/windows-app-next --output .desktop-local/windows-runtime-next --runtime
```

`--runtime` 只验证有限构建信息入口：30 秒上限、成功退出、JSON 内容、执行前后字节一致。它不创建 WebView、不验证文件选择或转换能力；新创建的报告只在命令成功且 JSON 校验通过后才能作为证据。无法运行时返回 2；其他失败返回 1。

## 下一阶段

继续 Windows 原生引擎随包布局与转换矩阵：准备 ImageMagick/FFmpeg+ffprobe/Pandoc/MuPDF 的精确来源、x64 EXE/DLL、配置数据与许可材料，复用 schema 2 清单和 Rust bundle verifier。完成原生 Windows 运行后再推进 MSIX 的 WebView2 策略、Partner Center 身份、最终安装件及升级卸载验收。Linux strict Snap 与 macOS 的外部实机缺项仍未关闭。

## 官方依据

核对日期：2026-09-09。

- [Tauri Windows 构建与交叉编译](https://tauri.app/distribute/windows-installer/)：MSVC、LLVM、cargo-xwin 路线；编译 EXE 不等于生成 MSIX。
- [cargo-xwin](https://github.com/rust-cross/cargo-xwin)：SDK/CRT 缓存与编译接口，实际命令另经 0.23.1 的 `--help` 核对。
- [Rust C runtime 链接](https://doc.rust-lang.org/reference/linkage.html#static-and-dynamic-c-runtimes)：`crt-static` 与编译后检查。
- [Microsoft PE/COFF 格式](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)：PE32+、RVA、导入及延迟导入目录。
- [WebView2 分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)：Loader 与 Runtime 是不同层次，运行时可用性仍需实际验证。
