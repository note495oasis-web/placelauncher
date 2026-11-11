param([string]$Src, [string]$Dst)
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap($Src)
function Px([int]$x,[int]$y){ $c=$bmp.GetPixel($x,$y); return @($c.R,$c.G,$c.B) }
function IsBlack([int]$x,[int]$y){ $p=Px $x $y; return ($p[0] -lt 100 -and $p[1] -lt 100 -and $p[2] -lt 100) }
$blue = Px 300 300
$panel = Px 500 510
$outer = Px 10 10
# top-right blue square right edge (row below circle, above square bottom)
$squareRight = 0
for ($x=900; $x -ge 500; $x--) { $p=Px $x 430; if ($p[0] -lt 100 -and $p[2] -gt 120) { $squareRight=$x; break } }
# panel right edge
$panelRight = 0
for ($x=1000; $x -ge 500; $x--) { $p=Px $x 500; if ($p[0] -lt 250) { $panelRight=$x; break } }
# circle bounds from lower half black pixels
$left=9999; $right=0; $bottom=0
for ($y=330; $y -le 440; $y++) { for ($x=770; $x -le 990; $x++) { if (IsBlack $x $y) { if ($x -lt $left){$left=$x}; if ($x -gt $right){$right=$x}; if ($y -gt $bottom){$bottom=$y} } } }
$outerR = ($right-$left)/2.0
$cx = ($right+$left)/2.0
$cy = $bottom-$outerR
$innerR = 0
for ($x=[int]$cx; $x -le [int]($cx+$outerR); $x++) { if (IsBlack $x ([int]$cy)) { $innerR=$x-$cx; break } }
# keep-arc: angles where wrist lines exist just outside the ring
$aMin=0; $aMax=-180; $found=$false
for ($a=-179; $a -le -1; $a++) {
  $rad=$a*[Math]::PI/180.0
  $px=[int]($cx+[Math]::Cos($rad)*($outerR+6)); $py=[int]($cy+[Math]::Sin($rad)*($outerR+6))
  if (IsBlack $px $py) { if (-not $found){$aMin=$a;$found=$true}; $aMax=$a }
}
Write-Output ("blue={0} panel={1} outer={2} squareRight={3} panelRight={4} cx={5} cy={6} outerR={7} innerR={8} keepArc={9}..{10}" -f ($blue -join ','),($panel -join ','),($outer -join ','),$squareRight,$panelRight,$cx,$cy,$outerR,$innerR,$aMin,$aMax)
$blueC=[System.Drawing.Color]::FromArgb(255,$blue[0],$blue[1],$blue[2])
$panelC=[System.Drawing.Color]::FromArgb(255,$panel[0],$panel[1],$panel[2])
$outerC=[System.Drawing.Color]::FromArgb(255,$outer[0],$outer[1],$outer[2])
$x0=[int]($cx-$outerR-7); $x1=[int]($cx+$outerR+7); $y0=[int]($cy-$outerR-7); $y1=[int]($cy+$outerR+7)
for ($y=$y0; $y -le $y1; $y++) {
  for ($x=$x0; $x -le $x1; $x++) {
    $dx=$x-$cx; $dy=$y-$cy; $d=[Math]::Sqrt($dx*$dx+$dy*$dy)
    if ($d -gt $outerR+6) { continue }
    $ang=[Math]::Atan2($dy,$dx)*180.0/[Math]::PI
    $inKeep = ($ang -ge ($aMin-1)) -and ($ang -le ($aMax+1))
    if ($inKeep -and $d -ge ($innerR-1)) { continue }
    if ($x -le $squareRight) { $bmp.SetPixel($x,$y,$blueC) }
    elseif ($x -le $panelRight) { $s=Px ($x-400) $y; $bmp.SetPixel($x,$y,[System.Drawing.Color]::FromArgb(255,$s[0],$s[1],$s[2])) }
    else { $s=Px $x ($y+300); $bmp.SetPixel($x,$y,[System.Drawing.Color]::FromArgb(255,$s[0],$s[1],$s[2])) }
  }
}
$bmp.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "SAVED $Dst"