# Start (or with -Stop, stop) the gas agent's own headless Edge on CDP port 9430. Only that Edge is touched.
param([switch]$Stop)
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*remote-debugging-port=9430*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
if ($Stop) { return }
$sp = if ($env:SP) { $env:SP } else { "$env:TEMP\co-gas" }
New-Item -ItemType Directory -Force "$sp\edge-profile" | Out-Null
Start-Sleep -Milliseconds 500
Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList '--headless=new', '--remote-debugging-port=9430', "--user-data-dir=$sp\edge-profile", '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--window-size=1280,720', 'about:blank'
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 250; try { Invoke-RestMethod http://127.0.0.1:9430/json/version -TimeoutSec 1 | Out-Null; 'edge up'; break } catch {} }
