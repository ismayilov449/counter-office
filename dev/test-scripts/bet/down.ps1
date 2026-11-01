# Stops the test server listening on the given port (default 4080) — only that process, by its PID.
param([string]$port = '4080')
$conns = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  if ($c.OwningProcess -gt 0) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; "stopped pid $($c.OwningProcess) on $port" } catch {} }
}
