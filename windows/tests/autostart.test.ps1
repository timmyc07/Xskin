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
  $legacyPath = Join-Path $temporary 'old-start.lnk'
  $script:legacyEntry = @{ Path = $legacyPath; Mode = 'start'; Switches = @('-PromptRestart'); Description = 'Launch the official Codex app with Codex Dream Skin' }
  function Get-XskinLegacyShortcutDefinitions { return $script:legacyEntry }
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $stateRoot
  Set-DreamSkinShortcut -Path $legacyPath -TargetPath (Join-Path $engine.Scripts 'xskin-quiet.exe') -WorkingDirectory $engine.Root `
    -Description $script:legacyEntry.Description -Arguments (ConvertTo-DreamSkinArgumentLine -Arguments @('start', '-PromptRestart', '-StateRoot', $stateRoot, '-Port', '9440'))
  Remove-XskinLegacyShortcuts -StateRoot $stateRoot
  if (Test-Path -LiteralPath $legacyPath) { throw 'A fully owned obsolete packaged shortcut survived migration.' }
  Set-DreamSkinShortcut -Path $legacyPath -TargetPath (Join-Path $temporary 'foreign.exe') -WorkingDirectory $engine.Root `
    -Description $script:legacyEntry.Description -Arguments (ConvertTo-DreamSkinArgumentLine -Arguments @('start', '-PromptRestart', '-StateRoot', $stateRoot))
  $legacyHash = (Get-FileHash -LiteralPath $legacyPath).Hash
  Remove-XskinLegacyShortcuts -StateRoot $stateRoot
  if ((Get-FileHash -LiteralPath $legacyPath).Hash -cne $legacyHash) { throw 'An unrelated same-name legacy shortcut was removed.' }
  $script:startupPath = Join-Path $temporary 'startup.lnk'
  function Get-DreamSkinAutostartShortcutPath { return $script:startupPath }
  Set-DreamSkinShortcut -Path $script:startupPath -TargetPath (Join-Path $temporary 'foreign.exe') -Arguments '' -WorkingDirectory $temporary -Description 'Unrelated shortcut'
  $startupHash = (Get-FileHash -LiteralPath $script:startupPath).Hash
  Remove-DreamSkinLegacyStartupShortcut -StateRoot $stateRoot
  if ((Get-FileHash -LiteralPath $script:startupPath).Hash -cne $startupHash) { throw 'An unrelated startup shortcut was removed.' }
} finally { Remove-Item -LiteralPath $temporary -Recurse -Force }
Write-Host 'PASS: Unicode managed links, repeated setup and foreign shortcut preservation.'
