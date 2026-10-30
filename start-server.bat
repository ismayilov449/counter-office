@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
rem --use-system-ca: also trust the company's certificates (to post the game's link to Bitrix)
node --use-system-ca server.js
pause
