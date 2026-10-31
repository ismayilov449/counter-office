# Starts the test server for the bet feature on PORT (default 4080, HTTPS 4081) with fresh test data in $SP\testdata,
# stopping whatever runs on that port first. Extra env vars as NAME=VALUE arguments, e.g.
#   powershell -File dev/test-scripts/bet/up.ps1 BOTS=0 START_MONEY=10000 FRIENDLY_FIRE=1
# The log goes to $SP\srv.log. ($SP: the SP env var, default $env:TEMP\co-bet.)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$sp = if ($env:SP) { $env:SP } else { Join-Path $env:TEMP 'co-bet' }
$port = if ($env:PORT) { $env:PORT } else { '4080' }
New-Item -ItemType Directory -Force $sp | Out-Null
& (Join-Path $PSScriptRoot 'down.ps1') $port
$data = Join-Path $sp 'testdata'
if (Test-Path $data) { Remove-Item -Recurse -Force $data }
New-Item -ItemType Directory -Force $data | Out-Null
$env:PORT = $port
$env:HTTPS_PORT = [string]([int]$port + 1)
$env:DATA_DIR = $data
$env:ADMIN_PASSWORD = 'testpass'
foreach ($a in $args) { $k, $v = $a -split '=', 2; Set-Item -Path "env:$k" -Value $v }
$log = Join-Path $sp 'srv.log'
$err = Join-Path $sp 'srv.err.log'
$p = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $root -RedirectStandardOutput $log -RedirectStandardError $err -PassThru -WindowStyle Hidden
for ($i = 0; $i -lt 80; $i++) {
  Start-Sleep -Milliseconds 250
  if ((Test-Path $log) -and (Select-String -Path $log -Pattern 'Mode:' -Quiet)) { break }
}
Start-Sleep -Milliseconds 2500
"server pid $($p.Id) on $port"
Get-Content $log | Select-String 'Mode:|Map|Error' | Select-Object -First 5
if ((Test-Path $err) -and (Get-Item $err).Length) { 'stderr:'; Get-Content $err | Select-Object -First 20 }
