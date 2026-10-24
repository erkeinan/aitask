$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$wovenUrl = 'http://127.0.0.1:4317'
try {
    $wovenStatus = Invoke-RestMethod -Uri "$wovenUrl/api/status" -TimeoutSec 2
    if ($wovenStatus.model -and $wovenStatus.state) { Start-Process $wovenUrl; exit }
} catch { }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Woven requires Node.js 22 or newer.' }
Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
for ($wovenAttempt = 0; $wovenAttempt -lt 30; $wovenAttempt++) {
    Start-Sleep -Milliseconds 250
    try { $null = Invoke-RestMethod -Uri "$wovenUrl/api/status" -TimeoutSec 1; Start-Process $wovenUrl; exit } catch { }
}
throw 'Woven did not start. Open this folder in a terminal and run: node server.mjs'
