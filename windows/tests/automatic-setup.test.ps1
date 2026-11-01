$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-setup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
$script:installs = 0
$script:failInstall = $false
$script:startup = @{ Enabled = $true; Loaded = $true; Foreign = $false }
$script:starts = 0
function Get-DreamSkinAutostart { return $script:startup }
function Start-DreamSkinAutostart { $script:starts++; $script:startup.Loaded = $true }
function Install-DreamSkinRuntimeEngine { if ($script:failInstall) { throw 'forced runtime failure' }; $script:installs++ }
function Set-XskinLaunchShortcuts { }
function Save-XskinStateRoot { }
function Enable-DreamSkinAutostart { $script:startup.Enabled = $true; $script:startup.Loaded = $true }
function Disable-DreamSkinAutostart { }
try {
  $state = Join-Path $temporary 'state'
  New-Item -ItemType Directory -Path $state | Out-Null
  Write-XskinSettings -StateRoot $state -Values @{ automaticSetupComplete = $true; language = 'zh-Hant'; pending = 'keep' }
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $state
  Initialize-XskinAutostart -SkillRoot $PSScriptRoot -StateRoot $state
  Initialize-XskinAutostart -SkillRoot $PSScriptRoot -StateRoot $state
  $settings = Read-XskinSettings -StateRoot $state
  if ($script:installs -ne 1 -or $settings.launchSetupVersion -ne 4 -or $settings.language -cne 'zh-Hant' -or
    $settings.pending -cne 'keep' -or -not (Test-DreamSkinPaused -StateRoot $state)) { throw 'Migration lost preferences/pause or ran more than once.' }
  $script:startup.Loaded = $false
  Initialize-XskinAutostart -SkillRoot $PSScriptRoot -StateRoot $state
  if ($script:starts -ne 1 -or $script:installs -ne 1) { throw 'A stopped owned monitor was not restarted without reinstalling.' }
  $script:startup.Enabled = $false
  $script:startup.Loaded = $false
  Initialize-XskinAutostart -SkillRoot $PSScriptRoot -StateRoot $state
  if ($script:installs -ne 2 -or -not $script:startup.Loaded) { throw 'A missing login task was not repaired.' }
  $script:startup.Foreign = $true
  try { Initialize-XskinAutostart -SkillRoot $PSScriptRoot -StateRoot $state; throw 'Foreign task was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'unrelated automatic-startup task') { throw } }
  $script:startup.Foreign = $false
  Set-XskinAutostart -Enabled $false -SkillRoot $PSScriptRoot -StateRoot $state
  Initialize-XskinAutostart -SkillRoot $PSScriptRoot -StateRoot $state
  if ((Read-XskinSettings -StateRoot $state).shortcutSkinEnabled -ne $false -or $script:installs -ne 3) { throw 'Panel reopening re-enabled disabled shortcuts.' }
  $retry = Join-Path $temporary 'retry'
  New-Item -ItemType Directory -Path $retry | Out-Null
  $script:failInstall = $true
  try { Initialize-XskinAutostart -SkillRoot $PSScriptRoot -StateRoot $retry; throw 'Failure accepted.' }
  catch { if ($_.Exception.Message -notmatch 'forced runtime failure') { throw } }
  if ((Read-XskinSettings -StateRoot $retry).launchSetupVersion) { throw 'Failed migration was marked complete.' }
  $script:failInstall = $false
  Initialize-XskinAutostart -SkillRoot $PSScriptRoot -StateRoot $retry
  if ((Read-XskinSettings -StateRoot $retry).launchSetupVersion -ne 4) { throw 'Migration did not retry.' }
} finally { Remove-Item -LiteralPath $temporary -Recurse -Force }
Write-Host 'PASS: one-time shortcut migration preserves pause, language, pending data, disabled preference and retries.'
