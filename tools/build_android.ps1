$ErrorActionPreference = "Stop"

$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$BuildRoot = Join-Path $Root "tools\android-build"
$LocalJavaHome = Join-Path $BuildRoot "jdk21\jdk-21.0.12.1+1"
$LocalAndroidHome = Join-Path $BuildRoot "android-sdk"
$JavaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { $LocalJavaHome }
$AndroidHome = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $LocalAndroidHome }
$GradleUserHome = Join-Path $BuildRoot "gradle-home"
$LocalGradle = Join-Path $BuildRoot "gradle-8.14.3\gradle-8.14.3\bin\gradle.bat"
$Gradle = if ($env:GRADLE_HOME) {
    Join-Path $env:GRADLE_HOME "bin\gradle.bat"
} else {
    $LocalGradle
}

if (-not (Test-Path -LiteralPath (Join-Path $JavaHome "bin\java.exe"))) {
    throw "JDK 21 was not found. Set JAVA_HOME or install the project-local toolchain."
}
if (-not (Test-Path -LiteralPath $AndroidHome)) {
    throw "Android SDK was not found. Set ANDROID_HOME or install the project-local toolchain."
}
if (-not (Test-Path -LiteralPath $Gradle)) {
    throw "Gradle 8.14.3 was not found. Set GRADLE_HOME or install the project-local toolchain."
}

if (-not (Test-Path -LiteralPath (Join-Path $Root "android\keystore.properties"))) {
    & (Join-Path $Root "tools\create_android_keystore.ps1")
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_SDK_ROOT = $AndroidHome
$env:GRADLE_USER_HOME = $GradleUserHome

Push-Location $Root
try {
    & "D:\NODE\node.exe" (Join-Path $Root "tools\build_mobile.mjs")
    & "D:\NODE\npx.cmd" cap sync android
} finally {
    Pop-Location
}

Push-Location (Join-Path $Root "android")
try {
    & $Gradle assembleRelease --no-daemon
} finally {
    Pop-Location
}

$SourceApk = Join-Path $Root "android\app\build\outputs\apk\release\app-release.apk"
$OutputApk = Join-Path $Root "dist\asmr3d空间渲染器-v0.1测试版.apk"
Copy-Item -LiteralPath $SourceApk -Destination $OutputApk -Force

$Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputApk).Hash
$HashFile = "$OutputApk.sha256"
Set-Content -LiteralPath $HashFile -Value "$Hash  $(Split-Path $OutputApk -Leaf)" -Encoding utf8NoBOM

Write-Host "APK: $OutputApk"
Write-Host "SHA256: $Hash"
