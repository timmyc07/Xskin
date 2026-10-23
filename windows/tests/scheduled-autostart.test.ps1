$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-task-' + [guid]::NewGuid().ToString('N'))
$stateRoot = Join-Path $temporary 'state 中文 🌙'
$source = Join-Path $temporary 'source'
$taskName = 'Xskin-autostart-test-' + [guid]::NewGuid().ToString('N')
$startupPath = Join-Path $temporary 'startup.lnk'
New-Item -ItemType Directory -Path $source -Force | Out-Null
function Get-DreamSkinAutostartTaskName { return $taskName }
function Get-DreamSkinAutostartShortcutPath { return $startupPath }
function Get-XskinLaunchShortcutPaths { return @((Join-Path $temporary 'desktop.lnk'), (Join-Path $temporary 'menu.lnk')) }
function Save-XskinStateRoot { }
function Get-DreamSkinCodexInstall { return @{ Executable = (Join-Path $temporary 'fixture.exe') } }
try {
  foreach ($directory in @('assets','scripts','presets')) { Copy-Item -LiteralPath (Join-Path $root $directory) -Destination $source -Recurse }
  Copy-Item -LiteralPath (Join-Path $root 'VERSION') -Destination $source
  $helpers = Join-Path $source 'scripts\autostart-windows.ps1'
  [IO.File]::AppendAllText($helpers, "`nfunction Get-DreamSkinAutostartTaskName { return '$taskName' }`nfunction Get-DreamSkinAutostartShortcutPath { return '$($startupPath.Replace("'", "''"))' }`n", [Text.UTF8Encoding]::new($false))
  # The isolated observer cannot match or close the real official app during this test.
  [IO.File]::AppendAllText((Join-Path $source 'scripts\xskin-theme.ps1'), "`nfunction Get-DreamSkinCodexInstall { return @{ Executable = 'C:\Xskin-test-only\fixture.exe' } }`n", [Text.UTF8Encoding]::new($false))
  Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot
  $startup = Get-XskinAutostart -StateRoot $stateRoot
  if (-not $startup.Enabled -or -not $startup.Loaded -or $startup.Foreign) { throw 'The real login task was not registered and ready.' }
  $task = Get-DreamSkinAutostartTask
  if (-not (Test-DreamSkinAutostartTask -Task $task -StateRoot $stateRoot) -or
    $task.Definition.Settings.ExecutionTimeLimit -cne 'PT0S' -or $task.Definition.Settings.RestartCount -ne 999) {
    throw 'The observer lacks its exact least-privilege task identity or restart policy.'
  }
  $before = Get-DreamSkinAutostartProcess -StateRoot $stateRoot
  Start-DreamSkinAutostart -StateRoot $stateRoot
  if ((Get-DreamSkinAutostartProcess -StateRoot $stateRoot).Id -ne $before.Id) { throw 'Repeated start created another observer.' }
  $definition = $task.Definition
  $definition.Actions.Item(1).Arguments += ' extra'
  if (Test-DreamSkinAutostartTask -Task ([pscustomobject]@{ Definition = $definition }) -StateRoot $stateRoot) { throw 'An extra foreign task argument was accepted.' }
  $register = (Get-Command Register-DreamSkinAutostartTask).ScriptBlock
  function Register-DreamSkinAutostartTask { throw 'fixture task registration failure' }
  try { Enable-DreamSkinAutostart -StateRoot $stateRoot; throw 'Task registration failure was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'fixture task registration failure') { throw } }
  Set-Item -Path Function:\Register-DreamSkinAutostartTask -Value $register
  $before = Get-DreamSkinAutostartProcess -StateRoot $stateRoot
  if (-not $before -or -not (Get-XskinAutostart -StateRoot $stateRoot).Loaded) { throw 'Failed enable did not restore the prior enabled monitor.' }
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot
  $null = Install-DreamSkinRuntimeEngine -SkillRoot $source -StateRoot $stateRoot
  $after = Get-DreamSkinAutostartProcess -StateRoot $stateRoot
  if (-not $after -or $after.Id -eq $before.Id -or -not $before.WaitForExit(5000) -or
    -not (Test-DreamSkinPaused -StateRoot $stateRoot)) { throw 'Runtime replacement did not resume the monitor and preserve pause.' }
  $before = $after
  $script:failedSwap = $false
  function Move-Item {
    [CmdletBinding()]
    param([string]$LiteralPath, [string]$Destination)
    if ([IO.Path]::GetFileName($LiteralPath) -like '.engine-staging-*' -and -not $script:failedSwap) {
      $script:failedSwap = $true
      throw 'fixture engine swap failure'
    }
    Microsoft.PowerShell.Management\Move-Item -LiteralPath $LiteralPath -Destination $Destination -ErrorAction Stop
  }
  try { $null = Install-DreamSkinRuntimeEngine -SkillRoot $source -StateRoot $stateRoot; throw 'Failed swap was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'fixture engine swap failure') { throw } }
  Remove-Item Function:\Move-Item
  $after = Get-DreamSkinAutostartProcess -StateRoot $stateRoot
  if (-not $after -or $after.Id -eq $before.Id -or -not $before.WaitForExit(5000) -or
    -not (Test-DreamSkinPaused -StateRoot $stateRoot)) { throw 'Failed engine swap did not restore and resume the previous monitor.' }
  if (@(Get-ChildItem -LiteralPath $stateRoot -Directory -Filter '.engine-backup-*').Count -ne 0) { throw 'The quiet monitor kept an engine backup locked.' }
  Disable-DreamSkinAutostart -StateRoot $stateRoot
  if ((Get-DreamSkinAutostartTask) -or (Get-DreamSkinAutostartProcess -StateRoot $stateRoot)) { throw 'Disable retained its owned observer or task.' }
  if (-not (Test-DreamSkinPaused -StateRoot $stateRoot)) { throw 'Disable cleared the paused state.' }
} catch {
  $task = Get-DreamSkinAutostartTask
  if ($task) {
    Write-Host ($task.Xml)
    $actionPath = $task.Definition.Actions.Item(1).Path
    Write-Host "Executable exists: $([IO.File]::Exists($actionPath))"
    Get-ChildItem -LiteralPath (Join-Path $stateRoot 'engine\scripts') -Filter '*quiet*' | ForEach-Object { Write-Host $_.FullName }
  }
  throw
} finally {
  Remove-Item Function:\Move-Item -ErrorAction SilentlyContinue
  if (Get-DreamSkinAutostartTask) { Disable-DreamSkinAutostart -StateRoot $stateRoot }
  Remove-Item -LiteralPath $temporary -Recurse -Force
}
Write-Host 'PASS: real isolated login task, exact identity, single observer, runtime upgrade/rollback, pause preservation and disable.'
