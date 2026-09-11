@echo off
REM Double-click me after dropping new PNGs into assets\{tiles,walls,glass,sprites}
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scan-assets.ps1"
echo.
pause
