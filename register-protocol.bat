@echo off
REM ============================================================================
REM Helper: Register gemmcp:// and omnimcp:// Protocols in Windows Registry
REM Note: This allows starting the local bridge server via a protocol handler.
REM Run this script to enable protocol-based launcher support.
REM ============================================================================

echo Registering gemmcp:// and omnimcp:// Protocols in Windows Registry...
powershell -NoProfile -Command "$vbsPath = '%~dp0bridge-launcher-silent.vbs'; foreach ($proto in @('gemmcp', 'omnimcp')) { $regPath = \"HKCU:\Software\Classes\$proto\"; New-Item -Path $regPath -Force | Out-Null; Set-ItemProperty -Path $regPath -Name '(default)' -Value \"URL:GemMCP Protocol\"; Set-ItemProperty -Path $regPath -Name 'URL Protocol' -Value ''; $cmdPath = \"$regPath\shell\open\command\"; New-Item -Path $cmdPath -Force | Out-Null; Set-ItemProperty -Path $cmdPath -Name '(default)' -Value ('wscript.exe \"' + $vbsPath + '\" \"%1\"'); Write-Output \"Protocol $proto:// registered successfully!\"; }"
echo Done!
pause
