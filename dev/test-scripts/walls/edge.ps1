# (Re)start the walls tests' headless Edge on CDP port 9620 only (never the user's own Edge, never another tester's):
# a fresh temp profile, no extensions, no sync, a 960x540 window. "edge.ps1 stop" just stops it. Only processes whose
# command line has this port are stopped.
$port = if ($env:CDP_PORT) { $env:CDP_PORT } else { '9620' }
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*--headless=new*remote-debugging-port=$port*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
$sp = if ($env:SP) { $env:SP } else { Join-Path $env:TEMP 'co-walls' }
$prof = Join-Path $sp 'edge-profile'
if (Test-Path $prof) { Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue }
if ($args[0] -eq 'stop') { exit 0 }
New-Item -ItemType Directory -Force $sp | Out-Null
$p = Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--headless=new","--remote-debugging-port=$port","--user-data-dir=$prof","--disable-extensions","--disable-sync","--enable-unsafe-swiftshader","--use-angle=swiftshader","--no-first-run","--window-size=960,540","about:blank" -PassThru
Start-Sleep 2
$p.Id
