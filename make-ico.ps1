param([string]$Src, [string]$Dst)
Add-Type -AssemblyName System.Drawing
$sizes = @(256, 48, 32, 16)
$pngs = @()
$img = [System.Drawing.Bitmap]::new($Src)
foreach ($s in $sizes) {
  $b = [System.Drawing.Bitmap]::new($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $rect = [System.Drawing.Rectangle]::new(0, 0, $s, $s)
  $g.DrawImage($img, $rect)
  $g.Dispose()
  $ms = [System.IO.MemoryStream]::new()
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += ,@($s, $ms.ToArray())
  $b.Dispose()
}
$img.Dispose()
$fs = [System.IO.File]::Create($Dst)
$w = [System.IO.BinaryWriter]::new($fs)
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$pngs.Count)
$offset = 6 + 16 * $pngs.Count
foreach ($p in $pngs) {
  $s = $p[0]; $data = $p[1]
  $wb = if ($s -ge 256) { 0 } else { $s }
  $w.Write([byte]$wb); $w.Write([byte]$wb); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$data.Length); $w.Write([uint32]$offset)
  $offset += $data.Length
}
foreach ($p in $pngs) { $w.Write($p[1]) }
$w.Close(); $fs.Close()
Write-Output ("ICO saved: {0} bytes={1}" -f $Dst, (Get-Item $Dst).Length)