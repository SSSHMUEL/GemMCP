# GemMCP Smart Auto-Locator
$ErrorActionPreference = 'SilentlyContinue'

function Find-GemMCPPath {
    # 1. Check last saved path in AppData
    $lastPathFile = "$env:LOCALAPPDATA\GemMCP\last_path.txt"
    if (Test-Path $lastPathFile) {
        $saved = (Get-Content $lastPathFile -Raw).Trim()
        if ($saved -and (Test-Path "$saved\bridge-server\server.js")) {
            return $saved
        }
    }

    # 2. Check current script's parent folder
    $scriptParent = Split-Path -Parent $PSScriptRoot
    if ($scriptParent -and (Test-Path "$scriptParent\bridge-server\server.js")) {
        return $scriptParent
    }
    if ($PSScriptRoot -and (Test-Path "$PSScriptRoot\bridge-server\server.js")) {
        return $PSScriptRoot
    }

    # 3. Check Chrome & Edge unpacked extensions preferences
    $browserPaths = @(
        "$env:LOCALAPPDATA\Google\Chrome\User Data",
        "$env:LOCALAPPDATA\Microsoft\Edge\User Data",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data"
    )

    foreach ($bPath in $browserPaths) {
        if (-not (Test-Path $bPath)) { continue }
        $prefFiles = Get-ChildItem -Path $bPath -Filter 'Preferences' -Recurse -Depth 2 -ErrorAction SilentlyContinue
        foreach ($pf in $prefFiles) {
            try {
                $raw = [System.IO.File]::ReadAllText($pf.FullName)
                if ($raw -match '"path"\s*:\s*"([^"]+)"') {
                    $matches = [regex]::Matches($raw, '"path"\s*:\s*"([^"]+)"')
                    foreach ($m in $matches) {
                        $candidate = $m.Groups[1].Value.Replace('\\', '\')
                        if (Test-Path "$candidate\bridge-server\server.js") {
                            return $candidate
                        }
                    }
                }
            } catch {}
        }
    }

    # 4. Search common developer directories in UserProfile
    $commonRoots = @(
        "$env:USERPROFILE\talkfix",
        "$env:USERPROFILE\Projects",
        "$env:USERPROFILE\Desktop",
        "$env:USERPROFILE\Downloads",
        "$env:USERPROFILE\Documents"
    )

    foreach ($root in $commonRoots) {
        if (-not (Test-Path $root)) { continue }
        $matches = Get-ChildItem -Path $root -Filter 'server.js' -Recurse -Depth 4 -ErrorAction SilentlyContinue |
                   Where-Object { $_.DirectoryName -match 'bridge-server$' }
        if ($matches) {
            $matched = $matches | Select-Object -First 1
            $projectRoot = Split-Path -Parent $matched.DirectoryName
            if (Test-Path "$projectRoot\bridge-server\server.js") {
                return $projectRoot
            }
        }
    }

    return $null
}

$projectPath = Find-GemMCPPath

if ($projectPath) {
    $gemDir = "$env:LOCALAPPDATA\GemMCP"
    if (-not (Test-Path $gemDir)) { New-Item -ItemType Directory -Path $gemDir -Force | Out-Null }
    [System.IO.File]::WriteAllText("$gemDir\last_path.txt", $projectPath, [System.Text.Encoding]::ASCII)

    $bridgeDir = "$projectPath\bridge-server"
    if (-not (Test-Path "$bridgeDir\node_modules")) {
        $npmPath = (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue).Source
        if (-not $npmPath) { $npmPath = 'C:\Program Files\nodejs\npm.cmd' }
        if (Test-Path $npmPath) {
            Start-Process -FilePath $npmPath -ArgumentList "install" -WorkingDirectory $bridgeDir -WindowStyle Hidden -Wait
        }
    }
}
