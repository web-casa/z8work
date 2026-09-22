# RTF 顺序最小复现

old = Pandoc 3.1.11.1；new = Pandoc 3.11。文件名 writer-reader.txt。

输入 order.md，使用 `pandoc --standalone --from markdown --to rtf --output new.rtf order.md` 生成原件，再 `pandoc --sandbox --from rtf --to plain new.rtf`。结果列表移动到 BEFORE 前；原 RTF 中可见列表实际位于 INTRO 后。相同产品层测试失败于 CI 34764753112。

官方 3.11 Linux ARM64 压缩包 SHA-256：56ed5566ec41d22ec9ee0704e6ac0b98ba102e92384efd5306173a22d314c79a。下载地址：https://github.com/jgm/pandoc/releases/download/3.11/pandoc-3.11-linux-arm64.tar.gz

本文件夹保留失败证据，不代表产品支持 RTF。未提交上游 issue/PR。

静态候选原因：[3.11 Readers/RTF.hs:625](https://github.com/jgm/pandoc/blob/3.11/src/Text/Pandoc/Readers/RTF.hs#L625) 的 intbl 分支调用 `((ls <>) <$> emitBlocks bs)`，把关闭的列表前置到已有正文块。仍需在上游完整测试套件中验证修复，不能据此宣称已修好引擎。
