# pad_logo.ps1 — 로고 이미지를 기존 협약 로고와 같은 500x300 흰색 캔버스 중앙에 배치
# (원본 로고보다 크면 비율 유지해서 축소, 작으면 원래 크기 그대로 — 기존 로고들과 같은 방식)
Add-Type -AssemblyName System.Drawing

$canvasW = 500
$canvasH = 300

function Pad-Logo($path) {
  $src = [System.Drawing.Bitmap]::FromFile($path)
  $srcW = $src.Width
  $srcH = $src.Height

  $scale = [Math]::Min(1.0, [Math]::Min($canvasW / $srcW, $canvasH / $srcH))
  $newW = [Math]::Round($srcW * $scale)
  $newH = [Math]::Round($srcH * $scale)
  $offX = [Math]::Round(($canvasW - $newW) / 2)
  $offY = [Math]::Round(($canvasH - $newH) / 2)

  $canvas = New-Object System.Drawing.Bitmap($canvasW, $canvasH)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $destRect = New-Object System.Drawing.Rectangle($offX, $offY, $newW, $newH)
  $g.DrawImage($src, $destRect, 0, 0, $srcW, $srcH, [System.Drawing.GraphicsUnit]::Pixel)

  $g.Dispose()
  $src.Dispose()

  $tmp = "$path.tmp.png"
  $canvas.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  Remove-Item $path -Force
  Rename-Item $tmp $path

  Write-Output "$([System.IO.Path]::GetFileName($path)): ${srcW}x${srcH} -> 캔버스 500x300 (내용 ${newW}x${newH}, 중앙 배치)"
}

$files = @(
  "C:\dev\minddent-backup\images\uploads\logo-20260903002913.png",
  "C:\dev\minddent-backup\images\uploads\logo-20260903002919.png",
  "C:\dev\minddent-backup\images\uploads\logo-20260903002924.png",
  "C:\dev\minddent-backup\images\uploads\logo-20260903002929.png",
  "C:\dev\minddent-backup\images\uploads\logo-20260903002933.png",
  "C:\dev\minddent-backup\images\uploads\logo-20260903002938.png",
  "C:\dev\minddent-backup\images\uploads\logo-20260903002942.png"
)
foreach ($f in $files) { Pad-Logo $f }