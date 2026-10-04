# asmr3d空间渲染器

> asmr3d空间渲染器是一款面向ASMR、双耳音频与空间音频研究的本地渲染工具。项目支持单声道对象的HRTF与参数化HRTF渲染，也支持KU100、假人头和普通双耳录音的整体兼容处理。用户可实时调整方位角、仰角、距离与输出音量，查看和拖动播放进度，并将当前参数完整离线渲染为16-bit或24-bit WAV。工具完全离线运行，提供网页版、Android APK和Windows便携版，内置CC0示例素材，并采用Web Audio、Capacitor与Electron构建，适合听感测试、空间音频实验、教学演示和个人内容创作。项目不声称能从普通双耳录音中恢复独立声源或实现任意真实三维旋转，界面中已明确区分对象级HRTF与双耳兼容整体调节。代码以MIT许可证开放，音频测试素材均标注CC0来源。

当前版本：

```text
v0.2 公测版
```

## 当前开发优先级

主目标：

```text
Windows 10 / Windows 11 本地 EXE
```

次要目标：

```text
Android APK
```

Android 版本暂时暂停开发，原因是第三方 Android 工具链和依赖风险需要进一步评估。现有 Android 工程和构建脚本继续保留，但不作为当前版本的主要交付目标。

## 功能

- 单声道对象 HRTF 渲染
- 参数化 HRTF：ILD、ITD、头部阴影与仰角滤波
- KU100、假人头与普通双耳录音的兼容模式
- 方位角 `−90°～+90°`
- 仰角 `−30°～+30°`
- 距离 `0.2～10 m`
- 播放进度跳转与前后 10 秒操作
- 完整文件离线 WAV 渲染
- 5～120 秒实时片段捕获
- 直播截获（Windows）：按应用进程回环，只抓取所选应用
- 直播同步录制：分段持续写盘，结束后校验并合并为整段 WAV
- 视频 / 音频转 WAV：本地抽取音轨，直接写入输出文件夹
- 空间参数模板：TXT 格式导入 / 导出，导入即套用
- Windows 便携版自带精简版 PowerShell 7，直播截获开箱可用
- 16-bit 与 24-bit PCM WAV
- 网页版、Android APK、Windows 便携版
- 4 条内置 CC0 示例素材

## 项目结构

```text
renderer/      本地网页版和渲染器核心
desktop/       Electron 桌面入口
materials/     CC0 测试素材与来源清单
android/       Capacitor Android 工程
tools/         移动包、APK、EXE 构建脚本
docs/          技术方案和实现说明
```

## 界面资源

| 文件 | 说明 |
|---|---|
| `renderer/background.jpg` | 主界面背景图，CSS 中叠加暗色蒙版与背景模糊保证文字对比度 |
| `renderer/icon.ico` | Windows 程序图标，打包时由多尺寸 PNG 合成 |
| `renderer/icon-*.png`、`apple-touch-icon.png` | 网页版 / 移动版 / 任务栏用的各尺寸图标 |

更换图标只需一条命令（源图会按中心裁剪成方形，再生成全部尺寸）：

```powershell
pwsh -File .\tools\make_icons.ps1 -Source D:\path\to\avatar.jpg
node .\tools\build_exe.mjs
```

## 本地网页版

安装 Node.js 后运行：

```powershell
node .\renderer\server.mjs
```

浏览器打开：

```text
http://127.0.0.1:4173
```

## 安装前端依赖

```powershell
npm install
```

## 构建手机包

```powershell
npm run build:mobile
```

输出：

```text
dist/asmr3d-v0.2-mobile/
dist/asmr3d-v0.2-mobile.zip
```

## 构建 Android APK

需要：

```text
JDK 21
Android SDK Platform 36
Android Build Tools 36
Gradle 8.14.3
```

设置 `JAVA_HOME`、`ANDROID_HOME` 和可选的 `GRADLE_HOME` 后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build_android.ps1
```

首次构建 Release APK 时，如果 `android/keystore.properties` 不存在，脚本会自动生成仅供本地测试的签名密钥。

## 构建 Windows EXE

```powershell
npm run exe:release
```

输出：

```text
dist/asmr3d-v0.2-win-x64/asmr3d空间渲染器.exe
dist/asmr3d-v0.2-win-x64.zip
```

## 素材许可

代码使用 MIT License。

测试音频来自 Freesound 上明确标注为 Creative Commons 0 的素材，逐条来源和作者见：

```text
materials/SOURCES.md
materials/manifest.json
```

## 技术边界

- 双耳兼容模式处理的是完整声场，不恢复原始对象位置。
- 普通双耳录音无法可靠反解为多个独立三维声源。
- 通用 HRTF 存在个体差异，不承诺精确的绝对方向。
- 距离控制属于主观感知模型，不是物理距离测量。
