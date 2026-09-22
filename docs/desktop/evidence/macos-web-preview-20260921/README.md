# macOS ARM64 web 预览候选（2026-09-21，run 35622039167）

当前分支（b01db4c）在 macos-15（macOS 15.7.9, Apple Silicon）上的构建与验证：

- app.zip `dc41b904ffc0d92e7e9af638cf084f1ad60051330148acaa94c474e037571b95`（35,708,414 字节）
- dmg `aa6c2df26287ec7d8948625e6d026d16bcb4550f9185af51f83c9922944be55f`（35,916,265 字节）
- 签名 ad-hoc（`APPLE_SIGNING_IDENTITY: "-"`），codesign --deep --strict 通过；**未公证**——Developer ID 签名/公证与 Gatekeeper/安装验收仍需所有者签名环境（见 PROJECT_HANDOFF §10.5）。
- 依赖仅系统框架（otool 校验无 homebrew/用户路径）；版本 0.2.0、标识 work.z8.desktop.m0 与仓库一致。
- 工件内 SHA256SUMS 与本机复算一致；GUI 转换冒烟按脚本设计"not performed; user testing requested"，如实记录。

这取代旧 native 时代的 macOS 证据作为"最新分支可构建可验证"的记录，但不替代 Developer ID 正式候选验收。
