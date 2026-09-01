# serve.ps1 - 로컬 검증용 정적 서버 (http://localhost:8811/)
$root = "C:\dev\minddent-backup"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8811/")
$listener.Start()
Write-Output "serving $root at http://localhost:8811/"
$mime = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="application/javascript; charset=utf-8";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"; ".svg"="image/svg+xml";
  ".webp"="image/webp"; ".ico"="image/x-icon"; ".woff2"="font/woff2"; ".woff"="font/woff"; ".ttf"="font/ttf";
  ".eot"="application/vnd.ms-fontobject"; ".json"="application/json; charset=utf-8"; ".mp4"="video/mp4"; ".txt"="text/plain; charset=utf-8"; ".md"="text/plain; charset=utf-8" }
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path.EndsWith("/")) { $path = $path + "index.html" }
    $file = Join-Path $root ($path.TrimStart("/") -replace "/", "\")
    if ((Test-Path $file -PathType Container)) { $file = Join-Path $file "index.html" }
    if (-not (Test-Path $file -PathType Leaf)) {
      # 확장자 없는 경로 → 디렉터리 index.html
      $try = Join-Path $root (($path.TrimStart("/") -replace "/", "\") + "\index.html")
      if (Test-Path $try -PathType Leaf) { $file = $try }
    }
    if (Test-Path $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404: $path")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
  } catch { }
}