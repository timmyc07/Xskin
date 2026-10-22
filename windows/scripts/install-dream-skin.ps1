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

$reopenCodex = $null
$installError = $null
$operationLock = Enter-DreamSkinOperationLock
try {
  Assert-DreamSkinPort -Port $Port
  $null = Get-DreamSkinNodeRuntime
  $registeredInstalls = @(Get-DreamSkinRegisteredCodexInstalls)
  if ($registeredInstalls.Count -eq 0) {
    throw 'The official OpenAI.Codex Store package is not installed or its identity cannot be validated.'
  }
  $activeInstalls = @($registeredInstalls | Where-Object { (Get-DreamSkinCodexProcesses -Codex $_).Count -gt 0 })
  if ($activeInstalls.Count -gt 1) {
    throw 'Multiple registered Codex versions are open. Close them before installing Xskin.'
  }

  $themePaths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $existingState = Read-DreamSkinState -Path $StatePath
  $savedPathCandidate = Get-DreamSkinCodexStatePathCandidate -State $existingState
  $savedCodex = Resolve-DreamSkinCodexInstallFromState -State $existingState -RegisteredInstalls $registeredInstalls
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and
    (Get-DreamSkinCodexProcesses -Codex $savedPathCandidate).Count -gt 0) {
    throw 'The saved Codex path is still running but no longer matches a registered Store package. Close it manually before installing.'
  }
  if (Test-DreamSkinTrayActive) {
    throw 'Exit the Codex Dream Skin tray before reinstalling so every shortcut can move to the new runtime safely.'
  }
  $wasPaused = Test-DreamSkinPaused -StateRoot $StateRoot
  if ($activeInstalls.Count -eq 1) {
    $reopenCodex = $activeInstalls[0]
    Stop-DreamSkinCodex -Codex $reopenCodex
  }
  $engine = Install-DreamSkinRuntimeEngine -SkillRoot $SkillRoot -StateRoot $StateRoot
  $null = Initialize-DreamSkinThemeStore -SkillRoot $engine.Root -StateRoot $StateRoot
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $StateRoot
  $ConfigPath = Join-Path $HOME '.codex\config.toml'
  $BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'
  Install-DreamSkinBaseTheme -ConfigPath $ConfigPath -BackupPath $BackupPath
  Initialize-XskinAutostart -SkillRoot $engine.Root -StateRoot $StateRoot

  if (-not $NoShortcuts) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $launcher = Get-DreamSkinQuietLauncher -StateRoot $StateRoot
    $portArguments = if ($PortExplicit) { @('-Port', "$Port") } else { @() }

    foreach ($folder in @($desktop, $startMenu)) {
      Set-DreamSkinShortcut -Path (Join-Path $folder 'Codex Dream Skin.lnk') -TargetPath $launcher `
        -Arguments (ConvertTo-DreamSkinArgumentLine -Arguments (@('start', '-PromptRestart', '-StateRoot', $StateRoot) + $portArguments)) `
        -WorkingDirectory $engine.Root -Description 'Launch the official Codex app with Codex Dream Skin'
    }

    Set-DreamSkinShortcut -Path (Join-Path $desktop 'Codex Dream Skin - Restore.lnk') -TargetPath $launcher `
      -Arguments (ConvertTo-DreamSkinArgumentLine -Arguments (@('restore', '-RestoreBaseTheme', '-PromptRestart', '-StateRoot', $StateRoot) + $portArguments)) `
      -WorkingDirectory $engine.Root -Description 'Restore the official Codex appearance and close the CDP session'

    foreach ($folder in @($desktop, $startMenu)) {
      Set-DreamSkinShortcut -Path (Join-Path $folder 'Codex Dream Skin - Tray.lnk') -TargetPath $launcher `
        -Arguments (ConvertTo-DreamSkinArgumentLine -Arguments (@('tray', '-StateRoot', $StateRoot) + $portArguments)) `
        -WorkingDirectory $engine.Root -Description 'Open Codex Dream Skin status and theme controls in the system tray'
    }
  }

  Write-Host 'Xskin installed. Your saved background and automatic-apply preferences are ready.'
} catch {
  $installError = $_
} finally {
  Exit-DreamSkinOperationLock -Mutex $operationLock
}

try {
  if ($installError) { throw $installError }
  if ($null -ne $reopenCodex) {
    if ($wasPaused) {
      $null = Start-DreamSkinCodex -Codex $reopenCodex
    } else {
      $startArguments = @{ StateRoot = $StateRoot }
      if ($PortExplicit) { $startArguments.Port = $Port }
      & $engine.Start @startArguments
    }
  }
} catch {
  $failure = $_
  if ($null -ne $reopenCodex -and (Get-DreamSkinCodexProcesses -Codex $reopenCodex).Count -eq 0) {
    try { $null = Start-DreamSkinCodex -Codex $reopenCodex }
    catch { Write-Warning 'Installation could not reopen Codex automatically. Open the official Codex app normally.' }
  }
  throw $failure
}
