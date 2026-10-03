$ErrorActionPreference = "Stop"

$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$AndroidDir = Join-Path $Root "android"
$LocalKeytool = Join-Path $Root "tools\android-build\jdk21\jdk-21.0.12.1+1\bin\keytool.exe"
$Keytool = if ($env:JAVA_HOME) {
    Join-Path $env:JAVA_HOME "bin\keytool.exe"
} else {
    $LocalKeytool
}
$Keystore = Join-Path $AndroidDir "asmr3d-release.keystore"
$Properties = Join-Path $AndroidDir "keystore.properties"

if (-not (Test-Path -LiteralPath $Keytool)) {
    throw "Local JDK 21 was not found. Run tools\build_android.ps1 first."
}
if ((Test-Path -LiteralPath $Keystore) -or (Test-Path -LiteralPath $Properties)) {
    Write-Host "Keystore already exists."
    exit 0
}

$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$Password = [Convert]::ToBase64String($bytes).Replace("+", "A").Replace("/", "B").Replace("=", "C")

& $Keytool -genkeypair `
    -keystore $Keystore `
    -alias asmr3d `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass $Password `
    -keypass $Password `
    -dname "CN=asmr3d, OU=Local Build, O=asmr3d, L=Shanghai, ST=Shanghai, C=CN"

@(
    "storeFile=../asmr3d-release.keystore"
    "storePassword=$Password"
    "keyAlias=asmr3d"
    "keyPassword=$Password"
) | Set-Content -LiteralPath $Properties -Encoding ascii

Write-Host "Created: $Keystore"
Write-Host "Created: $Properties"
