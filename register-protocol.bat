@echo off
REM ============================================================================
REM GemMCP Universal Protocol Register (Permanent AppData Integration)
REM ============================================================================

echo Registering gemmcp:// and omnimcp:// Protocols in Windows Registry...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$appDir = Join-Path $env:LOCALAPPDATA 'GemMCP';" ^
  "if (-not (Test-Path $appDir)) { New-Item -ItemType Directory -Path $appDir -Force | Out-Null };" ^
  "$srcDir = '%~dp0';" ^
  "Copy-Item -Path (Join-Path $srcDir 'find-and-start.ps1') -Destination $appDir -Force;" ^
  "Copy-Item -Path (Join-Path $srcDir 'bridge-launcher-silent.vbs') -Destination $appDir -Force;" ^
  "Copy-Item -Path (Join-Path $srcDir 'bridge-launcher.bat') -Destination $appDir -Force;" ^
  "Set-Content -Path (Join-Path $appDir 'last_path.txt') -Value ($srcDir.TrimEnd('\')) -Force;" ^
  "$vbs = Join-Path $appDir 'bridge-launcher-silent.vbs';" ^
  "$cmd = 'wscript.exe \"' + $vbs + '\" \"%%1\"';" ^
  "foreach ($p in @('gemmcp', 'omnimcp')) {" ^
  "  $bk = 'HKCU:\Software\Classes\' + $p;" ^
  "  New-Item -Path $bk -Force | Out-Null;" ^
  "  Set-ItemProperty -Path $bk -Name '(default)' -Value 'URL:GemMCP Protocol';" ^
  "  Set-ItemProperty -Path $bk -Name 'URL Protocol' -Value '';" ^
  "  $ck = $bk + '\shell\open\command';" ^
  "  New-Item -Path $ck -Force | Out-Null;" ^
  "  Set-ItemProperty -Path $ck -Name '(default)' -Value $cmd;" ^
  "};" ^
  "Write-Output 'Protocols registered permanently to AppData!';"

echo.
echo ========================================================
echo   [OK] Protocol registered permanently to:
echo   %LOCALAPPDATA%\GemMCP
echo ========================================================
echo.
pause
