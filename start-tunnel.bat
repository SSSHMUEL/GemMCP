@echo off
title GemMCP Windows Bridge Server (Public HTTPS Tunnel Mode)
echo ========================================================
echo     GemMCP Bridge Server + Cloudflare Public Tunnel
echo ========================================================

where node >nul 2>&1
if %errorlevel% neq 0 goto no_node

cd /d "%~dp0bridge-server"

echo.
echo [i] Checking dependencies...
node check-deps.js
if %errorlevel% neq 0 goto install_deps
echo [i] All dependencies present.
goto run_server

:install_deps
echo [i] Installing dependencies with npm. This can take a minute...
call npm install
if %errorlevel% neq 0 goto install_failed
echo [i] Dependencies installed.

:run_server
echo.
echo [i] Starting server with public Cloudflare HTTPS tunnel...
echo.
node server.js --tunnel
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
echo [X] npm install failed.
echo     Check your internet connection and run this file again.
pause
exit /b 1

:server_stopped
echo.
echo [X] The server stopped (exit code %errorlevel%).
pause
