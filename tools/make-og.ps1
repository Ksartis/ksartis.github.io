$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

$root = 'G:\opencode\2026-11-25-001\site'
$out  = Join-Path $root 'public\og-image.jpg'
$model = Join-Path $root 'public\img\clean-04.jpg'

$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(247,247,245))
$g.FillRectangle($bg, 0, 0, $W, $H)

# тонкая сетка
$gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18,20,22,26), 1)
for ($x = 0; $x -lt $W; $x += 40) { $g.DrawLine($gridPen, $x, 0, $x, $H) }
for ($y = 0; $y -lt $H; $y += 40) { $g.DrawLine($gridPen, 0, $y, $W, $y) }
$gridPen.Dispose()

# верхняя оранжевая полоса
$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(228,87,46))
$g.FillRectangle($accent, 0, 0, $W, 8)

# логотип-квадрат
$dark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22,24,29))
$g.FillRectangle($dark, 72, 60, 56, 56)
$mono = New-Object System.Drawing.Font('Consolas', 26, [System.Drawing.FontStyle]::Bold)
$orange = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(228,87,46))
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('ks', $mono, $orange, (New-Object System.Drawing.RectangleF(72, 60, 56, 56)), $sf)

# подпись бренда
$brandFont = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Bold)
$ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22,24,29))
$g.DrawString('ksartis', $brandFont, $ink, 144, 70)

# заголовок
$h1 = New-Object System.Drawing.Font('Segoe UI', 42, [System.Drawing.FontStyle]::Bold)
$line1 = 'Литейная оснастка,'
$line2 = 'которая даёт'
$line3 = 'годную отливку'
$g.DrawString($line1, $h1, $ink, 68, 200)
$g.DrawString($line2, $h1, $ink, 68, 256)
$g.DrawString($line3, $h1, $ink, 68, 312)

# подзаголовок
$sub = New-Object System.Drawing.Font('Segoe UI', 19)
$gray = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(107,114,128))
$g.DrawString('Инженер-конструктор литейного производства', $sub, $gray, 72, 408)
$g.DrawString('Модельная оснастка · КД · 3D-модели', $sub, $gray, 72, 442)

# сайт
$siteFont = New-Object System.Drawing.Font('Consolas', 18, [System.Drawing.FontStyle]::Bold)
$g.DrawString('ksartis.ru', $siteFont, $orange, 72, 520)

# картинка справа
$img = [System.Drawing.Image]::FromFile($model)
$x = 660; $y = 110; $w = 470; $h = 410
$g.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)), $x - 10, $y - 10, $w + 20, $h + 20)

# кадрирование по центру (cover)
$srcRatio = $img.Width / $img.Height
$dstRatio = $w / $h
if ($srcRatio -gt $dstRatio) {
  $sh = $img.Height; $sw = [int]($sh * $dstRatio); $sx = [int](($img.Width - $sw) / 2); $sy = 0
} else {
  $sw = $img.Width; $sh = [int]($sw / $dstRatio); $sx = 0; $sy = [int](($img.Height - $sh) / 2)
}
$g.DrawImage($img, (New-Object System.Drawing.Rectangle($x, $y, $w, $h)), $sx, $sy, $sw, $sh, [System.Drawing.GraphicsUnit]::Pixel)
$img.Dispose()

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]90)
$bmp.Save($out, $codec, $params)

$g.Dispose(); $bmp.Dispose()
Write-Host ("OK: " + $out + "  " + [int]((Get-Item -LiteralPath $out).Length / 1KB) + " KB")
