param([string]$Runtime,[string]$Node,[string]$Cli,[string]$Bash,[string]$Credentials,[int]$Port)
$ErrorActionPreference='Stop'
# Test-only replacement for interactive hidden input; never a production flag.
function Read-Host { param([string]$Prompt,[switch]$AsSecureString) ConvertTo-SecureString 'bridge-synthetic-owner-password-for-ci-only' -AsPlainText -Force }
& (Join-Path $PSScriptRoot '..\scripts\Initialize-Bridge.ps1') -PublicUrl 'https://devspace.example.com' -TunnelId '00000000-0000-0000-0000-000000000000' -RuntimeDirectory $Runtime -NodePath $Node -DevspaceCliPath $Cli -CloudflaredPath $Node -BashDirectory $Bash -CredentialsFile $Credentials -Port $Port | Out-Null
