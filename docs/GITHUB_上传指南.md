# GitHub 上传指南

## 1. 创建仓库

在 GitHub 新建仓库，例如：

```text
asmr3d-spatial-renderer
```

建议设置为 Public，并选择：

```text
Add a README file：不勾选
Add .gitignore：不勾选
Choose a license：不勾选
```

上传源码包中的 README、LICENSE 和 .gitignore，避免创建重复文件。

## 2. 上传源码

解压：

```text
asmr3d-v0.3.1-github-source.zip
```

将解压后的全部内容上传到仓库根目录。

使用 Git 命令行时：

```powershell
git init
git add .
git commit -m "Initial open source release v0.3.1"
git branch -M main
git remote add origin https://github.com/你的用户名/asmr3d-spatial-renderer.git
git push -u origin main
```

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
