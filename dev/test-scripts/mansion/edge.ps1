# (Re)start MY headless Edge on port 9335 only.
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*remote-debugging-port=9335*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 1
if ($args[0] -eq 'stop') { exit 0 }
$sp = "C:\Users\RUFAT~1.ISM\AppData\Local\Temp\claude\C--Users-Rufat-Ismayilov-Desktop-CS1-6\fda3fa36-5543-4bf3-aafd-2dd06116628f\scratchpad"
$p = Start-Process "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ArgumentList "--headless=new","--remote-debugging-port=9335","--user-data-dir=$sp\edge-mansion","--enable-unsafe-swiftshader","--use-angle=swiftshader","--no-first-run","--window-size=1280,720","about:blank" -PassThru
Start-Sleep 2
$p.Id
