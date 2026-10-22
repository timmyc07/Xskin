$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-setup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
$script:registrations = 0
$script:failInstall = $false
function Get-XskinAutostart { return @{ Foreign = $false } }
function Get-DreamSkinCodexInstall { return @{} }
function Install-DreamSkinRuntimeEngine {
  if ($script:failInstall) { throw 'forced runtime failure' }
}
function Stop-DreamSkinAutostart { }
function Get-DreamSkinAutostartTask { return $null }
function Register-DreamSkinAutostartTask { $script:registrations++ }
function Start-DreamSkinAutostart { }
function Get-DreamSkinAutostartShortcutPath { return Join-Path $temporary 'unused.lnk' }
function Get-XskinLaunchShortcutPaths { return @() }
try {
  $stateRoot = Join-Path $temporary ('state ' + [char]0x4E2D + [char]0x6587)
  New-Item -ItemType Directory -Path $stateRoot | Out-Null
  Write-XskinSettings -StateRoot $stateRoot -Values @{ language = 'zh-Hant'; pending = 'keep' }
  Initialize-XskinAutostart -SkillRoot $root -StateRoot $stateRoot
  $settings = Read-XskinSettings -StateRoot $stateRoot
  if ($script:registrations -ne 1 -or -not $settings.automaticSetupComplete -or
    $settings.language -ne 'zh-Hant' -or $settings.pending -ne 'keep') { throw 'First setup did not enable automatic apply or preserve preferences.' }
  Initialize-XskinAutostart -SkillRoot $root -StateRoot $stateRoot
  Set-XskinAutostart -Enabled $false -SkillRoot $root -StateRoot $stateRoot
  Initialize-XskinAutostart -SkillRoot $root -StateRoot $stateRoot
  if ($script:registrations -ne 1) { throw 'Opening Xskin re-enabled an explicitly disabled preference.' }

  $disabledRoot = Join-Path $temporary 'disabled'
  New-Item -ItemType Directory -Path $disabledRoot | Out-Null
  Set-XskinAutostart -Enabled $false -SkillRoot $root -StateRoot $disabledRoot
  Initialize-XskinAutostart -SkillRoot $root -StateRoot $disabledRoot
  if ($script:registrations -ne 1) { throw 'Initial setup ignored an explicit disable.' }

  $pausedRoot = Join-Path $temporary 'paused'
  New-Item -ItemType Directory -Path $pausedRoot | Out-Null
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $pausedRoot
  Initialize-XskinAutostart -SkillRoot $root -StateRoot $pausedRoot
  if ($script:registrations -ne 1 -or -not (Read-XskinSettings -StateRoot $pausedRoot).automaticSetupComplete -or
    -not (Test-DreamSkinPaused -StateRoot $pausedRoot)) { throw 'Setup ignored an existing pause.' }

  $retryRoot = Join-Path $temporary 'retry'
  New-Item -ItemType Directory -Path $retryRoot | Out-Null
  $script:failInstall = $true
  try {
    Initialize-XskinAutostart -SkillRoot $root -StateRoot $retryRoot
    throw 'Failed automatic setup was accepted.'
  } catch { if ($_.Exception.Message -notmatch 'forced runtime failure') { throw } }
  if ((Read-XskinSettings -StateRoot $retryRoot).automaticSetupComplete) { throw 'Failed setup was marked complete.' }
  $script:failInstall = $false
  Initialize-XskinAutostart -SkillRoot $root -StateRoot $retryRoot
  if ($script:registrations -ne 2) { throw 'Failed setup did not retry.' }
} finally {
  $fullPath = [IO.Path]::GetFullPath($temporary)
  if (-not $fullPath.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
  Remove-Item -LiteralPath $fullPath -Recurse -Force
}
Write-Host 'PASS: first setup enables automatic apply once, preserves pause/disable, and retries failures.'
