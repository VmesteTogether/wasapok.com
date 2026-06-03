$root = "C:\Users\wasap\projects\wasapok.com"
$prefix = "http://localhost:8731/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix"
$mime = @{
  ".html"="text/html"; ".js"="text/javascript"; ".mjs"="text/javascript";
  ".css"="text/css"; ".json"="application/json"; ".png"="image/png";
  ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"; ".svg"="image/svg+xml";
  ".mp3"="audio/mpeg"; ".glb"="model/gltf-binary"; ".obj"="text/plain";
  ".ttf"="font/ttf"; ".woff"="font/woff"; ".woff2"="font/woff2"; ".ico"="image/x-icon"
}
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
    if ($rel -eq "") { $rel = "index.html" }
    $path = Join-Path $root $rel
    if ((Test-Path $path -PathType Container)) { $path = Join-Path $path "index.html" }
    if (Test-Path $path -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ctx.Response.ContentType = $ct
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.OutputStream.Close()
  } catch { }
}
