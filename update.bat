@echo off
setlocal enabledelayedexpansion
title GemMCP - Update & Install Manager
color 0b

echo ========================================================
echo        GemMCP - Auto Update & Installation Tool
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Check if git is available
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Git is not found in PATH.
    echo     Please install Git or update manually from:
    echo     https://github.com/SSSHMUEL/GemMCP
    echo.
    goto check_node
)

:: 2. Pull latest changes from GitHub
echo [1/3] Pulling latest updates from GitHub (origin/main)...
git pull origin main
if %errorlevel% neq 0 (
    echo [!] Warning: Could not update via Git. Check your internet connection or git status.
) else (
    echo [V] Repository updated successfully!
)

:check_node
echo.
echo [2/3] Checking dependencies in bridge-server...
cd /d "%~dp0bridge-server"
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Warning: Node.js is not installed. 
    echo     Download and install Node.js from https://nodejs.org/ to run Windows Bridge.
) else (
    echo [i] Updating npm packages in bridge-server...
    call npm install
    if %errorlevel% equ 0 (
        echo [V] Dependencies are up to date!
    ) else (
        echo [!] npm install encountered an issue.
    )
)

:register_protocol
echo.
echo [3/3] Registering Windows Protocol Handler (gemmcp://)...
cd /d "%~dp0"
if exist "register-protocol.bat" (
    call "register-protocol.bat"
)

echo.
echo ========================================================
echo [V] UPDATE COMPLETED SUCCESSFULLY!
echo ========================================================
echo.
echo [i] Next steps:
echo     1. Open Chrome and navigate to:  chrome://extensions/
echo     2. Find "GemMCP for Gemini" and click the REFRESH icon (circular arrow)
echo     3. (Optional) Start Windows Bridge with: start-bridge.bat
echo.
pause
