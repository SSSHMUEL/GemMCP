@echo off
setlocal enabledelayedexpansion

REM The script's own folder is always correct and needs no decoding, so it is
REM tried first. The cached path is only a fallback for when this .bat is
REM invoked from somewhere else - and `set /p` reads it using the console
REM codepage, which mangles any non-ASCII path, so it must not be preferred.
set "TARGET_DIR="

if exist "%~dp0bridge-server\server.js" (
    set "TARGET_DIR=%~dp0"
) else (
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0find-and-start.ps1"
    set "LAST_PATH_FILE=%LOCALAPPDATA%\GemMCP\last_path.txt"
    if exist "%LAST_PATH_FILE%" (
        set /p TARGET_DIR=<"%LAST_PATH_FILE%"
    )
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

REM What must be checked is not "does node_modules exist" - it does, even after
REM an update that added a dependency, and that is exactly when the server dies
REM with "Cannot find module" in a hidden window nobody reads.
REM
REM This used to call `npm ls`, which answers the same question - but it was
REM measured at eight seconds, while the extension gives up waiting for the
REM bridge much sooner. The result was an auto-start that always "failed" and
REM a user told to start the server by hand. check-deps.js answers it in under
REM half a second by looking for each declared dependency on disk.
node check-deps.js >nul 2>&1
if %errorlevel% neq 0 (
    call npm install
)

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    node server.js
)
