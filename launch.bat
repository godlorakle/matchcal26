@echo off
echo Starting World Cup 2026 Calendar...
start /b python -m http.server 7822 --directory "%~dp0"
timeout /t 2 /nobreak > nul
start "" "http://localhost:7822/worldcup2026.html"
echo.
echo Server running at http://localhost:7822
echo Close this window to stop the server.
pause > nul
