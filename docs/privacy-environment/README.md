# 隐私与环保功能验证

日期：2026-09-07。实现与模型说明见 [PRIVACY_AND_ENVIRONMENT.md](../PRIVACY_AND_ENVIRONMENT.md)。

## 环境与结果

- Node 22.22.2；Chromium 149.0.7827.102。
- 33 项自动测试通过；Svelte 类型检查 0 错误、0 警告；生产构建通过。
- 本次改动文件的 ESLint、Prettier、文档链接及 `git diff --check` 通过。
- 开发预览 `5174` 与生产预览 `5184` 均完成实际转换、下载、计算器、隐私请求和移动布局检查。测试使用独立浏览器上下文，不修改用户浏览器数据。
- 简体中文、繁体中文、英语、西班牙语及法语英语回退显示正常；亮色/深色、390px 手机布局无横向溢出。
- 实际 PNG 样本为 5,913 字节，WebP 结果为 2,324 字节；显示节省 3,589 字节，与下载文件一致。重新转换不重复计数；转换为更大的 BMP 时不显示正向减排收益。清空队列移除结果汇总。
- 0 B 文件上传声明保持可见；未拦截模拟访问统计脚本，直接观察请求。检查流程中没有 Google Analytics、IP 定位或视频服务器请求，没有上传文件的请求；HTTP 请求仅为 GET，另有本地 blob 资源访问。
- 环保页默认 HDD 情景为 6 PB/天、年末 2.19 EB、首年 6,252,012 kWh；输入翻倍、清空和 SSD 切换均正确。来源、原料制造、电子废弃物污染和模型范围可见。
- 环保和隐私页面各自具有正确 canonical URL 和唯一的 description。

结构化记录：[validation.json](validation.json)。测试字节差来自生成的样本，未使用真实用户文件。未对 Safari、Firefox 或所有图片格式开展本轮浏览器验证。

## 截图

| 场景               | 证据                                                       |
| ------------------ | ---------------------------------------------------------- |
| 首页桌面隐私状态   | [home-desktop.png](home-desktop.png)                       |
| 首页手机隐私状态   | [home-mobile.png](home-mobile.png)                         |
| 压缩结果与情景估算 | [result-savings.png](result-savings.png)                   |
| 更大的结果不计收益 | [result-larger.png](result-larger.png)                     |
| 环保页桌面         | [environment-desktop.png](environment-desktop.png)         |
| 环保页手机亮色     | [environment-mobile.png](environment-mobile.png)           |
| 环保页手机深色     | [environment-mobile-dark.png](environment-mobile-dark.png) |
| 西班牙语手机环保页 | [environment-es.png](environment-es.png)                   |
| 手机隐私页         | [privacy-mobile.png](privacy-mobile.png)                   |

## 徽章来源

仅将原先远程加载的徽章镜像为本地资源，未重绘或修改其图案，原链接仍保留：

- [AAT 浅色](https://www.aat.ee/images/badges/featured-badge-light.svg)、[AAT 深色](https://www.aat.ee/images/badges/featured-badge-dark.svg)
- [HicYou 浅色](https://hicyou.com/badge/featured-light.svg)、[HicYou 深色](https://hicyou.com/badge/featured-dark.svg)
