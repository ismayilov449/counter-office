# (Re)start the gas agent's test server: port 4030 (HTTPS 4031), fresh test data in $env:SP\testdata (never data/).
# Usage: powershell -File up.ps1 [MAP] [BOTS]   — extra env vars can be set before calling.
param([string]$Map = 'cs_mansion', [int]$Bots = 0)
$root = Resolve-Path "$PSScriptRoot\..\..\.."
$sp = if ($env:SP) { $env:SP } else { "$env:TEMP\co-gas" }
New-Item -ItemType Directory -Force $sp | Out-Null
$old = Get-NetTCPConnection -LocalPort 4030 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($old) { Stop-Process -Id $old.OwningProcess -Force; Start-Sleep -Milliseconds 400 }
Remove-Item -Recurse -Force "$sp\testdata" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$sp\testdata" | Out-Null
$env:PORT = '4030'; $env:HTTPS_PORT = '4031'; $env:DATA_DIR = "$sp\testdata"; $env:ADMIN_PASSWORD = 'testpass'
$env:MAP = $Map; $env:BOTS = "$Bots"
$p = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $root -RedirectStandardOutput "$sp\srv.log" -RedirectStandardError "$sp\srv.err" -WindowStyle Hidden -PassThru
for ($i = 0; $i -lt 80; $i++) { Start-Sleep -Milliseconds 250; if ((Get-Content "$sp\srv.log" -ErrorAction SilentlyContinue) -match 'Mode:') { break } }
Start-Sleep -Milliseconds 1500
"server pid $($p.Id)"
Get-Content "$sp\srv.log" | Select-String 'Mode:|Error|error' | Select-Object -First 5
Get-Content "$sp\srv.err" -ErrorAction SilentlyContinue | Select-Object -First 10
