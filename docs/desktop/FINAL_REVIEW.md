# 桌面 V1 方案定稿 review

资料入口：[桌面调研总览](README.md)。本文保留调研阶段的核查范围；后续实现进度见 [M0 实施记录](M0_IMPLEMENTATION.md)。

日期：2026-09-08。对象：[V1 开发方案](V1_PLAN.md)、[ImgConvert 经验](IMGCONVERT_LESSONS.md)。本轮是用户要求的最后一次开发前文档补查；定稿不等于桌面软件已经实现，也不阻止后续按原型证据调整设计。

同日用户追加同类开源项目核查，新增 [固定源码对照记录](PEER_PROJECT_REVIEW.md)，并把保存语义、预览能力、原生导入、启动/重连、转换路线和清空队列规则补入 V1。以下 R1–R9 保留为上一轮官方资料审查结果；不把后续补查伪装成原有记录。

方法：搜索并阅读 Tauri、Microsoft、Canonical、FFmpeg、ImageMagick、Pandoc 与 Tokio 官方/维护者文档；通过 Context7 交叉核对 Tauri 命令 ACL；读取本项目当前静态构建、预渲染及 Paraglide hooks。对修正文案反向检查“约束是否能实施、承诺是否有对应验收、历史经验是否过度推广”。本次为执行者自审，没有声称独立代理审查或真实平台验收。

## 已发现并修正的缺口

以下优先级表示实施前应解决的设计问题，不表示当前网页存在相应漏洞。

| 项目                   | 原方案缺口与影响                                                | 定稿处理                                                                     | 所在章节      |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------- |
| R1 · P1 命令权限       | 自定义 invoke 命令默认开放范围与 fs 插件 scope 容易被混为一谈   | 显式命令权限、窗口与 capability 清单；Rust 和引擎文件访问另行核对授权        | V1 §5         |
| R2 · P1 引擎加载来源   | 私有配置文件存在不代表宿主配置/库不会被加载                     | 受控工作目录与子进程环境，核对 Magick 搜索链、DLL 来源，加入冲突配置反向测试 | V1 §5         |
| R3 · P1 子进程生命周期 | future 取消不等于进程退出；输出管道可堵塞，日志可无限增长       | 有界消费双管道、明确等待回收、进程树管理、独立总期限                         | V1 §3         |
| R4 · P1 文档保真       | 要求 Pandoc sandbox，却没有覆盖该模式对附图读取的影响           | 将内嵌/旁置/远程资源分开验收，禁止静默丢图或关闭保护绕过                     | V1 §5、§10    |
| R5 · P1 离线首启       | Windows UI runtime、Snap base/content 依赖没有落到承诺口径      | 区分离线安装与依赖就绪后转换；M0 冻结 WebView2 策略，检查 UDF 可写           | V1 §2、§7、§8 |
| R6 · P1 输出与恢复     | 原子 rename 不保证默认不覆盖，也不代表 PDF 全部页面成功         | 明确无覆盖提交语义、PDF 部分成功、未完成页重试、流式归档与受限清理           | V1 §3         |
| R7 · P2 桌面静态入口   | 已有 static adapter，但语言 server hook 与网页 CSP 不能自动迁移 | 独立桌面入口和安全配置，保留网页 SEO；验证桌面协议下的导航与刷新             | V1 §3         |
| R8 · P2 更新和数据     | “等任务完成再更新”与长期运行、版本迁移边界未说明                | 处理 refresh 中断、分 revision 配置及共用缓存，明确卸载/快照限制             | V1 §8         |
| R9 · P2 自动化证据     | 尚未明确三端 GUI 自动化与实际发行包的区别                       | 按当前 WebDriver 路线原型验证；测试服务不进入发行包，保留最终包交互验收      | V1 §11        |

## 官方资料与核查结论

- **Tauri 权限：**自定义应用命令需显式采用命令权限约束；多个 capability 可合并，Rust 内部实现不因此获得自动文件沙箱。方案据此要求后端验证。[Capabilities](https://v2.tauri.app/security/capabilities/)
- **静态前端：**Tauri 承载 SSG/SPA 静态输出；SvelteKit 预渲染期间不能使用运行时 Tauri API。桌面可采用 SPA，网页版无需因此关闭 SSR。[SvelteKit](https://v2.tauri.app/start/frontend/sveltekit/)
- **桌面 CSP：**需要配置自身资源和 IPC 来源；网页托管响应头不能代替桌面配置。[CSP](https://v2.tauri.app/security/csp/)
- **WebView2：**Evergreen 和 Fixed Version 的交付、更新责任不同；Fixed Version 增加包体且须应用自行更新。数据目录也必须可写。方案保留 M0 的实际路线选择，没有虚构 MSIX 离线安装依赖脚本。[分发](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)、[用户数据目录](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder)
- **ImageMagick：**配置与模块存在多处搜索位置；仅设置一个路径不能证明独占加载。隔离方式需依据最终构建和反向测试确定。[Resources](https://imagemagick.org/resources/)
- **Windows DLL：**主程序和依赖库的查找受装载规则影响，绝对 exe 路径不足以证明所有库来自包内。[DLL search order](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order)
- **FFmpeg / Tokio：**FFmpeg 支持非交互和机器可读进度；Tokio 不保证丢弃句柄即终止进程。总期限、进程树回收与管道预算是本项目据此增加的工程要求。[FFmpeg](https://ffmpeg.org/ffmpeg.html)、[Tokio process](https://docs.rs/tokio/latest/tokio/process/)
- **Pandoc：**sandbox 限制读写器资源访问，文档安全章节说明某些附图嵌入会受影响。不能假定所有格式无损迁移到同一命令组合。[Security](https://pandoc.org/MANUAL.html#security)
- **Snap：**运行中应用的更新延迟有上限；用户数据具有 revision/common 区别，卸载后还可能保留快照。依赖准备、任务恢复及隐私文案需要分别处理。[Refresh awareness](https://snapcraft.io/docs/explanation/how-snaps-work/refresh-awareness/)、[Data locations](https://snapcraft.io/docs/reference/administration/data-locations/)、[Decommissioning](https://snapcraft.io/docs/explanation/security/decommissioning/)
- **GUI 自动化：**当前 Tauri 文档描述了支持 macOS 的 WebdriverIO service 嵌入式驱动路线；与直接使用平台原生 `tauri-driver` 的限制不同，不能沿用“macOS 完全无法自动化”的笼统说法。[WebDriver](https://v2.tauri.app/develop/tests/webdriver/)

上述官方行为与本项目工程决策已在方案中分开：例如保留 PDF 已完成页是 V1 的产品设计，并非工具文档保证；环境白名单和反向测试也需要实际实现。

## 定稿边界与下一阶段

架构继续采用 Svelte + Tauri 2 + Rust 管理随包原生引擎。保持既定平台和功能范围，不新增 MAS、硬件编码或插件平台。文档层面的遗漏已修正；实施前不能声称框架、所有格式、离线部署或商店权限已通过。

M0 需要用最小真实候选回答五项问题：桌面入口/ACL、Windows runtime、四引擎加载与转换、文档资源保真、取消/输出/中断恢复。版本、预算和最终运行依赖由这些结果冻结；缺项在证据表标为未执行或失败，而不是继续靠文字证明可行。

本轮只修改三份规划文档；完成 Prettier、Markdown 本地链接/引用、代码围栏和空白检查。未改产品代码，因此没有为文档修改重复运行网页测试，也没有执行桌面构建、安装、WACK、商店提交或权限实测。官方链接的核查日期是本轮日期；正式上架时仍按实际包和当时要求核验。
