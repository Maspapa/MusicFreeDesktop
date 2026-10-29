# Windows 学习版

基于 MusicFreeDesktop v1.0.0-beta.4，保留插件播放器功能。支持 Windows 10/11 x64。

- 播放栏或歌词页点击「学习模式」，暂停原曲。默认「逐词跟读」：每个词以 0.5 倍速独立发音，词间停顿 0.4 秒，并高亮当前词。英文按单词、日文按词切分，不把日文逐字拆读。
- 学习模式分为「学单词／句子」和「学唱法」。词句模式保留逐词跟读，不增加整句朗读。
- 学唱法按歌词时间轴循环当前一句歌曲原声，不调用系统朗读。支持 1、0.75、0.5 倍速；上一句／下一句切换歌词句子，退出恢复进入前的歌曲速度。无时间轴歌词不可用于学唱。
- 上一首/下一首变为上一句/下一句；读完停下，可开启单句循环（间隔两秒）。
- 点击英文或日文单词，按正常语速发音并查本地词典。之后手动恢复当前句的逐词跟读。
- 有中文歌词翻译优先使用；缺失时联网调用 MyMemory 翻译，歌词会发送至该服务，结果缓存在本机。免费服务有额度，失败可重试，不妨碍朗读。
- 无歌词不可学习；词句模式不改变原曲进度。退出学习不自动恢复歌曲。
- Windows 设置 → 时间和语言 → 语音，安装英文、日文语音包；缺少语音包会提示，不回退成错误语言。
- 日文使用 Chromium ICU 分词，本地词典未命中的变形会明确提示；本地词典提供读音和英释，中文含义联网机翻并标注。

安装版 EXE 和便携版 ZIP 均在本仓库 Releases。便携版解压后运行 MusicFree.exe，数据位于同目录 portable 中。首次运行可能被 SmartScreen 提示，因为没有购买代码签名证书。

## 数据和许可

英文词典来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）。日文词典由 [EDRDG EDICT2](https://www.edrdg.org/wiki/Edict_Overview.html) 转换，保留词形、读音和英释；数据库以 [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) 提供。数据库作为独立资源随源码发布，可直接提取和再分发，遵守署名与相同方式共享条件。

应用源码继续遵守上游 AGPL-3.0-only。Windows 系统语音逐词独立合成发音，词典负责释义和读音查询，不需另行下载词典录音。

## 构建

Node.js 22、pnpm 9；`pnpm install --frozen-lockfile`，`pnpm exec tsc --noEmit`，`node scripts/test-learning.cjs`，`pnpm run package`。

GitHub Actions 的「Release Windows learning mode」可手动触发，自动生成安装包、便携包、校验文件并发布 Release。不需要新增 GitHub 密钥。
