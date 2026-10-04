# Regenerates every icon asset from one square-ish source image.
#
#   powershell -File tools/make_icons.ps1 -Source D:\art\avatar.jpg
#
# Outputs multi-resolution PNGs into renderer/, which the EXE build turns into
# renderer/icon.ico and which the PWA/mobile build ships as-is.
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "renderer")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$resolved = (Resolve-Path -LiteralPath $Source).Path
$image = [System.Drawing.Image]::FromFile($resolved)

try {
    # Centre-crop to a square so non-square sources keep the subject.
    $side = [Math]::Min($image.Width, $image.Height)
    $sourceRect = New-Object System.Drawing.Rectangle(
        [int](($image.Width - $side) / 2),
        [int](($image.Height - $side) / 2),
        $side,
        $side)

    $targets = @(
        @{ Name = "icon-512.png"; Size = 512 },
        @{ Name = "icon-256.png"; Size = 256 },
        @{ Name = "icon-192.png"; Size = 192 },
        @{ Name = "apple-touch-icon.png"; Size = 180 },
        @{ Name = "icon-128.png"; Size = 128 },
        @{ Name = "icon-64.png"; Size = 64 },
        @{ Name = "icon-48.png"; Size = 48 },
        @{ Name = "icon-32.png"; Size = 32 },
        @{ Name = "icon-16.png"; Size = 16 }
    )

    if (-not (Test-Path -LiteralPath $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }

    foreach ($target in $targets) {
        $bitmap = New-Object System.Drawing.Bitmap($target.Size, $target.Size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.DrawImage(
                $image,
                (New-Object System.Drawing.Rectangle(0, 0, $target.Size, $target.Size)),
                $sourceRect,
                [System.Drawing.GraphicsUnit]::Pixel)
        }
        finally {
            $graphics.Dispose()
        }
        $outPath = Join-Path $OutputDir $target.Name
        $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bitmap.Dispose()
        Write-Host ("{0,-22} {1}x{1}  {2} KB" -f $target.Name, $target.Size, [Math]::Round((Get-Item $outPath).Length / 1KB, 1))
    }
}
finally {
    $image.Dispose()
}

Write-Host "图标已生成到 $OutputDir"
