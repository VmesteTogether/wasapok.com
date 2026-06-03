# Rebuild a GLB with embedded textures resampled to a target resolution.
# Quality-preserving defaults: 1024px max edge, JPEG q=88 for opaque maps,
# PNG (lossless) for any image that uses alpha. This is visibly indistinguishable
# from 2K source for the outside scene while shrinking 165 MB -> ~few MB.

param(
  [string]$InPath  = "C:\Users\wasap\Documents\Blend3rProjects\Temmys-Castle-01.glb",
  [string]$OutPath = "C:\Users\wasap\projects\wasapok.com\castle\outside\Temmys-Castle-01.q.glb",
  [int]$MaxDim     = 1024,
  [int]$JpegQ      = 88
)

Add-Type -AssemblyName System.Drawing

# ---- read GLB ----
$raw = [System.IO.File]::ReadAllBytes($InPath)
$br  = New-Object System.IO.BinaryReader([System.IO.MemoryStream]::new($raw))
$magic = $br.ReadUInt32(); if ($magic -ne 0x46546C67) { throw "not a GLB" }
$null = $br.ReadUInt32(); $null = $br.ReadUInt32()
$jsonLen = $br.ReadUInt32(); $jsonType = $br.ReadUInt32()
if ($jsonType -ne 0x4E4F534A) { throw "no JSON chunk" }
$jsonBytes = $br.ReadBytes($jsonLen)
$binLen = $br.ReadUInt32(); $binType = $br.ReadUInt32()
if ($binType -ne 0x004E4942) { throw "no BIN chunk" }
$bin = $br.ReadBytes($binLen)
$br.Close()

$json = [System.Text.Encoding]::UTF8.GetString($jsonBytes)
$g = $json | ConvertFrom-Json

