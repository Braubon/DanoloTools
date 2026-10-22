# Wildcarder local server for Windows (PowerShell 5.1+, nothing to install).
# Serves the web page and reads the project's  wildcards\  folder on every
# request, so any .txt you edit shows up in the page straight away.
# Only listens on this computer (localhost). Close the window to stop it.

$ErrorActionPreference = 'Stop'
$Sep = [IO.Path]::DirectorySeparatorChar
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd($Sep)
$Wild = [IO.Path]::Combine($Root, 'wildcards')
$RootPrefix = $Root + $Sep
$WildPrefix = $Wild + $Sep
$NoBrowser = $args -contains '--no-browser'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
  '.md' = 'text/plain; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'
  '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'
}

function Get-TxtFiles {
  if (-not [IO.Directory]::Exists($Wild)) { return @() }
  $list = foreach ($f in [IO.Directory]::GetFiles($Wild, '*.txt', [IO.SearchOption]::AllDirectories)) {
    $rel = $f.Substring($WildPrefix.Length).Replace('\', '/')
    if ($rel -match '(^|/)\.') { continue }
    [pscustomobject]@{ Rel = $rel; Full = $f }
  }
  @($list | Sort-Object Rel)
}

function Get-Signature {
  $parts = foreach ($f in Get-TxtFiles) {
    $i = New-Object IO.FileInfo($f.Full)
    '{0}|{1}|{2}' -f $f.Rel, $i.Length, $i.LastWriteTimeUtc.Ticks
  }
  ($parts -join "`n")
}

function Send-Bytes($ctx, [byte[]]$bytes, [string]$type, [int]$code = 200, [switch]$Cors) {
  $r = $ctx.Response
  $r.StatusCode = $code
  $r.ContentType = $type
  $r.AddHeader('Cache-Control', 'no-store')
  if ($Cors) { $r.AddHeader('Access-Control-Allow-Origin', '*') }
  $r.ContentLength64 = $bytes.Length
  $r.OutputStream.Write($bytes, 0, $bytes.Length)
}
function Send-Text($ctx, [string]$text, [string]$type = 'text/plain; charset=utf-8', [int]$code = 200, [switch]$Cors) {
  Send-Bytes $ctx $Utf8.GetBytes($text) $type $code -Cors:$Cors
}

function Invoke-Request($ctx) {
  $req = $ctx.Request
  $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

  if ($req.HttpMethod -eq 'GET' -and $path -eq '/__wildcarder/ping') { Send-Text $ctx 'wildcarder' -Cors; return }
  if ($req.HttpMethod -eq 'GET' -and $path -eq '/__wildcarder/sig') { Send-Text $ctx (Get-Signature); return }
  if ($req.HttpMethod -eq 'GET' -and $path -eq '/__wildcarder/files') {
    $files = foreach ($f in Get-TxtFiles) {
      [pscustomobject]@{ path = $f.Rel; text = [IO.File]::ReadAllText($f.Full, [Text.Encoding]::UTF8) }
    }
    $obj = [pscustomobject]@{ folder = $Wild; sig = (Get-Signature); files = @($files) }
    Send-Text $ctx (ConvertTo-Json -InputObject $obj -Depth 4 -Compress) 'application/json; charset=utf-8'
    return
  }
  if ($req.HttpMethod -eq 'POST' -and $path -eq '/__wildcarder/open') {
    $origin = $req.Headers['Origin']
    $sameOrigin = $false
    if ($origin) { try { $sameOrigin = ([Uri]$origin).Authority -eq $req.Url.Authority } catch {} }
    if (-not $sameOrigin) { Send-Text $ctx 'forbidden' -code 403; return }
    $body = (New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
    $rel = ''
    if ($body) { $p = ($body | ConvertFrom-Json).path; if ($p) { $rel = [string]$p } }
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($Wild, $rel.Replace('/', $Sep))).TrimEnd($Sep)
    if ($target -ne $Wild -and -not $target.StartsWith($WildPrefix, [StringComparison]::OrdinalIgnoreCase)) { Send-Text $ctx 'outside wildcards' -code 400; return }
    if ([IO.Directory]::Exists($target) -or ($target.ToLower().EndsWith('.txt') -and [IO.File]::Exists($target))) {
      Invoke-Item -LiteralPath $target
      Send-Text $ctx 'ok'
    } else { Send-Text $ctx 'not found' -code 404 }
    return
  }
  if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') { Send-Text $ctx 'method not allowed' -code 405; return }

  $rel = $path.TrimStart('/')
  if ($rel -eq '') { $rel = 'index.html' }
  $full = [IO.Path]::GetFullPath([IO.Path]::Combine($Root, $rel.Replace('/', $Sep)))
  if (-not $full.StartsWith($RootPrefix, [StringComparison]::OrdinalIgnoreCase)) { Send-Text $ctx 'forbidden' -code 403; return }
  if ([IO.Directory]::Exists($full)) { $full = [IO.Path]::Combine($full, 'index.html') }
  if (-not [IO.File]::Exists($full)) { Send-Text $ctx 'not found' -code 404; return }
  $type = $Mime[[IO.Path]::GetExtension($full).ToLower()]
  if (-not $type) { $type = 'application/octet-stream' }
  Send-Bytes $ctx ([IO.File]::ReadAllBytes($full)) $type
}

function Test-Wildcarder([int]$port) {
  try {
    $rq = [Net.WebRequest]::Create("http://localhost:$port/__wildcarder/ping")
    $rq.Proxy = $null; $rq.Timeout = 1500
    $rs = $rq.GetResponse()
    $t = (New-Object IO.StreamReader($rs.GetResponseStream())).ReadToEnd()
    $rs.Close()
    return ($t -eq 'wildcarder')
  } catch { return $false }
}

if (-not [IO.Directory]::Exists($Wild)) { Write-Host "No encuentro la carpeta: $Wild" -ForegroundColor Red; exit 1 }

$listener = $null
foreach ($port in 8765..8775) {
  $url = "http://localhost:$port/"
  if (Test-Wildcarder $port) {
    Write-Host "Wildcarder ya estaba abierto en $url"
    if (-not $NoBrowser) { Start-Process $url }
    exit 0
  }
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add($url)
  try { $l.Start(); $listener = $l; break } catch { try { $l.Close() } catch {} }
}
if (-not $listener) { Write-Host 'Todos los puertos 8765-8775 están ocupados.' -ForegroundColor Red; exit 1 }

$count = @(Get-TxtFiles).Count
Write-Host ''
Write-Host '  Wildcarder funcionando' -ForegroundColor Yellow
Write-Host "  Web:        $url"
Write-Host "  Wildcards:  $Wild  ($count archivos .txt)"
Write-Host ''
Write-Host '  Edita los .txt de esa carpeta y la web se actualiza sola.'
Write-Host '  Cierra esta ventana (o pulsa Ctrl+C) para pararlo.'
Write-Host ''
if (-not $NoBrowser) { Start-Process $url }

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(500)) { }
    $ctx = $task.GetAwaiter().GetResult()
    try { Invoke-Request $ctx }
    catch { try { Send-Text $ctx ('error: ' + $_.Exception.Message) -code 500 } catch {} }
    finally { try { $ctx.Response.Close() } catch {} }
  }
} finally {
  $listener.Stop(); $listener.Close()
}
