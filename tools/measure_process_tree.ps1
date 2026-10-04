param(
    [Parameter(Mandatory = $true)]
    [string]$PathPrefix
)

$normalizedPrefix = $PathPrefix.Replace("/", "\")
$processes = Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Path -and $_.Path.StartsWith(
            $normalizedPrefix,
            [System.StringComparison]::OrdinalIgnoreCase
        )
    }

[pscustomobject]@{
    ProcessCount = @($processes).Count
    CpuSeconds = [Math]::Round(
        (($processes | Measure-Object -Property CPU -Sum).Sum),
        4
    )
    WorkingSetMB = [Math]::Round(
        (($processes | Measure-Object -Property WorkingSet64 -Sum).Sum / 1MB),
        1
    )
} | ConvertTo-Json -Compress
