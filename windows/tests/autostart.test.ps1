$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-shortcuts-' + [guid]::NewGuid().ToString('N'))
$stateRoot = Join-Path $temporary ('state 中文 🌙 with spaces')
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$script:fixturePaths = @((Join-Path $temporary 'desktop.lnk'), (Join-Path $temporary 'menu.lnk'))
function Get-XskinLaunchShortcutPaths { return $script:fixturePaths }
function Get-DreamSkinQuietLauncher { return Join-Path $StateRoot 'engine\scripts\xskin-quiet.exe' }
function Get-DreamSkinCodexInstall { return @{ Executable = (Join-Path $temporary 'official.exe') } }
try {
  Set-XskinLaunchShortcuts -StateRoot $stateRoot
  foreach ($file in $script:fixturePaths) {
    $link = Get-DreamSkinShortcut -Path $file
    if (-not (Test-XskinLaunchShortcut -Link $link -StateRoot $stateRoot) -or $link.Arguments -match 'Restart|Resume') {
      throw 'Shortcut identity, Unicode arguments or no-restart behavior failed.'
    }
  }
  Set-XskinLaunchShortcuts -StateRoot $stateRoot
  $foreign = $script:fixturePaths[1]
  Set-DreamSkinShortcut -Path $foreign -TargetPath (Join-Path $temporary 'foreign.exe') -Arguments '' -WorkingDirectory $temporary -Description 'Unrelated shortcut'
  $hash = (Get-FileHash -LiteralPath $foreign).Hash
  try { Set-XskinLaunchShortcuts -StateRoot $stateRoot; throw 'Foreign shortcut was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'unrelated shortcut already exists') { throw } }
  if ((Get-FileHash -LiteralPath $foreign).Hash -cne $hash) { throw 'Foreign shortcut was overwritten.' }
  Set-XskinLaunchShortcuts -StateRoot $stateRoot -Remove
  if ((Test-Path -LiteralPath $script:fixturePaths[0]) -or (Get-FileHash -LiteralPath $foreign).Hash -cne $hash) {
    throw 'Uninstall did not preserve a foreign entry.'
  }
  $script:events = [Collections.Generic.List[string]]::new()
  $script:legacyTask = @{ Enabled = $true }
  function Get-DreamSkinAutostartTask { return $script:legacyTask }
  function Test-DreamSkinAutostartTask { return $true }
  function Get-DreamSkinAutostartProcess { return @{ Id = 1 } }
  function Read-DreamSkinState { return @{ injectorPid = 1 } }
  function Stop-DreamSkinRecordedInjector { $script:events.Add('injector'); return $true }
  function Stop-DreamSkinAutostart {
    if ($script:legacyTask.Enabled) { throw 'Legacy task could restart during migration.' }
    $script:events.Add('monitor')
  }
  function Get-DreamSkinAutostartTaskFolder {
    $folder = New-Object psobject
    $folder | Add-Member -MemberType ScriptMethod -Name DeleteTask -Value { param($Name,$Flags) $script:events.Add('task') }
    return $folder
  }
  function Get-DreamSkinAutostartTaskName { return 'fixture' }
  function Get-DreamSkinAutostartShortcutPath { return Join-Path $temporary 'absent.lnk' }
  Remove-DreamSkinLegacyAutostart -StateRoot $stateRoot
  if (($script:events -join ',') -cne 'injector,monitor,task') { throw 'Legacy pipe-holder shutdown order regressed.' }
} finally { Remove-Item -LiteralPath $temporary -Recurse -Force }
Write-Host 'PASS: Unicode managed links, repeated setup, foreign-name preservation and legacy pipe-holder shutdown order.'
