# Remove a named node (and its exclusively-owned mesh) from a GLB.
# Indices in children arrays and scene.nodes are remapped; BIN chunk is
# left intact (orphaned bufferViews are harmless).

param(
  [string]$GlbPath  = "C:\Users\wasap\projects\wasapok.com\castle\outside\Temmys-Castle-01.glb",
  [string]$NodeName = "Cube.016"
)

$raw = [System.IO.File]::ReadAllBytes($GlbPath)
$ms  = New-Object System.IO.MemoryStream(,$raw)
$br  = New-Object System.IO.BinaryReader($ms)

$magic = $br.ReadUInt32(); if ($magic -ne 0x46546C67) { throw "not a GLB" }
$null  = $br.ReadUInt32(); $null = $br.ReadUInt32()
$jsonLen  = $br.ReadUInt32(); $jsonType = $br.ReadUInt32()
if ($jsonType -ne 0x4E4F534A) { throw "no JSON chunk" }
$jsonBytes = $br.ReadBytes($jsonLen)
$binLen  = $br.ReadUInt32(); $binType = $br.ReadUInt32()
if ($binType -ne 0x004E4942) { throw "no BIN chunk" }
$bin = $br.ReadBytes($binLen)
$br.Close()

$json = [System.Text.Encoding]::UTF8.GetString($jsonBytes)
$g    = $json | ConvertFrom-Json

# ---- locate target node ----
$nodeIdx = -1
for ($i = 0; $i -lt $g.nodes.Count; $i++) {
  if ($g.nodes[$i].name -eq $NodeName) { $nodeIdx = $i; break }
}
if ($nodeIdx -lt 0) { throw "Node '$NodeName' not found in GLB" }
Write-Host "Found '$NodeName' at node[$nodeIdx]"

$meshProp = $g.nodes[$nodeIdx].mesh
$meshIdx  = if ($null -ne $meshProp) { [int]$meshProp } else { -1 }

# ---- is the mesh used by any other node? ----
$meshRefCount = 0
if ($meshIdx -ge 0) {
  for ($i = 0; $i -lt $g.nodes.Count; $i++) {
    if ($i -eq $nodeIdx) { continue }
    if ($null -ne $g.nodes[$i].mesh -and [int]$g.nodes[$i].mesh -eq $meshIdx) { $meshRefCount++ }
  }
}
$removeMesh = ($meshIdx -ge 0) -and ($meshRefCount -eq 0)
Write-Host "mesh=$meshIdx  refs_elsewhere=$meshRefCount  removeMesh=$removeMesh"

# ---- remap helper: after removing nodeIdx, all higher indices shift down ----
function Remap-NodeIdx([int]$idx) {
  if ($idx -eq $nodeIdx) { return -1 }
  if ($idx -gt $nodeIdx) { return ($idx - 1) }
  return $idx
}

# ---- remove node from array ----
$kept = [System.Collections.ArrayList]::new()
for ($i = 0; $i -lt $g.nodes.Count; $i++) {
  if ($i -ne $nodeIdx) { [void]$kept.Add($g.nodes[$i]) }
}
$g.nodes = $kept.ToArray()

# ---- fix children arrays in remaining nodes ----
foreach ($nd in $g.nodes) {
  if ($null -eq $nd.children) { continue }
  $nc = @()
  foreach ($c in $nd.children) {
    $r = Remap-NodeIdx([int]$c)
    if ($r -ge 0) { $nc += [int]$r }
  }
  $nd.children = $nc
}

# ---- fix scene.nodes ----
foreach ($sc in $g.scenes) {
  if ($null -eq $sc.nodes) { continue }
  $sn = @()
  foreach ($idx in $sc.nodes) {
    $r = Remap-NodeIdx([int]$idx)
    if ($r -ge 0) { $sn += [int]$r }
  }
  $sc.nodes = $sn
}

# ---- optionally remove mesh ----
if ($removeMesh) {
  Write-Host "Removing mesh[$meshIdx]"
  $km = [System.Collections.ArrayList]::new()
  for ($i = 0; $i -lt $g.meshes.Count; $i++) {
    if ($i -ne $meshIdx) { [void]$km.Add($g.meshes[$i]) }
  }
  $g.meshes = $km.ToArray()

  # remap mesh indices in remaining nodes
  foreach ($nd in $g.nodes) {
    if ($null -eq $nd.mesh) { continue }
    $mi = [int]$nd.mesh
    if ($mi -gt $meshIdx) { $nd.mesh = $mi - 1 }
  }
}

# ---- rebuild JSON chunk (space-padded to 4-byte boundary) ----
$newJson      = ($g | ConvertTo-Json -Depth 100 -Compress)
$rawJ         = [System.Text.Encoding]::UTF8.GetBytes($newJson)
$padJ         = (4 - ($rawJ.Length % 4)) % 4
$newJsonBytes = New-Object byte[] ($rawJ.Length + $padJ)
[Array]::Copy($rawJ, 0, $newJsonBytes, 0, $rawJ.Length)
for ($i = 0; $i -lt $padJ; $i++) { $newJsonBytes[$rawJ.Length + $i] = 0x20 }

# ---- BIN chunk unchanged (pad if needed) ----
$padB  = (4 - ($bin.Length % 4)) % 4
$newBin = New-Object byte[] ($bin.Length + $padB)
[Array]::Copy($bin, 0, $newBin, 0, $bin.Length)

# ---- write new GLB ----
$total = 12 + 8 + $newJsonBytes.Length + 8 + $newBin.Length
$fs = [System.IO.File]::Create($GlbPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint32]0x46546C67); $bw.Write([uint32]2); $bw.Write([uint32]$total)
$bw.Write([uint32]$newJsonBytes.Length); $bw.Write([uint32]0x4E4F534A); $bw.Write($newJsonBytes)
$bw.Write([uint32]$newBin.Length);      $bw.Write([uint32]0x004E4942); $bw.Write($newBin)
$bw.Close(); $fs.Close()

Write-Host ("Done. GLB rewritten: {0:N0} bytes" -f (Get-Item $GlbPath).Length)
