$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing

$src = 'E:\Yandex.Disk\Работа\Композит'
$dst = 'G:\opencode\2026-11-25-001\site\public\img'

# ТОЛЬКО проверенные чистые рендеры: без чертежей, штампов, логотипов и подписей
$map = @(
  @{ out = 'clean-01.jpg'; f = '2022.08.16\Вторая очередь\Затвор УТ-00021660\Обработка\Отливка.png' },
  @{ out = 'clean-02.jpg'; f = '2022.08.16\Вторая очередь\Лист броневой внутренний УТ-00021661\Согласование\Отливка.png' },
  @{ out = 'clean-03.jpg'; f = '2023.09.26   станочные детали\Ползун 403320-3.22.101\Отливка.png' },
  @{ out = 'clean-04.jpg'; f = '2023.08.16 Фланец Кожух Корпус улитки Рабоче колесо и т д\Корпус насоса ПН11.00.02\СБорка.png' },
  @{ out = 'clean-05.jpg'; f = '2023.08.16 Фланец Кожух Корпус улитки Рабоче колесо и т д\Корпус насоса ПН11.00.02\Ящики.png' },
  @{ out = 'clean-06.jpg'; f = '2023.09.26   станочные детали\Станина 403320-3.01.101\Для артёма\Сборка.png' },
  @{ out = 'clean-07.jpg'; f = '2026.04.20 Барабан\обработка\Деталь+ отливка.png' },
  @{ out = 'clean-08.jpg'; f = '2024.03.29 турачка и крышка\Турачка_тяговой_лебедки чертеж ЖСЦК.В960.210.039\Обработка\Отливка.png' },
  @{ out = 'clean-09.jpg'; f = '2025.07.01 Крышка, корпус  и лопасти\Крышка нижняя 1137.10000.05\Обработка\Отливка.png' },
  @{ out = 'clean-10.jpg'; f = '2023.10.30 DN и PN два корпуса\DN 50 PN160\обработка №2\да\Сборка.jpg' }
)

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)
$maxW = 1600

foreach ($m in $map) {
  $srcPath = Join-Path $src $m.f
  $outPath = Join-Path $dst $m.out
  if (-not (Test-Path -LiteralPath $srcPath)) { Write-Host ("MISSING: " + $m.f); continue }
  $img = [System.Drawing.Image]::FromFile($srcPath)
  try {
    $w = $img.Width; $h = $img.Height
    if ($w -gt $maxW) { $nh = [int][Math]::Round($h * ($maxW / $w)); $nw = $maxW } else { $nw = $w; $nh = $h }
    $bmp = New-Object System.Drawing.Bitmap($nw, $nh)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($img, 0, 0, $nw, $nh)
    $g.Dispose()
    $bmp.Save($outPath, $codec, $params)
    $bmp.Dispose()
    Write-Host ("OK  {0}  {1}x{2}  {3} KB" -f $m.out, $nw, $nh, [int]((Get-Item -LiteralPath $outPath).Length / 1KB))
  } finally { $img.Dispose() }
}
