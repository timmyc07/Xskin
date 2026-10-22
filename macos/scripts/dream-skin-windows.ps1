[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('source', 'install', 'tray', 'start', 'start-authorized', 'verify', 'restore', 'restore-authorized', 'recover-config', 'uninstall', 'test')]
  [string]$Action,
  [int]$Port = 9335,
  [string]$ScreenshotPath,
  [switch]$NoShortcuts,
  [string]$ProfilePath,
  [switch]$ForegroundInjector,
  [switch]$NoRelaunch
)

$ErrorActionPreference = 'Stop'
# The repository wrapper uses the matching bundled Windows source, never an older downloaded launcher.
$SourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\windows'))
if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot 'scripts\start-dream-skin.ps1'))) {
  throw 'Use the complete Xskin Windows package or source checkout for this wrapper.'
}

function Invoke-RuntimeScript {
  param([string]$Name, [object[]]$Arguments = @())
  $script = Join-Path $SourceRoot "scripts\$Name"
  if (-not (Test-Path -LiteralPath $script)) { throw "Runtime script is missing: $script" }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script @Arguments
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

switch ($Action) {
  'source' {
    Write-Host "Bundled Xskin Windows runtime ready: $SourceRoot"
  }
  'install' {
    $arguments = @('-Port', $Port)
    if ($NoShortcuts) { $arguments += '-NoShortcuts' }
    Invoke-RuntimeScript 'install-dream-skin.ps1' $arguments
  }
  'tray' {
    $trayScript = Join-Path $SourceRoot 'scripts\tray-dream-skin.ps1'
    if (-not (Test-Path -LiteralPath $trayScript)) { throw "Runtime script is missing: $trayScript" }
    & powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File $trayScript -Port $Port
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  'start' {
    $arguments = @('-Port', $Port, '-Resume')
    if ($ProfilePath) { $arguments += @('-ProfilePath', $ProfilePath) }
    if ($ForegroundInjector) { $arguments += '-ForegroundInjector' }
    Invoke-RuntimeScript 'start-dream-skin.ps1' $arguments
  }
  'start-authorized' {
    $arguments = @('-Port', $Port, '-Resume')
    if ($ProfilePath) { $arguments += @('-ProfilePath', $ProfilePath) }
    if ($ForegroundInjector) { $arguments += '-ForegroundInjector' }
    Invoke-RuntimeScript 'start-dream-skin.ps1' $arguments
  }
  'verify' {
    $arguments = @('-Port', $Port)
    if ($ScreenshotPath) { $arguments += @('-ScreenshotPath', $ScreenshotPath) }
    Invoke-RuntimeScript 'verify-dream-skin.ps1' $arguments
  }
  'restore' {
    $arguments = @('-Port', $Port, '-RestoreBaseTheme', '-PromptRestart')
    if ($NoRelaunch) { $arguments += '-NoRelaunch' }
    Invoke-RuntimeScript 'restore-dream-skin.ps1' $arguments
  }
  'restore-authorized' {
    $arguments = @('-Port', $Port, '-RestoreBaseTheme', '-ForceRestart')
    if ($NoRelaunch) { $arguments += '-NoRelaunch' }
    Invoke-RuntimeScript 'restore-dream-skin.ps1' $arguments
  }
  'recover-config' {
    $arguments = @('-Port', $Port, '-RecoverConfigBackup', '-PromptRestart')
    if ($NoRelaunch) { $arguments += '-NoRelaunch' }
    Invoke-RuntimeScript 'restore-dream-skin.ps1' $arguments
  }
  'uninstall' {
    $arguments = @('-Port', $Port, '-RestoreBaseTheme', '-PromptRestart', '-Uninstall')
    if ($NoRelaunch) { $arguments += '-NoRelaunch' }
    Invoke-RuntimeScript 'restore-dream-skin.ps1' $arguments
  }
  'test' {
    $testScript = Join-Path $SourceRoot 'windows\tests\run-tests.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $testScript
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
}
