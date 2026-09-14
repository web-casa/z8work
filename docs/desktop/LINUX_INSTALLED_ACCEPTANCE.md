# Linux deb 安装后离线验收

日期：2026-09-14。承接[六平台预览包交付](FORMAT_EXPANSION_DELIVERY.md)，将此前仅在 ARM64 手工执行的音频安装检查扩展为 AMD64 / ARM64 的可重复完整质量验收。本轮不新增格式、不重建安装包，也不发布商店版本。

## 实现

`desktop-builds.yml` 新增 `linux-installed` 入口，调用双架构原生 runner。输入仍来自 `capability-sources.json` 中固定运行、文件名和 SHA-256 的已交付 deb；下载后先验证哈希，再创建独立容器。应用与引擎都使用安装包原件，不从当前源码重编验证程序。

容器复用 `Dockerfile.core24` 的固定 Ubuntu 24.04 多架构镜像。联网阶段安装 Python、应用及 deb 声明的系统依赖；然后断开 bridge，宿主检查容器网络列表为空，容器内再检查仅剩 `lo`。转换在普通用户下执行随包 `bundle-check --quality`，包括 167 条路线、20 项质量检查、240 项图片校准及 PDF ICC 检查；结果使用已有 JS 完整质量门禁验证。

安装后逐一核对 deb 中普通文件的原始字节、权限及符号链接，删除用于对照的解包目录，再执行转换。卸载后检查所有已核对的包文件消失，并确认用户自建文件内容与归属保持不变。该用户文件是测试哨兵，不冒充用户真实历史转换结果。

Docker 只接收复制进去的包和脚本，不挂载宿主目录或 Docker socket，不使用 privileged。所有安装/卸载命令都在容器内执行。命令有期限，转换或验收失败后仍删除容器；清理失败也导致失败，且同时保留原始错误。源码提交、工具文件摘要、输入包摘要和命令日志记录在证据中。整个流程不提供 GUI 或升级通过结论。

复现方式（项目根目录，匹配架构主机，Docker 和现有免交互 sudo 配置）：

```sh
node scripts/desktop-deb-installed.mjs linux-arm64 INPUT_DIRECTORY NEW_OUTPUT_DIRECTORY
# AMD64 主机使用 linux-amd64；输出目录必须尚不存在。
gh workflow run desktop-builds.yml --ref fix/windows-pdf-path -f target=linux-installed
```

工具不会下载输入包，需先将固定的最终 deb 放入输入目录；CI 通过已有 GitHub artifact 下载步骤准备输入。不得把 `desktop-deb-container.py` 当作宿主机安装器，它会拒绝缺少容器标记及测试环境标记的运行。

## Review 与修正

- 本机首次完整文件核对发现 `/usr/share/doc/z8-work/README` 未安装。检查固定基础镜像后确认 `/etc/dpkg/dpkg.cfg.d/excludes` 默认过滤文档，而非 deb 缺文件。仅在测试容器添加本应用文档的 `path-include`，模拟正常桌面文档安装；不跳过文件核对，也不修改应用包。原始失败日志保留。
- 首次 CI 运行 `34793694196` 因上述环境修正主动取消，不作为通过证据。
- 卸载核对从几个入口路径扩展为所有已登记包文件，避免漏掉离线文档等残留。
- 加入断网失败不得开始转换、安装/转换/报告失败必须清理、畸形质量报告不得通过，以及清理失败必须保留的测试。
- 清理控制流在提交 `49231c8` 整理为退出前统一抛出错误，避免在 `finally` 中抛出错误；保留双错误聚合。该调整未改变容器命令、包或转换流程，相关失败路径测试通过。

## 验证记录

双架构远端验收：[34793800354](https://github.com/web-casa/z8work/actions/runs/34793800354)，工具源码 `008db9d`。两个原生 CI runner 均已通过，本机 ARM64 也独立通过。

| 验收环境            | 安装文件核对 | 断网完整质量门禁 | 卸载与用户文件保留 |
| ------------------- | ------------ | ---------------- | ------------------ |
| GitHub Ubuntu AMD64 | 1,343 项通过 | 通过，167 条路线 | 通过               |
| GitHub Ubuntu ARM64 | 1,341 项通过 | 通过，167 条路线 | 通过               |
| 本机原生 ARM64 容器 | 1,341 项通过 | 通过，167 条路线 | 通过               |

本地 209 项脚本测试通过，修改文件的 ESLint、Prettier 和 actionlint 通过；Python 语法检查及宿主机误调用拒绝检查通过。原始首次失败、本地 ARM64 和远端双架构结果见[证据目录](evidence/linux-installed-20260914/)。安装的主程序哈希与上一轮最终 deb 报告一致，三份验收工具文件也按报告中的精确提交逐一复核。三次成功验收均使用普通 UID 1001 执行转换。

CI 原始报告：[AMD64](https://github.com/web-casa/z8work/actions/runs/34793800354/artifacts/10329316474)、[ARM64](https://github.com/web-casa/z8work/actions/runs/34793800354/artifacts/10329082365)，保留 30 天；本地证据目录另外归档原始报告及 SHA-256。输入仍为上一轮交付的 deb，其下载入口和保留期限见交付文档。

## 边界

这项检查覆盖固定 Ubuntu 容器内的安装、普通用户完整离线转换和卸载。它不覆盖原生 WebView、系统文件选择器、桌面 portal、旧版本升级、Snap strict 权限或其他发行版。依赖安装阶段仍需网络；不能把转换阶段断网通过描述为安装全过程零请求。

Docker 命令与网络模型于 2026-09-14 核对：[容器内执行命令](https://docs.docker.com/reference/cli/docker/container/exec/)、[隔离网络与 loopback](https://docs.docker.com/engine/network/drivers/none/)。本工具采用安装后断开网络，并实际检查网络列表和接口，未把链接文档当作本次验收结果。
