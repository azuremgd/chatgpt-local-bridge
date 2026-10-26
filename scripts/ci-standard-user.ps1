# Disposable GitHub-hosted Windows runner only. Never run on a personal machine.
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'This helper is only for disposable GitHub-hosted CI.' }
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'CI provisioning needs the disposable runner administrator.' }
$root=Join-Path $env:SystemDrive 'BridgeCi'
if(Test-Path -LiteralPath $root){throw 'CI root already exists.'}
$source=Join-Path $root 'source'
New-Item -ItemType Directory -Path $source -Force | Out-Null
$account='BridgeCiUser'
$password=ConvertTo-SecureString ('Bridge!'+[guid]::NewGuid().ToString('N')+'a9') -AsPlainText -Force
$user=New-LocalUser -Name $account -Password $password -AccountNeverExpires
Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $user
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class BridgeCiProfile {
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)]
  public static extern int CreateProfile(string sid, string user, StringBuilder path, uint size);
}
'@
$profilePath=[Text.StringBuilder]::new(260)
$profileResult=[BridgeCiProfile]::CreateProfile($user.SID.Value,$account,$profilePath,260)
if($profileResult -ne 0){throw 'Could not provision the disposable CI user profile.'}
$credential=[PSCredential]::new(($env:COMPUTERNAME+'\'+$account),$password)
# Copy the clean checkout, including Git history for indexed-source checks.
Get-ChildItem -LiteralPath $env:GITHUB_WORKSPACE -Force | Where-Object { $_.Name -notin @('node_modules','dist') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $source -Recurse -Force }
& icacls.exe $root /grant ('*'+$user.SID.Value+':(OI)(CI)M') | Out-Null
if($LASTEXITCODE -ne 0){throw 'CI account ACL setup failed.'}
$script=Join-Path $root 'run.ps1'
@'
param([Parameter(Mandatory=$true)][string]$CiProfile)
$ErrorActionPreference='Stop'
$env:USERPROFILE=$CiProfile
$env:HOME=$env:USERPROFILE
$env:APPDATA=Join-Path $CiProfile 'AppData\Roaming'
$env:LOCALAPPDATA=Join-Path $CiProfile 'AppData\Local'
New-Item -ItemType Directory -Path $env:APPDATA -Force | Out-Null
$env:TEMP=Join-Path $env:LOCALAPPDATA 'Temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
$env:GIT_CONFIG_COUNT='1'
$env:GIT_CONFIG_KEY_0='safe.directory'
$env:GIT_CONFIG_VALUE_0=$PWD.Path
function Run([scriptblock]$command){ & $command; if($LASTEXITCODE -ne 0){throw 'CI command failed.'} }
Run { npm.cmd ci }
$deps=Join-Path $env:USERPROFILE 'BridgeTestDependencies'
Run { npm.cmd install --prefix $deps --no-audit --no-fund @waishnav/devspace@1.0.8 }
$env:BRIDGE_TEST_DEVSPACE_CLI=Join-Path $deps 'node_modules\@waishnav\devspace\dist\cli.js'
$env:BRIDGE_TEST_REVOKE_RUNTIME='1'
Run { npm.cmd test }
Run { npm.cmd run test:mcp }
Run { npm.cmd run test:desktop }
Run { npm.cmd run package }
$version=(Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
$exe=Join-Path $PWD ("dist\devspace-bridge-console-$version-win32-x64\DevSpace Bridge Console.exe")
Run { node.exe tests/desktop-smoke.cjs $exe }
Run { npm.cmd run privacy }
'@ | Set-Content -LiteralPath $script -Encoding UTF8
$bridgeOldModules=$env:PSModulePath
try {
  $env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules"
  $process=Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @('-NoProfile','-File',$script,'-CiProfile',$profilePath.ToString()) -Credential $credential -LoadUserProfile -WorkingDirectory $source -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'stdout.txt') -RedirectStandardError (Join-Path $root 'stderr.txt')
} finally { $env:PSModulePath=$bridgeOldModules }
if(-not $process.WaitForExit(1200000)){Stop-Process -Id $process.Id -Force;throw 'CI standard-user validation timed out.'}
Get-Content -LiteralPath (Join-Path $root 'stdout.txt')
Get-Content -LiteralPath (Join-Path $root 'stderr.txt')
if($process.ExitCode -ne 0){throw 'Standard-user validation failed.'}
