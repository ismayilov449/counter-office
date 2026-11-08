# (Re)start the stealth tests' headless Edge on CDP port 9640 only (never the user's own Edge, never another agent's):
# extensions and sync off, a fresh profile in $env:SP\edge-profile, a 960x540 window. "edge.ps1 stop" just stops it
# (the processes whose command line has this port).
$port = if ($env:CDP_PORT) { $env:CDP_PORT } else { '9640' }
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*--headless=new*remote-debugging-port=$port*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
if ($args[0] -eq 'stop') { exit 0 }
$sp = if ($env:SP) { $env:SP } else { Join-Path $env:TEMP 'co-stealth' }
New-Item -ItemType Directory -Force $sp | Out-Null
$prof = Join-Path $sp 'edge-profile'
if (Test-Path $prof) { Remove-Item -Recurse -Force $prof }
$p = Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--headless=new","--remote-debugging-port=$port","--user-data-dir=$prof","--disable-extensions","--disable-sync","--enable-unsafe-swiftshader","--use-angle=swiftshader","--no-first-run","--window-size=960,540","about:blank" -PassThru
Start-Sleep 2
$p.Id
