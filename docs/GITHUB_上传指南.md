# GitHub 上传指南

发布顺序与准入条件以根目录 [AGENTS.md 的发布流程](../AGENTS.md#发布流程后续版本统一执行) 为准。本指南替换此前直接推送 `main` 的上传方式。

## 1. 在开发分支准备改动

在现有仓库中执行；先确认工作区干净，再更新主分支并建立开发分支：

```powershell
git switch main
git pull --ff-only origin main
git switch -c release/next-version
```

在开发分支完成版本号、源码和相关文档更新及验证。以下示例只暂存本次确认的文件：

```powershell
git add -- <本次修改的文件路径>
git commit -m "feat: 完成新版本改动"
git push -u origin release/next-version
```

## 2. 创建 PR 并完成审查

在 GitHub 创建 `release/next-version → main` 的 PR，按根目录发布流程完成最新提交审查、修复和验证后，再经授权合并。自动审查未触发时可在 PR 评论 `@codex review`。

上传前确认以下内容没有被提交：

```text
android/keystore.properties
android/*.keystore
tools/android-build/
node_modules/
dist/
```

这些内容已经写入 `.gitignore`。

## 3. 创建 Release

合并后更新本地主分支，确认工作区干净，从该提交构建并验收发布包。创建标签时明确选择该提交；版本号和标签使用本次新版本，下面的 v0.3.1 文件名仅为历史格式示例。

在仓库页面打开：

```text
Releases → Draft a new release
```

建议标签：

```text
v0.3.1-beta
```

资源包：

```text
asmr3d-v0.3.1-release-assets.zip
```

也可以分别上传：

```text
asmr3d-v0.3.1-test.apk
asmr3d-v0.3.1-test.apk.sha256
asmr3d-v0.3.1-android.zip
asmr3d-v0.3.1-win-x64.zip
asmr3d-v0.3.1-win-x64.zip.sha256
asmr3d-v0.3.1-mobile.zip
APK_使用教程.md
WINDOWS_INSTALL.md
```

通过现有上传脚本发布时，先核对脚本中的版本与目标标签，并跳过源码覆盖：

```powershell
$env:ASMR3D_SKIP_SOURCE_UPLOAD = "1"
node tools\github_upload.mjs
```

## 4. 设置仓库 Topics

推荐添加：

```text
asmr
spatial-audio
binaural
hrtf
web-audio
capacitor
electron
android
audio-processing
```

## 5. 开源许可

代码使用 MIT License。

测试音频使用 Creative Commons 0，来源与作者记录在：

```text
materials/SOURCES.md
materials/manifest.json
```
