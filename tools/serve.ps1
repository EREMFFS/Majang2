# 麻雀2 簡易ローカルサーバー（Python が無い Windows 用）。start.bat から呼ばれる。
param([int]$Port = 8765)
$root = Split-Path -Parent $PSScriptRoot
# 使用中のポートなら次の番号へ（前の版のサーバーが開いたまま等）
while ((Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) -ne $null) { $Port++ }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Start-Process "http://127.0.0.1:$Port/index.html"
Write-Host "麻雀2: http://127.0.0.1:$Port/index.html  (Ctrl+C で終了)"
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.webp'='image/webp'; '.woff2'='font/woff2'; '.mp4'='video/mp4'; '.ogg'='audio/ogg'; '.m4a'='audio/mp4'; '.mp3'='audio/mpeg'; '.wav'='audio/wav'; '.txt'='text/plain; charset=utf-8'; '.md'='text/plain; charset=utf-8' }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($path -eq '') { $path = 'index.html' }
  $file = Join-Path $root $path
  $full = [IO.Path]::GetFullPath($file)
  if ($full.StartsWith($root) -and (Test-Path $full -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($full)
    $ext = [IO.Path]::GetExtension($full).ToLower()
    if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
