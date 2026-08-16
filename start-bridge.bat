@echo off
title GemMCP Windows Bridge Server
echo ========================================================
echo     Starting GemMCP Local Bridge Server (Port 3000)
echo ========================================================

where node >nul 2>&1
if %errorlevel% neq 0 goto no_node

cd /d "%~dp0bridge-server"

if exist node_modules goto run_server

echo.
echo [i] Dependencies not found. Installing with npm (first run only)...
call npm install
if %errorlevel% neq 0 goto install_failed

:run_server
echo.
echo [i] Starting server... Press Ctrl+C to stop.
echo.
node server.js
goto server_stopped

:no_node
echo.
echo [X] Node.js is not installed or not in PATH.
echo     Opening https://nodejs.org/ ...
start https://nodejs.org/
echo.
echo     Install Node.js (LTS), then close this window and run this file again.
pause
exit /b 1

:install_failed
echo.
echo [X] npm install failed. Check your internet connection and run this file again.
pause
exit /b 1

:server_stopped
echo.
echo [X] The server stopped unexpectedly (exit code %errorlevel%).
echo     Read the error above. If it says "Cannot find module", the dependencies
echo     are incomplete - delete the "node_modules" folder and run this file again.
pause
