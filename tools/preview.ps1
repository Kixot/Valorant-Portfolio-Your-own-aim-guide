param([switch]$NoBrowser, [switch]$Serve, [ValidateRange(1024, 65519)][int]$Port = 4174)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vodScript = [IO.File]::ReadAllText((Join-Path $projectRoot 'js\vod.js'))
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
$hasNode = [IO.File]::Exists($nodePath)
$privateSetup = Join-Path $projectRoot '.env'
$setupStamp = if ([IO.File]::Exists($privateSetup)) { [string]([DateTimeOffset]([IO.File]::GetLastWriteTimeUtc($privateSetup))).ToUnixTimeMilliseconds() } else { '0' }
$codeStamp = (@('server\preview.cjs', 'server\round-analysis.cjs', 'server\local-video.cjs') | ForEach-Object { [string]([DateTimeOffset]([IO.File]::GetLastWriteTimeUtc((Join-Path $projectRoot $_)))).ToUnixTimeMilliseconds() }) -join '-'

if ($Serve) {
  # Development-only static file preview using built-in Windows/.NET facilities.
  $mime = @{ '.html' = 'text/html'; '.css' = 'text/css'; '.js' = 'application/javascript'; '.json' = 'application/json'; '.txt' = 'text/plain'; '.xml' = 'application/xml'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.gif' = 'image/gif'; '.ico' = 'image/x-icon'; '.woff' = 'font/woff'; '.woff2' = 'font/woff2' }
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
  $listener.Start()
  try {
    while ($true) {
      $client = $listener.AcceptTcpClient()
      $client.ReceiveTimeout = 2000
      $client.SendTimeout = 5000
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      try {
        $request = $reader.ReadLine()
        if (-not $request) { continue }
        $parts = $request -split ' ', 3
        $headerLength = 0
        do { $header = $reader.ReadLine(); $headerLength += $header.Length; if ($headerLength -gt 16384) { throw 'Headers too large' } } while ($header)
        $status = '404 Not Found'
        $body = [Text.Encoding]::UTF8.GetBytes('Not found.')
        $contentType = 'text/plain'
        $locationHeader = ''
        if ($parts[0] -notin @('GET', 'HEAD')) { $status = '405 Method Not Allowed' }
        else {
          $relative = [Uri]::UnescapeDataString(($parts[1] -split '\?', 2)[0]).TrimStart('/')
          $routeConfig = [IO.File]::ReadAllText((Join-Path $projectRoot 'vercel.json')) | ConvertFrom-Json
          $routePath = '/' + $relative
          $matchedRoute = $routeConfig.routes | Where-Object { $_.src -and $routePath -cmatch ('^' + $_.src + '$') } | Select-Object -First 1
          if ($matchedRoute.headers.Location) {
            $query = if ($parts[1].Contains('?')) { '?' + ($parts[1] -split '\?', 2)[1] } else { '' }
            $destination = [regex]::Replace($routePath, ('^' + $matchedRoute.src + '$'), $matchedRoute.headers.Location) + $query
            $locationHeader = "Location: $destination`r`n"
            $status = '308 Permanent Redirect'; $body = [byte[]]@()
          } elseif ($matchedRoute.dest) { $relative = ([regex]::Replace($routePath, ('^' + $matchedRoute.src + '$'), $matchedRoute.dest)).TrimStart('/') }
          if (-not $relative) { $relative = 'index.html' }
          $absolute = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
          $extension = [IO.Path]::GetExtension($absolute).ToLowerInvariant()
          $inProject = $absolute.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
          if (-not $matchedRoute.status -and $inProject -and $relative -notmatch '(^|[\\/])\.' -and $mime.ContainsKey($extension) -and [IO.File]::Exists($absolute)) {
            $status = '200 OK'; $body = [IO.File]::ReadAllBytes($absolute); $contentType = $mime[$extension]
          }
        }
        $headers = "HTTP/1.1 $status`r`n${locationHeader}Content-Type: $contentType; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`nReferrer-Policy: strict-origin-when-cross-origin`r`n`r`n"
        $bytes = [Text.Encoding]::ASCII.GetBytes($headers)
        $stream.Write($bytes, 0, $bytes.Length)
        if ($parts[0] -ne 'HEAD') { $stream.Write($body, 0, $body.Length) }
        $stream.Flush()
      } catch { } finally { $reader.Dispose(); $client.Dispose() }
    }
  } finally { $listener.Stop() }
  exit
}

function Test-ProjectPreview([int]$Candidate) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Candidate/js/vod.js" -TimeoutSec 2
    if ($response.StatusCode -ne 200 -or $response.Content -ne $vodScript) { return $false }
    if ($hasNode) {
      $info = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Candidate/api/analyze-rounds" -TimeoutSec 2
      $serviceInfo = $info.Content | ConvertFrom-Json
      return $serviceInfo.service -eq 'kixot-analysis-v1' -and $serviceInfo.setupStamp -eq $setupStamp -and $serviceInfo.codeStamp -eq $codeStamp
    }
    return $true
  } catch { return $false }
}

try {
  Write-Host 'Starting Kixot preview...'
  $previewPort = $null
  # Only check ports with a listener. Closed ports can otherwise delay opening
  # the browser for over a minute on Windows with connection filtering.
  $listeningPorts = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Select-Object -ExpandProperty Port -Unique
  foreach ($candidate in $Port..($Port + 16)) {
    if ($candidate -in $listeningPorts -and (Test-ProjectPreview $candidate)) { $previewPort = $candidate; break }
  }
  foreach ($candidate in $Port..($Port + 16)) {
    if ($previewPort) { break }
    # Never replace or stop another application that owns a port.
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidate)
    try { $probe.Start() } catch { continue } finally { $probe.Stop() }
    # The local preview binds to this PC; Node enables the optional analysis API.
    Write-Host 'Loading the local preview service...'
    $shellPath = if ($hasNode) { $nodePath } else { (Get-Process -Id $PID).Path }
    $arguments = if ($hasNode) { @(('"' + (Join-Path $projectRoot 'server\preview.cjs') + '"'), '--port', [string]$candidate) } else { @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-Serve', '-Port', [string]$candidate) }
    $previewProcess = Start-Process -FilePath $shellPath -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      Start-Sleep -Milliseconds 250
      if (Test-ProjectPreview $candidate) { $previewPort = $candidate; break }
      if ($previewProcess.HasExited) { throw 'The preview could not start. Run Preview.cmd again.' }
    }
    if ($previewPort) { break }
    # Stop only the process started by this launcher if startup failed.
    if (-not $previewProcess.HasExited) { $previewProcess.Kill() }
    throw 'The preview did not respond. Run Preview.cmd again.'
  }
  if (-not $previewPort) { throw 'No free local preview port was found.' }
  $previewUrl = "http://127.0.0.1:$previewPort/vod"
  Write-Output $previewUrl
  if (-not $NoBrowser) {
    Write-Host 'Opening your browser...'
    try { Start-Process -FilePath $previewUrl }
    catch { throw "Windows could not open your browser. Copy this address into it: $previewUrl" }
  }
} catch {
  Write-Host $_.Exception.Message
  exit 1
}
