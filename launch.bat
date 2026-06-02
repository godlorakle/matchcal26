@echo off
echo Starting World Cup 2026 Calendar...
start /b python -m http.server 5026 --directory "%~dp0"
timeout /t 2 /nobreak > nul
start "" "http://localhost:5026/worldcup2026.html"
echo.
echo Server running at http://localhost:5026
echo Close this window to stop the server.
pause > nul
