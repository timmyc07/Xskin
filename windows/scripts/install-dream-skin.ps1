[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$NoShortcuts,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
)

$ErrorActionPreference = 'Stop'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$SkillRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'xskin-theme.ps1')
$StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot

$operationLock = Enter-DreamSkinOperationLock
try {
  Assert-DreamSkinPort -Port $Port
  $null = Get-DreamSkinNodeRuntime
  $null = Get-DreamSkinCodexInstall
  if (Test-DreamSkinTrayActive) { throw 'Exit the Xskin tray before updating its runtime.' }
  $engine = Install-DreamSkinRuntimeEngine -SkillRoot $SkillRoot -StateRoot $StateRoot
  $null = Initialize-DreamSkinThemeStore -SkillRoot $engine.Root -StateRoot $StateRoot
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  Install-DreamSkinBaseTheme -ConfigPath (Join-Path $HOME '.codex\config.toml') `
    -BackupPath (Join-Path $StateRoot 'config.before-dream-skin.toml')
  if ($PortExplicit) { Write-XskinSettings -StateRoot $StateRoot -Values @{ launchPort = $Port } }
  Save-XskinStateRoot -StateRoot $StateRoot
  if (-not $NoShortcuts) {
    Initialize-XskinAutostart -SkillRoot $engine.Root -StateRoot $StateRoot
    Set-XskinLaunchShortcuts -StateRoot $StateRoot
  }
  Remove-DreamSkinLegacyAutostart -StateRoot $StateRoot
  Remove-XskinLegacyShortcuts -StateRoot $StateRoot
  Write-Host 'Xskin installed. Fully exit Codex, then open Codex (Xskin). The panel can stay closed.'
} finally { Exit-DreamSkinOperationLock -Mutex $operationLock }
