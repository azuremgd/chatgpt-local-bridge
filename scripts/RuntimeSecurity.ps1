[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$RuntimeDirectory,
  [Parameter(Mandatory=$true)][string]$SourceDirectory,
  [ValidateSet('Create','Check')][string]$Mode='Check'
)
$ErrorActionPreference='Stop'
function Reject([string]$message) { throw ('BRIDGE_SECURITY: '+$message) }
function ContainsPath([string]$parent,[string]$child) {
  return $child.Equals($parent,[StringComparison]::OrdinalIgnoreCase) -or $child.StartsWith($parent.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)
}
function FullPath([string]$value) {
  if ($value -notmatch '^[a-zA-Z]:[\\/]' -or $value.Substring(2).Contains(':')) { Reject 'Runtime must use a local drive path without alternate streams.' }
  foreach($part in ($value.Substring(3) -split '[\\/]')) {
    if ($part -and $part -notin @('.','..') -and ($part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)')) { Reject 'Runtime contains an ambiguous Windows path component.' }
  }
  return [IO.Path]::GetFullPath($value).TrimEnd('\')
}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[Security.Principal.WindowsPrincipal]::new($identity)
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Reject 'Elevated execution is refused. Open a normal, non-administrator session.' }
$sid=$identity.User
$allowed=@($sid.Value,'S-1-5-18')
$trustedAncestors=@($sid.Value,'S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
$runtimeFull=FullPath $RuntimeDirectory
$sourceFull=FullPath $SourceDirectory
$profileDirectory=[Microsoft.Win32.Registry]::GetValue(('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\'+$sid.Value),'ProfileImagePath',$null)
if (-not $profileDirectory) { Reject 'Windows user profile is unavailable.' }
$profileDirectory=[Environment]::ExpandEnvironmentVariables($profileDirectory)
$userHome=FullPath $profileDirectory
if ($runtimeFull.Length -le 3 -or (ContainsPath $runtimeFull $userHome) -or (ContainsPath $runtimeFull $sourceFull) -or (ContainsPath $sourceFull $runtimeFull)) { Reject 'Runtime overlaps a protected root, home or source directory.' }
$sensitive=@('AppData','.ssh','.aws','.azure','.cloudflared','.devspace','.codex','.gnupg','.kube') | ForEach-Object { [IO.Path]::Combine($userHome,$_) }
$sensitive+=@($env:SystemRoot,$env:ProgramFiles,${env:ProgramFiles(x86)},$env:ProgramData) | Where-Object { $_ }
foreach($protected in $sensitive) {
  $full=FullPath $protected
  if ((ContainsPath $full $runtimeFull) -or (ContainsPath $runtimeFull $full)) { Reject 'Runtime overlaps a sensitive or system directory.' }
}
# Reject every existing ancestor alias before touching permissions or files.
$cursor=$runtimeFull
while ($cursor) {
  if ([IO.Directory]::Exists($cursor) -or [IO.File]::Exists($cursor)) {
    $attributes=[IO.File]::GetAttributes($cursor)
    if (-not ($attributes -band [IO.FileAttributes]::Directory) -or ($attributes -band [IO.FileAttributes]::ReparsePoint)) { Reject 'Runtime or an ancestor is a link or not a directory.' }
    # Read raw security descriptors without account-name translation or formatting.
    $acl=[IO.Directory]::GetAccessControl($cursor)
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $trustedAncestors) { Reject 'An ancestor directory is owned by another account.' }
    foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
      if ($ace.AccessControlType -eq 'Allow' -and $ace.IdentityReference.Value -notin $trustedAncestors -and -not ($ace.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)) {
        $danger=[Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
        if ($ace.FileSystemRights -band $danger) { Reject 'An ancestor directory can be controlled by another account.' }
      }
    }
  }
  $cursor=[IO.Path]::GetDirectoryName($cursor.TrimEnd('\'))
}
function AssertPrivate([string]$target,[bool]$root=$false) {
  $attributes=[IO.File]::GetAttributes($target)
  if ($attributes -band [IO.FileAttributes]::ReparsePoint) { Reject 'Runtime contains a junction or symbolic link.' }
  $isDirectory=($attributes -band [IO.FileAttributes]::Directory) -ne 0
  $acl=if($isDirectory){[IO.Directory]::GetAccessControl($target)}else{[IO.File]::GetAccessControl($target)}
  if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed) { Reject 'Runtime ownership is not private.' }
  if ($root -and -not $acl.AreAccessRulesProtected) { Reject 'Runtime ACL inheritance is not restricted.' }
  $grants=@{}
  foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($ace.IdentityReference.Value -notin $allowed -or $ace.AccessControlType -ne 'Allow') { Reject 'Runtime ACL contains unexpected permissions; choose a new runtime instead of modifying it automatically.' }
    if (($ace.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl -and -not ($ace.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)) {
      if (-not $isDirectory -or ($ace.InheritanceFlags -band 3) -eq 3) { $grants[$ace.IdentityReference.Value]=$true }
    }
  }
  foreach($who in $allowed) { if (-not $grants[$who]) { Reject 'Runtime ACL must grant current user and SYSTEM full control.' } }
}
if (-not [IO.Directory]::Exists($runtimeFull)) {
  if ($Mode -ne 'Create') { Reject 'Runtime does not exist.' }
  if (-not [IO.Directory]::Exists([IO.Path]::GetDirectoryName($runtimeFull))) { Reject 'Create the dedicated runtime parent first.' }
  $privateAcl=[Security.AccessControl.DirectorySecurity]::new()
  $privateAcl.SetOwner($sid)
  $privateAcl.SetAccessRuleProtection($true,$false)
  foreach($who in $allowed) {
    $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($who),'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $privateAcl.AddAccessRule($rule)
  }
  # Windows PowerShell/.NET Framework creates the directory with its DACL.
  [IO.Directory]::CreateDirectory($runtimeFull,$privateAcl) | Out-Null
  AssertPrivate $runtimeFull $true
  $marker=[IO.Path]::Combine($runtimeFull,'.bridge-runtime')
  $stream=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $stream.Dispose()
}
AssertPrivate $runtimeFull $true
if (-not [IO.File]::Exists([IO.Path]::Combine($runtimeFull,'.bridge-runtime'))) { Reject 'Existing directory is not a managed runtime.' }
# Project contents are not scanned; critical runtime trees and all top-level entries are.
$pending=[Collections.Generic.Stack[string]]::new()
$pending.Push($runtimeFull)
while ($pending.Count) {
  $dir=$pending.Pop()
  foreach($entry in [IO.Directory]::EnumerateFileSystemEntries($dir)) {
    AssertPrivate $entry
    if ([IO.Directory]::Exists($entry) -and -not ($dir -eq $runtimeFull -and [IO.Path]::GetFileName($entry) -in @('workspace','worktrees','disabled-agents'))) { $pending.Push($entry) }
  }
}
