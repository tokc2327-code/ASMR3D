$ErrorActionPreference = "Stop"

$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ElectronCandidates = @(
    (Join-Path $Root "node_modules\electron\dist\electron.exe"),
    (Join-Path $Root "tools\electron-runtime\electron.exe")
)
$Electron = $ElectronCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$Probe = Join-Path $Root "tools\live_capture_probe\main.cjs"

if (-not $Electron) {
    throw "Electron was not found. Run npm install first."
}

& $Electron $Probe
