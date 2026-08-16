@echo off
title GemMCP Windows Bridge Server
echo ========================================================
echo     ⚡ Starting GemMCP Local Bridge Server (Port 3000)
echo ========================================================
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [!] Node.js is not installed on this computer.
    echo [!] Opening https://nodejs.org/ to download Node.js...
    start https://nodejs.org/
    echo.
    echo Please download and install Node.js, then run this file again.
    echo.
    pause
    exit /b 1
)
cd /d "%~dp0bridge-server"
node server.js
pause

