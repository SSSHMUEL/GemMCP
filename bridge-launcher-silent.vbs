Set WshShell = CreateObject("WScript.Shell")
Dim scriptDir
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run Chr(34) & scriptDir & "\bridge-launcher.bat" & Chr(34), 0, False
Set WshShell = Nothing
