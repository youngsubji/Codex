@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required. Install from https://nodejs.org/ then run again.
  pause
  exit /b 1
)
call npm ci --no-audit --no-fund
if errorlevel 1 goto failed
call npx playwright install chromium
if errorlevel 1 goto failed
echo Open http://127.0.0.1:4319/?tool=aid25^&lang=ko after the server starts.
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Setup or runner failed. Check the message above.
pause
exit /b 1