function HasUsedAlpha([System.Drawing.Bitmap]$bmp) {
  $fmt = $bmp.PixelFormat
  $couldHaveAlpha = ($fmt -eq [System.Drawing.Imaging.PixelFormat]::Format32bppArgb) -or `
                    ($fmt -eq [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb) -or `
                    ($fmt -eq [System.Drawing.Imaging.PixelFormat]::Format64bppArgb)  -or `
                    ($fmt -eq [System.Drawing.Imaging.PixelFormat]::Format64bppPArgb)
  if (-not $couldHaveAlpha) { return $false }
  $probeW = [Math]::Min(256, $bmp.Width)
  $probeH = [Math]::Min(256, $bmp.Height)
  $probe = New-Object System.Drawing.Bitmap($probeW, $probeH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($probe)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g2.DrawImage($bmp, 0, 0, $probeW, $probeH)
  $g2.Dispose()
  $rect = New-Object System.Drawing.Rectangle(0, 0, $probeW, $probeH)
  $data = $probe.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                          [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $buf = New-Object byte[] ($data.Stride * $probeH)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $buf.Length)
  $probe.UnlockBits($data); $probe.Dispose()
  for ($i = 3; $i -lt $buf.Length; $i += 4) {
    if ($buf[$i] -lt 255) { return $true }
  }
  return $false
}

$newImgBytes = @{}
$newImgMime  = @{}
for ($i=0; $i -lt $g.images.Count; $i++) {
  $im = $g.images[$i]
  if ($im.bufferView -eq $null) { continue }
  $bv = $g.bufferViews[[int]$im.bufferView]
  $off = [int]$bv.byteOffset; if ($null -eq $bv.byteOffset) { $off = 0 }
  $len = [int]$bv.byteLength
  $imgBytes = New-Object byte[] $len
  [Array]::Copy($bin, $off, $imgBytes, 0, $len)

  $msIn = New-Object System.IO.MemoryStream(,$imgBytes)
  $src = [System.Drawing.Image]::FromStream($msIn)
  $useAlpha = HasUsedAlpha $src

  $w = $src.Width; $h = $src.Height
  $scale = [Math]::Min(1.0, $MaxDim / [Math]::Max($w, $h))
  $nw = [int][Math]::Max(1, [Math]::Round($w * $scale))
  $nh = [int][Math]::Max(1, [Math]::Round($h * $scale))

  $dstFmt = if ($useAlpha) { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb }
            else           { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb  }
  $dst = New-Object System.Drawing.Bitmap($nw, $nh, $dstFmt)
  $gfx = [System.Drawing.Graphics]::FromImage($dst)
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gfx.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  if ($useAlpha) { $gfx.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy }
  $gfx.DrawImage($src, 0, 0, $nw, $nh)
  $gfx.Dispose()

  $msOut = New-Object System.IO.MemoryStream
  if ($useAlpha) {
    $dst.Save($msOut, [System.Drawing.Imaging.ImageFormat]::Png)
    $mime = 'image/png'
  } else {
    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $eps = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $eps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$JpegQ)
    $dst.Save($msOut, $jpegCodec, $eps)
    $mime = 'image/jpeg'
  }
  $newBytes = $msOut.ToArray()

  $src.Dispose(); $dst.Dispose(); $msIn.Dispose(); $msOut.Dispose()
  $newImgBytes[[int]$im.bufferView] = $newBytes
  $newImgMime[[int]$im.bufferView]  = $mime
  $tag = if ($useAlpha) { 'PNG+alpha' } else { 'JPEG q=88 ' }
  Write-Host ("  image[{0,2}] {1,5}x{2,-5} -> {3,4}x{4,-4}  {5}  {6,10:N0} -> {7,7:N0} bytes  ({8})" -f $i,$w,$h,$nw,$nh,$tag,$len,$newBytes.Length,$im.name)
}

function Align4([int]$n) { return ($n + 3) -band -bnot 3 }

$bvCount = $g.bufferViews.Count
$newOffsets = New-Object int[] $bvCount
$newLengths = New-Object int[] $bvCount
$pieces = New-Object System.Collections.ArrayList
$cursor = 0
for ($k=0; $k -lt $bvCount; $k++) {
  $bv = $g.bufferViews[$k]
  $oldOff = [int]$bv.byteOffset; if ($null -eq $bv.byteOffset) { $oldOff = 0 }
  $oldLen = [int]$bv.byteLength
  if ($newImgBytes.ContainsKey($k)) { $data = $newImgBytes[$k] }
  else {
    $data = New-Object byte[] $oldLen
    [Array]::Copy($bin, $oldOff, $data, 0, $oldLen)
  }
  $newOffsets[$k] = $cursor
  $newLengths[$k] = $data.Length
  [void]$pieces.Add($data)
  $cursor += $data.Length
  $padTo = Align4 $cursor
  if ($padTo -gt $cursor) {
    [void]$pieces.Add((New-Object byte[] ($padTo - $cursor)))
    $cursor = $padTo
  }
}
$newBin = New-Object byte[] $cursor
$o = 0
foreach ($p in $pieces) { [Array]::Copy($p, 0, $newBin, $o, $p.Length); $o += $p.Length }

for ($k=0; $k -lt $bvCount; $k++) {
  $g.bufferViews[$k].byteOffset = $newOffsets[$k]
  $g.bufferViews[$k].byteLength = $newLengths[$k]
}
$g.buffers[0].byteLength = $newBin.Length
for ($i=0; $i -lt $g.images.Count; $i++) {
  $im = $g.images[$i]
  if ($im.bufferView -ne $null -and $newImgMime.ContainsKey([int]$im.bufferView)) {
    $im.mimeType = $newImgMime[[int]$im.bufferView]
  }
}

$newJson = ($g | ConvertTo-Json -Depth 100 -Compress)
$rawJsonBytes = [System.Text.Encoding]::UTF8.GetBytes($newJson)
$padJson = (Align4 $rawJsonBytes.Length) - $rawJsonBytes.Length
$newJsonBytes = New-Object byte[] ($rawJsonBytes.Length + $padJson)
[Array]::Copy($rawJsonBytes, 0, $newJsonBytes, 0, $rawJsonBytes.Length)
for ($i=0; $i -lt $padJson; $i++) { $newJsonBytes[$rawJsonBytes.Length + $i] = 0x20 }

$padBin = (Align4 $newBin.Length) - $newBin.Length
if ($padBin -gt 0) {
  $padded = New-Object byte[] ($newBin.Length + $padBin)
  [Array]::Copy($newBin, 0, $padded, 0, $newBin.Length)
  $newBin = $padded
}

$totalLen = 12 + 8 + $newJsonBytes.Length + 8 + $newBin.Length
$fs = [System.IO.File]::Create($OutPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint32]0x46546C67); $bw.Write([uint32]2); $bw.Write([uint32]$totalLen)
$bw.Write([uint32]$newJsonBytes.Length); $bw.Write([uint32]0x4E4F534A); $bw.Write($newJsonBytes)
$bw.Write([uint32]$newBin.Length); $bw.Write([uint32]0x004E4942); $bw.Write($newBin)
$bw.Close(); $fs.Close()

$inSz  = (Get-Item $InPath).Length
$outSz = (Get-Item $OutPath).Length
Write-Host ""
Write-Host ("INPUT : {0,12:N0} bytes  ({1:N2} MB)" -f $inSz,  ($inSz  / 1MB))
Write-Host ("OUTPUT: {0,12:N0} bytes  ({1:N2} MB)" -f $outSz, ($outSz / 1MB))
Write-Host ("Saved : {0:N1}%" -f (100 - (100.0 * $outSz / $inSz)))
