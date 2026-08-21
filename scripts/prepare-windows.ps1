$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Assert-Command([string]$Name, [string]$Help) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $Help"
    }
}

function Assert-LastExit([string]$Message) {
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

function New-HexSecret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([System.BitConverter]::ToString($buffer)).Replace('-', '').ToLowerInvariant()
}

function Read-DotEnvLines([string]$Path) {
    $lines = New-Object 'System.Collections.Generic.List[string]'
    if (Test-Path $Path) {
        foreach ($line in Get-Content $Path) { [void]$lines.Add([string]$line) }
    }
    return $lines
}

function Get-DotEnvValue([string]$Path, [string]$Key) {
    if (-not (Test-Path $Path)) { return $null }
    $prefix = "$Key="
    foreach ($line in Get-Content $Path) {
        if ($line.StartsWith($prefix, [System.StringComparison]::Ordinal)) {
            return $line.Substring($prefix.Length)
        }
    }
    return $null
}

function Set-DotEnvValue([string]$Path, [string]$Key, [string]$Value, [switch]$OnlyIfBlank) {
    $lines = Read-DotEnvLines $Path
    $index = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ('^' + [regex]::Escape($Key) + '=')) { $index = $i; break }
    }

    if ($index -ge 0) {
        $current = $lines[$index].Substring($Key.Length + 1)
        if ($OnlyIfBlank -and -not [string]::IsNullOrWhiteSpace($current)) { return }
        $lines[$index] = "$Key=$Value"
    } else {
        [void]$lines.Add("$Key=$Value")
    }
    Set-Content -Path $Path -Value $lines -Encoding UTF8
}

Write-Host "`nKarzoun Media Factory - safe Windows bootstrap" -ForegroundColor Cyan
Write-Host "This starts MOCK mode only. It will not spend provider credits or upload to YouTube.`n" -ForegroundColor Yellow

Assert-Command 'git' 'Install Git for Windows first.'
Assert-Command 'docker' 'Install and start Docker Desktop first.'

docker compose version | Out-Null
Assert-LastExit 'Docker Compose v2 is required. Start/update Docker Desktop.'
docker info | Out-Null
Assert-LastExit 'Docker Desktop is installed but its engine is not running.'

$envPath = Join-Path $repoRoot '.env'
$examplePath = Join-Path $repoRoot '.env.example'
if (-not (Test-Path $envPath)) {
    Copy-Item $examplePath $envPath
    Write-Host 'Created .env from .env.example'
}

Set-DotEnvValue $envPath 'POSTGRES_PASSWORD' (New-HexSecret 24) -OnlyIfBlank
Set-DotEnvValue $envPath 'APP_SECRET' (New-HexSecret 32) -OnlyIfBlank
Set-DotEnvValue $envPath 'KMF_PORT' '3100' -OnlyIfBlank

$factoryPort = Get-DotEnvValue $envPath 'KMF_PORT'
if ([string]::IsNullOrWhiteSpace($factoryPort) -or $factoryPort -notmatch '^\d{2,5}$' -or [int]$factoryPort -lt 1024 -or [int]$factoryPort -gt 65535) {
    $factoryPort = '3100'
    Set-DotEnvValue $envPath 'KMF_PORT' $factoryPort
}

$currentBaseUrl = Get-DotEnvValue $envPath 'APP_BASE_URL'
if (
    [string]::IsNullOrWhiteSpace($currentBaseUrl) -or
    $currentBaseUrl -eq 'http://localhost:3000' -or
    $currentBaseUrl -eq 'http://127.0.0.1:3000'
) {
    Set-DotEnvValue $envPath 'APP_BASE_URL' "http://localhost:$factoryPort"
}

$localBaseUrl = "http://localhost:$factoryPort"
Set-DotEnvValue $envPath 'SEED_DEMO_DATA' 'false' -OnlyIfBlank
Set-DotEnvValue $envPath 'ANTHROPIC_MODEL' 'claude-opus-5' -OnlyIfBlank

# First boot is forcibly safe. Real-provider settings are enabled only later,
# after the mock acceptance test and operator review.
Set-DotEnvValue $envPath 'CREATIVE_DIRECTOR' 'mock'
Set-DotEnvValue $envPath 'VIDEO_PROVIDER' 'mock'
Set-DotEnvValue $envPath 'ALLOW_PAID_GENERATION' 'false'
Set-DotEnvValue $envPath 'ALLOW_AUTOPILOT_PAID_GENERATION' 'false'
Set-DotEnvValue $envPath 'PUBLISHING_PROVIDER' 'mock'
Set-DotEnvValue $envPath 'ALLOW_YOUTUBE_UPLOAD' 'false'
Set-DotEnvValue $envPath 'ALLOW_PUBLIC_PUBLISHING' 'false'

Write-Host "Using local factory URL: $localBaseUrl" -ForegroundColor Cyan
Write-Host 'Validating Docker Compose configuration...'
docker compose config | Out-Null
Assert-LastExit 'docker compose config failed. Check .env and Docker Compose syntax.'

Write-Host 'Building and starting the safe local stack...'
docker compose up -d --build
Assert-LastExit 'Docker build/start failed. Run docker compose logs --tail=200 app worker db.'

$deadline = (Get-Date).AddMinutes(4)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$localBaseUrl/api/health" -TimeoutSec 4
        if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 4
}

if (-not $healthy) {
    Write-Host "`nThe stack started but health did not become ready in time." -ForegroundColor Yellow
    Write-Host 'Run: docker compose ps'
    Write-Host 'Then: docker compose logs --tail=200 app worker db'
    exit 1
}

Write-Host "`nSAFE MOCK FACTORY IS ONLINE" -ForegroundColor Green
Write-Host "Dashboard: $localBaseUrl/dashboard"
Write-Host "Launch wizard: $localBaseUrl/setup"
Write-Host 'Your operator login secret is APP_SECRET in the local .env file.'
Write-Host 'Next: open /setup, press Prepare safe factory, then configure Telegram/Claude/OpenArt/YouTube one service at a time.'

try { Start-Process "$localBaseUrl/setup" } catch {}
