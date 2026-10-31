# (Re)start the headless test Edge on CDP port 9333 only (never the user's own Edge). "edge.ps1 stop" just stops it.
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*--headless=new*remote-debugging-port=9333*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
if ($args[0] -eq 'stop') { exit 0 }
$sp = if ($env:SP) { $env:SP } else { Join-Path $env:TEMP 'co-test' }
New-Item -ItemType Directory -Force $sp | Out-Null
$p = Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--headless=new","--remote-debugging-port=9333","--user-data-dir=$sp\edge-profile","--enable-unsafe-swiftshader","--use-angle=swiftshader","--no-first-run","--window-size=1280,720","about:blank" -PassThru
Start-Sleep 2
$p.Id
