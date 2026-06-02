@echo off
echo Stopping any previous server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5026"') do taskkill /f /pid %%a 2>nul
timeout /t 1 /nobreak > nul

echo Starting World Cup 2026 Calendar...
start "WC2026Server" /d "%~dp0" python -m http.server 5026
timeout /t 2 /nobreak > nul
start "" "http://localhost:5026/worldcup2026.html"
echo.
echo Server running at http://localhost:5026
echo Close this window to stop the server.
pause > nul
