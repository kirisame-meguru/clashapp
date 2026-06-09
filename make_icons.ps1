<#
.SYNOPSIS
    Regenerate every app icon from resources/app_icon_source.svg.

.DESCRIPTION
    Rasterizes the single source SVG into all icon files the project ships,
    forcing the exact pixel dimensions / embedded sizes the current files use
    so nothing changes size. Requires ImageMagick v7 ("magick" on PATH).

    Each output is rendered straight from the SVG (ImageMagick's built-in librsvg
    coder handles the plain .svg input in-process).

    Outputs:
      src/renderer/src/assets/bitumi-logo.png   512x512 PNG RGBA
      build/icon.png                            512x512 PNG RGBA
      resources/icon.png                        512x512 PNG RGBA
      resources/icon_off.png                    512x512 PNG RGBA
      resources/icon_on_mac.png                 80x80   PNG RGBA
      resources/icon_off_mac.png                80x80   PNG RGBA
      resources/icon.ico                        ICO  16,24,32,48,64,256
      build/icon.ico                            ICO  16,24,32,48,64,256
      resources/icon_off.ico                    ICO  16,24,32,48,64,128,256
      build/icon.icns                           ICNS icp4,icp5,icp6,ic07,ic08,ic09,ic10
      build/installerIcon.ico                   ICO  16,24,32,48,64,256

    The installer icon is special: the source logo is dropped behind the
    pre-windowed cardboard-box artwork in build/installerIcon_template.png (a
    256px box whose card slot is a transparent window, flaps opaque on top).
    The logo shows through edge-to-edge and tucks behind the flaps. The window
    is baked once by prepare_installer_template.ps1.
#>

$ErrorActionPreference = 'Stop'

# Always operate relative to this script's folder (the project root).
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$svg = Join-Path $root 'resources\app_icon_source.svg'
if (-not (Test-Path $svg)) { throw "Source SVG not found: $svg" }

# Require ImageMagick v7 (the `magick` driver).
$magickCmd = Get-Command magick -ErrorAction SilentlyContinue
if (-not $magickCmd) { throw "ImageMagick 'magick' not found on PATH. Install ImageMagick v7." }
$magick = $magickCmd.Source

function Invoke-Magick {
    param([string[]]$MagickArgs)
    & $magick @MagickArgs
    if ($LASTEXITCODE -ne 0) { throw "magick failed (exit $LASTEXITCODE): magick $($MagickArgs -join ' ')" }
}

# --- helpers ----------------------------------------------------------------

# Render the source SVG to a square PNG of the given size (RGBA, 8-bit).
function New-Png {
    param([int]$Size, [string]$OutPath)
    $dir = Split-Path -Parent $OutPath
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    # NOTE: use "prefix:$var" interpolation, NOT 'prefix:' + $var. Inside an @(...)
    # array literal the comma binds tighter than +, so 'PNG32:' + $OutPath would
    # split into two elements ('PNG32:' and the path); magick then reads the bare
    # 'PNG32:' as stdin and hangs forever.
    Invoke-Magick @(
        '-background', 'none',
        $svg,
        '-resize', "${Size}x${Size}",
        '-depth', '8',
        "PNG32:$OutPath"
    )
    Write-Host "  + $OutPath  (${Size}x${Size})"
}

# Build a multi-size .ico from the source SVG with an exact set of embedded sizes.
function New-Ico {
    param([int[]]$Sizes, [string]$OutPath)
    $dir = Split-Path -Parent $OutPath
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Invoke-Magick @(
        '-background', 'none',
        $svg,
        '-define', "icon:auto-resize=$($Sizes -join ',')",
        $OutPath
    )
    Write-Host "  + $OutPath  (sizes: $($Sizes -join ', '))"
}

