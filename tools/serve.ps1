# serve.ps1 - 백업 사이트 로컬 서버 + 관리자 저장/게시 API
#  - http://localhost:8811/         : 백업 사이트 미리보기
#  - http://localhost:8811/admin/   : 관리자 페이지 (토큰 불필요, 로컬 모드)
$root = Split-Path -Parent $PSScriptRoot
$port = 8811

# git 출력(커밋 메시지 등)의 한글이 깨지지 않도록 UTF-8로 통일
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
  $listener.Start()
} catch {
  Write-Output "이미 실행 중이거나 포트를 사용할 수 없습니다: $port"
  exit 1
}
Write-Output "관리자 서버 실행 중 : http://localhost:$port/admin/"
Write-Output "사이트 미리보기      : http://localhost:$port/"
Write-Output "(이 창을 닫으면 관리자 프로그램이 종료됩니다)"

$mime = @{ ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".js"="application/javascript; charset=utf-8";
  ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif"; ".svg"="image/svg+xml";
  ".webp"="image/webp"; ".ico"="image/x-icon"; ".woff2"="font/woff2"; ".woff"="font/woff"; ".ttf"="font/ttf";
  ".eot"="application/vnd.ms-fontobject"; ".json"="application/json; charset=utf-8"; ".mp4"="video/mp4"; ".txt"="text/plain; charset=utf-8"; ".md"="text/plain; charset=utf-8" }

function Send-Json($ctx, $obj, $status = 200) {
  $json = $obj | ConvertTo-Json -Depth 8 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Read-Body($ctx) {
  $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
  $text = $reader.ReadToEnd()
  $reader.Close()
  return $text
}

# 쓰기 허용 경로: 콘텐츠 데이터와 업로드 이미지만 (사이트 HTML/에셋은 보호)
function Test-AllowedPath($rel) {
  if ($rel -match '\.\.') { return $false }
  if ($rel -match '^[a-zA-Z]:') { return $false }
  return ($rel -like 'data/*') -or ($rel -like 'images/uploads/*')
}

function Invoke-Git($argLine) {
  $out = cmd /c "chcp 65001 >nul && git -c i18n.logOutputEncoding=UTF-8 -C `"$root`" $argLine 2>&1"
  return ($out | Out-String)
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    $method = $ctx.Request.HttpMethod

    # ---------------- 관리자 로컬 API ----------------
    if ($path -eq "/__api/ping") {
      $branch = (Invoke-Git "rev-parse --abbrev-ref HEAD").Trim()
      $remote = (Invoke-Git "remote get-url origin").Trim()
      $siteBase = ""
      if ($remote -match 'github\.com[:/]([^/]+)/([^/.]+)') {
        $siteBase = "https://" + $matches[1].ToLower() + ".github.io/" + $matches[2] + "/"
      }
      Send-Json $ctx @{ ok = $true; mode = "local"; root = $root; branch = $branch; siteBase = $siteBase }
      $ctx.Response.Close(); continue
    }

    if ($path -eq "/__api/read" -and $method -eq "GET") {
      $rel = $ctx.Request.QueryString["path"]
      $full = Join-Path $root ($rel -replace '/', '\')
      if (-not (Test-Path $full -PathType Leaf)) { Send-Json $ctx @{ ok = $false; error = "파일이 없습니다: $rel" } 404 }
      else {
        $text = [System.IO.File]::ReadAllText($full, [System.Text.Encoding]::UTF8)
        Send-Json $ctx @{ ok = $true; content = $text }
      }
      $ctx.Response.Close(); continue
    }

    if ($path -eq "/__api/save" -and $method -eq "POST") {
      $body = Read-Body $ctx
      try {
        $data = $body | ConvertFrom-Json
        $written = @()
        foreach ($f in $data.files) {
          $rel = $f.path
          if (-not (Test-AllowedPath $rel)) { throw "허용되지 않은 경로입니다: $rel" }
          $full = Join-Path $root ($rel -replace '/', '\')
          $dir = Split-Path -Parent $full
          if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
          if ($f.delete -eq $true) {
            if (Test-Path $full) { Remove-Item $full -Force }
          } elseif ($f.encoding -eq "base64") {
            [System.IO.File]::WriteAllBytes($full, [Convert]::FromBase64String($f.contentBase64))
          } else {
            $utf8 = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($full, [string]$f.content, $utf8)
          }
          $written += $rel
        }
        Send-Json $ctx @{ ok = $true; written = $written }
      } catch {
        Send-Json $ctx @{ ok = $false; error = $_.Exception.Message } 400
      }
      $ctx.Response.Close(); continue
    }

    if ($path -eq "/__api/publish" -and $method -eq "POST") {
      $body = Read-Body $ctx
      $msg = "관리자 수정"
      try { $d = $body | ConvertFrom-Json; if ($d.message) { $msg = [string]$d.message } } catch { }
      $msg = $msg -replace '"', "'"
      $log = ""
      try {
        $log += Invoke-Git "add -A data images"
        $status = Invoke-Git "status --porcelain"
        if ([string]::IsNullOrWhiteSpace($status)) {
          Send-Json $ctx @{ ok = $true; nothing = $true; message = "변경된 내용이 없습니다." }
          $ctx.Response.Close(); continue
        }
        $log += Invoke-Git "commit -m `"$msg`""
        $pushOut = Invoke-Git "push origin HEAD"
        $log += $pushOut
        if ($pushOut -match 'rejected|error:|fatal:') {
          Send-Json $ctx @{ ok = $false; error = "GitHub 업로드에 실패했습니다. 인터넷 연결을 확인해주세요."; log = $log } 500
        } else {
          $sha = (Invoke-Git "rev-parse HEAD").Trim()
          Send-Json $ctx @{ ok = $true; sha = $sha; log = $log }
        }
      } catch {
        Send-Json $ctx @{ ok = $false; error = $_.Exception.Message; log = $log } 500
      }
      $ctx.Response.Close(); continue
    }

    if ($path -eq "/__api/history" -and $method -eq "GET") {
      $rel = $ctx.Request.QueryString["path"]
      $n = $ctx.Request.QueryString["n"]; if (-not $n) { $n = "5" }
      $out = Invoke-Git "log -n $n --format=%H%x09%ad%x09%s --date=format:%Y-%m-%d_%H:%M -- `"$rel`""
      $items = @()
      foreach ($line in ($out -split "`r?`n")) {
        if ($line.Trim()) {
          $parts = $line -split "`t"
          if ($parts.Length -ge 3) { $items += @{ sha = $parts[0]; date = $parts[1]; message = $parts[2] } }
        }
      }
      Send-Json $ctx @{ ok = $true; commits = $items }
      $ctx.Response.Close(); continue
    }

    if ($path -eq "/__api/readAt" -and $method -eq "GET") {
      $rel = $ctx.Request.QueryString["path"]
      $sha = $ctx.Request.QueryString["sha"]
      $out = Invoke-Git "show $sha`:$rel"
      Send-Json $ctx @{ ok = $true; content = $out }
      $ctx.Response.Close(); continue
    }

    # ---------------- 정적 파일 ----------------
    if ($path.EndsWith("/")) { $path = $path + "index.html" }
    $file = Join-Path $root ($path.TrimStart("/") -replace "/", "\")
    if ((Test-Path $file -PathType Container)) { $file = Join-Path $file "index.html" }
    if (-not (Test-Path $file -PathType Leaf)) {
      $try = Join-Path $root (($path.TrimStart("/") -replace "/", "\") + "\index.html")
      if (Test-Path $try -PathType Leaf) { $file = $try }
    }
    if (Test-Path $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
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