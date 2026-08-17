@echo off
setlocal enabledelayedexpansion

REM 1. Run smart locator to update last_path.txt
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0find-and-start.ps1"

REM 2. Read resolved project path
set "LAST_PATH_FILE=%LOCALAPPDATA%\GemMCP\last_path.txt"
set "TARGET_DIR="

if exist "%LAST_PATH_FILE%" (
    set /p TARGET_DIR=<"%LAST_PATH_FILE%"
)

if "!TARGET_DIR!"=="" (
    set "TARGET_DIR=%~dp0"
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    start https://nodejs.org/
    exit /b 1
)

cd /d "!TARGET_DIR!\bridge-server"
if not exist node_modules (
    call npm install
)

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    node server.js
)
