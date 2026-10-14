@echo off
cd /d "%~dp0"
echo Rebuilding manga library...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "app\rebuild.ps1"
echo.
pause
