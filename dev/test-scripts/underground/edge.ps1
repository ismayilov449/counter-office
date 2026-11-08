# (Re)start the headless test Edge for the Underground tests on CDP port $env:CDP_PORT (default 9650), with a fresh
# profile in $env:SP\edge-profile, no extensions, no sync, a 960x540 window. "edge.ps1 stop" only stops it. It is
# stopped by the PID it was started with (saved in $env:SP\edge.pid) and by whatever still listens on its port —
# never by name or command line, so the user's own Edge and other agents' test browsers are left alone.
$port = if ($env:CDP_PORT) { $env:CDP_PORT } else { '9650' }
$sp = if ($env:SP) { $env:SP } else { Join-Path $env:TEMP 'co-ug' }
New-Item -ItemType Directory -Force $sp | Out-Null
$pidFile = Join-Path $sp 'edge.pid'
if (Test-Path $pidFile) {
  $old = Get-Content $pidFile
  if ($old) { try { Stop-Process -Id ([int]$old) -Force -ErrorAction Stop } catch {} }
  Remove-Item $pidFile -Force
}
$listen = (netstat -ano | Select-String ":$port\s.*LISTENING") | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -Unique
foreach ($l in $listen) { if ($l -and $l -ne '0') { try { Stop-Process -Id ([int]$l) -Force -ErrorAction Stop } catch {} } }
Start-Sleep 1
if ($args[0] -eq 'stop') { exit 0 }
$profile = Join-Path $sp 'edge-profile'
if (Test-Path $profile) { Remove-Item -Recurse -Force $profile }
$p = Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--headless=new","--remote-debugging-port=$port","--user-data-dir=$profile","--disable-extensions","--disable-sync","--enable-unsafe-swiftshader","--use-angle=swiftshader","--no-first-run","--window-size=960,540","about:blank" -PassThru
Set-Content -Path $pidFile -Value $p.Id
Start-Sleep 3
$p.Id
