# (Re)start the power branch's headless test Edge on CDP_PORT (default 9630) with a fresh temp profile, no extensions,
# no sync, a 960x540 window; "edge.ps1 stop" just stops it. Only ours: the process tree whose PID we saved (and
# whatever listens on that port), never Edge by name.
$port = if ($env:CDP_PORT) { $env:CDP_PORT } else { '9630' }
$sp = if ($env:SP) { $env:SP } else { Join-Path $env:TEMP 'co-power' }
New-Item -ItemType Directory -Force $sp | Out-Null
$pidFile = Join-Path $sp 'edge.pid'
if (Test-Path $pidFile) { $old = Get-Content $pidFile; if ($old) { taskkill /PID $old /T /F 2>$null | Out-Null }; Remove-Item $pidFile }
$listen = netstat -ano | Select-String ":$port\s.*LISTENING" | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1
if ($listen) { taskkill /PID $listen /T /F 2>$null | Out-Null }
Start-Sleep 1
if ($args[0] -eq 'stop') { exit 0 }
$profile = Join-Path $sp ("edge-profile-" + [DateTimeOffset]::Now.ToUnixTimeSeconds())
$p = Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--headless=new","--remote-debugging-port=$port","--user-data-dir=$profile","--disable-extensions","--disable-sync","--enable-unsafe-swiftshader","--use-angle=swiftshader","--no-first-run","--window-size=960,540","about:blank" -PassThru
$p.Id | Out-File -Encoding ascii $pidFile
Start-Sleep 3
"edge pid $($p.Id) on $port, profile $profile"
