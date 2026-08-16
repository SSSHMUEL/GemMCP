@echo off
REM ============================================================================
REM Helper: Register gemmcp:// and omnimcp:// Protocols in Windows Registry
REM Note: This allows starting the local bridge server via a protocol handler.
REM Run this script to enable protocol-based launcher support.
REM ============================================================================

echo Registering gemmcp:// and omnimcp:// Protocols in Windows Registry...
powershell -NoProfile -Command "$vbs = (Resolve-Path '%~dp0bridge-launcher-silent.vbs').Path; $cmd = 'wscript.exe \"' + $vbs + '\" \"%%1\"'; foreach ($p in @('gemmcp', 'omnimcp')) { $bk = 'HKCU:\Software\Classes\' + $p; New-Item -Path $bk -Force | Out-Null; Set-ItemProperty -Path $bk -Name '(default)' -Value 'URL:GemMCP Protocol'; Set-ItemProperty -Path $bk -Name 'URL Protocol' -Value ''; $ck = $bk + '\shell\open\command'; New-Item -Path $ck -Force | Out-Null; Set-ItemProperty -Path $ck -Name '(default)' -Value $cmd; }; Write-Output 'Protocols registered successfully!'"
pause