# Assemble a macOS .icns from per-size PNGs rendered from the source SVG.
# Each entry is: 4-byte OSType + 4-byte big-endian length (incl. 8-byte header) + PNG bytes.
function New-Icns {
    param(
        [hashtable]$TypeToSize,   # OSType (4 chars) -> pixel size
        [string]$WorkDir,
        [string]$OutPath
    )
    $dir = Split-Path -Parent $OutPath
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

    $body = New-Object System.IO.MemoryStream
    # Preserve a stable, conventional order (smallest -> largest).
    foreach ($entry in ($TypeToSize.GetEnumerator() | Sort-Object Value)) {
        $osType = $entry.Key
        $size   = [int]$entry.Value
        $png    = Join-Path $WorkDir "icns_$size.png"
        New-Png -Size $size -OutPath $png
        $pngBytes = [System.IO.File]::ReadAllBytes($png)

        $typeBytes = [System.Text.Encoding]::ASCII.GetBytes($osType)
        if ($typeBytes.Length -ne 4) { throw "ICNS OSType must be 4 chars: '$osType'" }

        $len = 8 + $pngBytes.Length
        $lenBytes = [System.BitConverter]::GetBytes([uint32]$len)
        if ([System.BitConverter]::IsLittleEndian) { [Array]::Reverse($lenBytes) } # big-endian

        $body.Write($typeBytes, 0, 4)
        $body.Write($lenBytes, 0, 4)
        $body.Write($pngBytes, 0, $pngBytes.Length)
    }

    $bodyBytes = $body.ToArray()
    $body.Dispose()

    $total = 8 + $bodyBytes.Length
    $totalBytes = [System.BitConverter]::GetBytes([uint32]$total)
    if ([System.BitConverter]::IsLittleEndian) { [Array]::Reverse($totalBytes) }

    $out = New-Object System.IO.MemoryStream
    $out.Write([System.Text.Encoding]::ASCII.GetBytes('icns'), 0, 4)
    $out.Write($totalBytes, 0, 4)
    $out.Write($bodyBytes, 0, $bodyBytes.Length)
    [System.IO.File]::WriteAllBytes($OutPath, $out.ToArray())
    $out.Dispose()
    Write-Host "  + $OutPath  (entries: $(($TypeToSize.Keys | Sort-Object) -join ', '))"
}

# Composite the source logo into the pre-windowed cardboard-box template and
# emit the installer ICO.
#
# All the geometry lives in the template, not here: build/installerIcon_template.png
# is a 256x256 box whose card slot has been punched out to a transparent window
# (the full rounded-rect bezel, so the logo shows edge-to-edge with no frame),
# while the box's tan front flaps remain opaque on top. So the only work left is
# to render the logo at the card's size and slip it BEHIND the box -- the window
# clips it to the rounded card shape and the flaps occlude it automatically.
# See prepare_installer_template.ps1 for how the window is baked.
#
# Card placement within the 256x256 template: origin (59,8), size 138x138.
function New-InstallerIcon {
    param(
        [string]$BoxPng,    # 256x256 pre-windowed box template
        [int[]]$Sizes,
        [string]$OutPath
    )
    if (-not (Test-Path $BoxPng)) { throw "Installer box template not found: $BoxPng" }
    $dir = Split-Path -Parent $OutPath
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

    # Logo (rendered inline at card size) placed behind the windowed box, then
    # straight out to the multi-size ICO -- one pass.
    Invoke-Magick @(
        '-size', '256x256', 'xc:none',
        '(', '-background', 'none', $svg, '-resize', '138x138', '-depth', '8', ')',
        '-geometry', '+59+8', '-compose', 'over', '-composite',
        $BoxPng, '-compose', 'over', '-composite',
        '-define', "icon:auto-resize=$($Sizes -join ',')",
        $OutPath
    )
    Write-Host "  + $OutPath  (sizes: $($Sizes -join ', '))"
}

# --- generate ---------------------------------------------------------------

$work = Join-Path $root '.icon_build_tmp'
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force -Path $work | Out-Null

try {
    Write-Host "PNGs:"
    New-Png -Size 512 -OutPath 'src\renderer\src\assets\bitumi-logo.png'
    New-Png -Size 512 -OutPath 'build\icon.png'
    New-Png -Size 512 -OutPath 'resources\icon.png'
    New-Png -Size 512 -OutPath 'resources\icon_off.png'
    New-Png -Size 80  -OutPath 'resources\icon_on_mac.png'
    New-Png -Size 80  -OutPath 'resources\icon_off_mac.png'

    Write-Host "ICOs:"
    New-Ico -Sizes @(16,24,32,48,64,256)     -OutPath 'resources\icon.ico'
    New-Ico -Sizes @(16,24,32,48,64,256)     -OutPath 'build\icon.ico'
    New-Ico -Sizes @(16,24,32,48,64,128,256) -OutPath 'resources\icon_off.ico'

    Write-Host "Installer:"
    New-InstallerIcon -BoxPng 'build\installerIcon_template.png' -Sizes @(16,24,32,48,64,256) `
        -OutPath 'build\installerIcon.ico'

    Write-Host "ICNS:"
    New-Icns -TypeToSize @{
        'icp4' = 16
        'icp5' = 32
        'icp6' = 64
        'ic07' = 128
        'ic08' = 256
        'ic09' = 512
        'ic10' = 1024
    } -WorkDir $work -OutPath 'build\icon.icns'
}
finally {
    if (Test-Path $work) { Remove-Item -Recurse -Force $work }
}

Write-Host ""
Write-Host "Done. All icons regenerated from resources/app_icon_source.svg." -ForegroundColor Green
