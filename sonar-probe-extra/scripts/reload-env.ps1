$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Assert-LastExit([string]$Message) {
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

Write-Host "`nKarzoun Media Factory - reload .env into containers" -ForegroundColor Cyan
Write-Host "Recreating app + worker only. Database volume is preserved.`n" -ForegroundColor Yellow

docker compose config | Out-Null
Assert-LastExit 'docker compose config failed. Check .env syntax.'

docker compose up -d --force-recreate --no-deps app
Assert-LastExit 'Failed to recreate app container.'

docker compose up -d --force-recreate worker
Assert-LastExit 'Failed to recreate worker container.'

$port = '3100'
if (Test-Path '.env') {
    $line = Get-Content '.env' | Where-Object { $_ -match '^KMF_PORT=' } | Select-Object -First 1
    if ($line) {
        $candidate = $line.Substring('KMF_PORT='.Length)
        if ($candidate -match '^\d{2,5}$') { $port = $candidate }
    }
}

$healthUrl = "http://localhost:$port/api/health"
$deadline = (Get-Date).AddMinutes(2)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 4
        if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 3
}

if (-not $healthy) {
    Write-Host "Containers were recreated, but health is not ready yet." -ForegroundColor Yellow
    Write-Host 'Run: docker compose ps'
    Write-Host 'Then: docker compose logs --tail=200 app worker'
    exit 1
}

Write-Host "Environment reloaded successfully." -ForegroundColor Green
Write-Host "Factory: http://localhost:$port/setup"
