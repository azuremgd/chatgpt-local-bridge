[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PublicUrl,
  [Parameter(Mandatory=$true)][string]$TunnelId,
  [string]$RuntimeDirectory = (Join-Path $env:USERPROFILE 'DevSpaceBridge'),
  [string]$ProjectDirectory,
  [int]$Port = 7676,
  [string]$NodePath,
  [string]$DevspaceCliPath,
  [string]$CloudflaredPath,
  [string]$BashDirectory,
  [string]$CredentialsFile
)
$ErrorActionPreference='Stop'
if (-not $NodePath) { $NodePath=(Get-Command node.exe -ErrorAction Stop).Source }
if (-not $DevspaceCliPath) {
  $npmCommand=(Get-Command npm.cmd -ErrorAction Stop).Source
  $npmRoot=(& $npmCommand root -g | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Unable to locate global npm packages.' }
  $DevspaceCliPath=Join-Path $npmRoot '@waishnav\devspace\dist\cli.js'
}
if (-not $CloudflaredPath) {
  $cloudflareCommand=Get-Command cloudflared.exe -ErrorAction SilentlyContinue
  if ($cloudflareCommand) { $CloudflaredPath=$cloudflareCommand.Source }
  else { $CloudflaredPath=Join-Path $env:LOCALAPPDATA 'Programs\cloudflared\cloudflared.exe' }
}
if (-not $BashDirectory) {
  $gitCommand=(Get-Command git.exe -ErrorAction Stop).Source
  $BashDirectory=Join-Path (Split-Path (Split-Path $gitCommand -Parent) -Parent) 'bin'
}
if (-not (Test-Path -LiteralPath (Join-Path $BashDirectory 'bash.exe'))) { throw 'Git Bash not found. Pass -BashDirectory explicitly.' }
if (-not $CredentialsFile) { $CredentialsFile=Join-Path $env:USERPROFILE ('.cloudflared\'+$TunnelId+'.json') }
foreach($requiredPath in @($NodePath,$DevspaceCliPath,$CloudflaredPath,$CredentialsFile)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw 'A required program or tunnel credential file is missing. See docs/SETUP.md.' }
}
& $NodePath -e 'const [a,b]=process.versions.node.split(/\./).map(Number);if(a<22||(a===22&&b<19)||a>=27)process.exit(1);'
if ($LASTEXITCODE -ne 0) { throw 'Install Node.js >=22.19 and <27.' }
$runtimeFull=[IO.Path]::GetFullPath($RuntimeDirectory)
$ownerSecure=Read-Host 'Choose an Owner Password (24+ characters; stored locally, never printed)' -AsSecureString
$ownerPointer=[IntPtr]::Zero
$previousEncoding=$OutputEncoding
try {
  $ownerPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($ownerSecure)
  $ownerValue=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ownerPointer)
  $setupInput=@{runtime=$runtimeFull;publicUrl=$PublicUrl;tunnelId=$TunnelId;port=$Port;projectDirectory=$ProjectDirectory;nodePath=$NodePath;devspaceCliPath=$DevspaceCliPath;cloudflaredPath=$CloudflaredPath;bashDirectory=$BashDirectory;credentialsFile=$CredentialsFile;ownerPassword=$ownerValue}
  $OutputEncoding=[Text.UTF8Encoding]::new($false)
  $setupInput | ConvertTo-Json -Compress | & $NodePath (Join-Path $PSScriptRoot 'setup.cjs')
  if ($LASTEXITCODE -ne 0) { throw 'Setup did not complete. Inspect the message above; no existing installation was overwritten.' }
} finally {
  if($ownerPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ownerPointer)}
  $ownerValue=$null; $setupInput=$null; $ownerSecure.Dispose(); $OutputEncoding=$previousEncoding
}
Write-Output 'Keep this runtime folder private. Do not copy it into Git or publish logs.'
Write-Output ('Runtime directory: '+$runtimeFull)
