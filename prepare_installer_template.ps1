<#
.SYNOPSIS
    Bake the transparent card "window" into the installer-box template.

.DESCRIPTION
    make_icons.ps1 builds the installer icon by slipping the app logo BEHIND
    build/installerIcon_template.png. For that to work edge-to-edge, the box's
    card slot must already be a transparent window (the full rounded-rect bezel),
    with the tan front flaps left opaque on top so they occlude the logo.

    This one-off prep does exactly that: it takes the pristine hand-edited box
    (build/installerIcon_box_src.png) and punches the window, writing the result
    to build/installerIcon_template.png. Run it only when the box artwork changes
    -- the day-to-day icon build never needs it.

    Card geometry within the 256x256 box: origin (59,8), size 138x138, corner
    radius 30. Flaps are detected as the box's warm (red-dominant) tan pixels.

    Requires ImageMagick v7 ("magick" on PATH).
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$src = Join-Path $root 'build\installerIcon_box_src.png'   # pristine editable box
$out = Join-Path $root 'build\installerIcon_template.png'   # windowed runtime asset
if (-not (Test-Path $src)) { throw "Pristine box not found: $src" }

$magickCmd = Get-Command magick -ErrorAction SilentlyContinue
if (-not $magickCmd) { throw "ImageMagick 'magick' not found on PATH. Install ImageMagick v7." }
$magick = $magickCmd.Source

function Invoke-Magick {
    param([string[]]$MagickArgs)
    & $magick @MagickArgs
    if ($LASTEXITCODE -ne 0) { throw "magick failed (exit $LASTEXITCODE): magick $($MagickArgs -join ' ')" }
}

$work = Join-Path $root '.prep_tmp'
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force -Path $work | Out-Null

try {
    $rect   = Join-Path $work 'rect.png'    # card rounded-rect region
    $flap   = Join-Path $work 'flap.png'    # warm tan (flap) pixels
    $window = Join-Path $work 'window.png'  # rect AND NOT flap = pixels to clear
    $oldA   = Join-Path $work 'oldA.png'    # box's existing alpha
    $newA   = Join-Path $work 'newA.png'    # alpha with the window cut out

    # window = card rounded-rect, minus wherever a flap covers it.
    Invoke-Magick @('-size', '256x256', 'xc:black', '-fill', 'white',
                    '-draw', 'roundrectangle 59,8 197,146 30,30', $rect)
    Invoke-Magick @($src, '-alpha', 'off', '-fx', '(r-b) > 0.05 ? 1 : 0', $flap)
    Invoke-Magick @($rect, '(', $flap, '-negate', ')', '-compose', 'multiply', '-composite', $window)

    # new alpha = old alpha cleared inside the window.
    Invoke-Magick @($src, '-alpha', 'extract', $oldA)
    Invoke-Magick @($oldA, '(', $window, '-negate', ')', '-compose', 'multiply', '-composite', $newA)

    # apply the new alpha back onto the box's colors.
    Invoke-Magick @($src, $newA, '-compose', 'CopyOpacity', '-composite', "PNG32:$out")
    Write-Host "  + $out  (windowed installer-box template)" -ForegroundColor Green
}
finally {
    if (Test-Path $work) { Remove-Item -Recurse -Force $work }
}
