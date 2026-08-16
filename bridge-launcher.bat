@echo off
where node >nul 2>&1
if %errorlevel% neq 0 (
    start https://nodejs.org/
    exit /b 1
)
cd /d "%~dp0bridge-server"
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    node server.js
)

