$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$oauthPath = Join-Path $HOME '.mcp-inspector\storage\oauth.json'
if (-not (Test-Path $oauthPath)) {
    throw "MCP Inspector OAuth state was not found at $oauthPath. Connect OpenArt in MCP Inspector first."
}

function Get-PropertyValue($Object, [string]$Name) {
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($property) { return $property.Value }
    return $null
}

function Find-FirstNamedValue($Object, [string[]]$Names, [int]$Depth = 0) {
    if ($null -eq $Object -or $Depth -gt 12) { return $null }
    if ($Object -is [string] -or $Object -is [ValueType]) { return $null }

    foreach ($name in $Names) {
        $value = Get-PropertyValue $Object $name
        if ($null -ne $value -and "$value".Trim()) { return $value }
    }

    if ($Object -is [System.Collections.IEnumerable] -and -not ($Object -is [pscustomobject])) {
        foreach ($item in $Object) {
            $found = Find-FirstNamedValue $item $Names ($Depth + 1)
            if ($null -ne $found) { return $found }
        }
        return $null
    }

    foreach ($property in $Object.PSObject.Properties) {
        $found = Find-FirstNamedValue $property.Value $Names ($Depth + 1)
        if ($null -ne $found) { return $found }
    }
    return $null
}

Write-Host "`nKarzoun Media Factory - import durable OpenArt OAuth" -ForegroundColor Cyan
Write-Host "Reading MCP Inspector's local OAuth state. No token values will be printed.`n" -ForegroundColor Yellow

$root = Get-Content $oauthPath -Raw | ConvertFrom-Json
$state = Get-PropertyValue $root 'state'
if ($null -eq $state) { $state = $root }
$servers = Get-PropertyValue $state 'servers'
if ($null -eq $servers) { throw 'MCP Inspector oauth.json does not contain a servers object.' }

$serverProperty = $servers.PSObject.Properties | Where-Object {
    $_.Name.TrimEnd('/') -ieq 'https://mcp.openart.ai/mcp'
} | Select-Object -First 1

if (-not $serverProperty) {
    throw 'No OpenArt OAuth state found. Connect https://mcp.openart.ai/mcp in MCP Inspector first.'
}

$server = $serverProperty.Value
$activeIssuer = Get-PropertyValue $server 'activeIssuer'
$bound = $null
$byIssuer = Get-PropertyValue $server 'byIssuer'
if ($byIssuer -and $activeIssuer) {
    $bound = Get-PropertyValue $byIssuer $activeIssuer
}
if ($null -eq $bound) { $bound = $server }

$tokens = Get-PropertyValue $bound 'tokens'
if ($null -eq $tokens) { $tokens = Get-PropertyValue $server 'tokens' }
$client = Get-PropertyValue $bound 'clientInformation'
if ($null -eq $client) { $client = Get-PropertyValue $server 'clientInformation' }

$accessToken = if ($tokens) { Get-PropertyValue $tokens 'access_token' } else { $null }
$refreshToken = if ($tokens) { Get-PropertyValue $tokens 'refresh_token' } else { $null }
$scope = if ($tokens) { Get-PropertyValue $tokens 'scope' } else { $null }
$clientId = if ($client) { Get-PropertyValue $client 'client_id' } else { $null }
$clientSecret = if ($client) { Get-PropertyValue $client 'client_secret' } else { $null }
$tokenEndpointAuthMethod = if ($client) { Get-PropertyValue $client 'token_endpoint_auth_method' } else { $null }
$tokenEndpoint = Find-FirstNamedValue $server @('token_endpoint', 'tokenEndpoint')

if (-not $accessToken -and -not $refreshToken) { throw 'OpenArt OAuth state has no access or refresh token. Reconnect OpenArt in MCP Inspector.' }
if (-not $refreshToken) {
    Write-Host 'WARNING: Inspector did not store a refresh token. This import will still work temporarily, but automatic renewal will not be durable.' -ForegroundColor Yellow
}
if ($refreshToken -and (-not $clientId -or -not $tokenEndpoint)) {
    throw 'A refresh token exists, but client_id or token_endpoint could not be discovered from Inspector state. Reconnect OpenArt with the current Inspector and retry.'
}

$credential = [ordered]@{
    accessToken = if ($accessToken) { "$accessToken" } else { $null }
    refreshToken = if ($refreshToken) { "$refreshToken" } else { $null }
    clientId = if ($clientId) { "$clientId" } else { $null }
    clientSecret = if ($clientSecret) { "$clientSecret" } else { $null }
    tokenEndpoint = if ($tokenEndpoint) { "$tokenEndpoint" } else { $null }
    scope = if ($scope) { "$scope" } else { $null }
    tokenEndpointAuthMethod = if ($tokenEndpointAuthMethod) { "$tokenEndpointAuthMethod" } else { $null }
}

$payload = $credential | ConvertTo-Json -Compress
$payload | docker compose exec -T worker npx tsx scripts/store-openart-oauth.ts
if ($LASTEXITCODE -ne 0) { throw 'Failed to store OpenArt OAuth credential in the encrypted factory credential store.' }

Write-Host "`nOpenArt OAuth import complete." -ForegroundColor Green
Write-Host 'The factory now prefers the encrypted refresh-capable credential over the rotating access token in .env.'
Write-Host 'You do not need to copy a new OPENART_MCP_ACCESS_TOKEN every time Inspector refreshes it.' -ForegroundColor Green
