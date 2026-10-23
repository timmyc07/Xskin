[CmdletBinding()]
param(
  [int]$Port = 9335,
  [switch]$Resume,
  [switch]$ExistingOnly,
  [int]$NewLaunchPid,
  [string]$NewLaunchStartedAt,
  [string]$ProfilePath,
  [switch]$ForegroundInjector,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
)

$ErrorActionPreference = 'Stop'
$StateRoot = [System.IO.Path]::GetFullPath($StateRoot)
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$Injector = Join-Path $PSScriptRoot 'injector.mjs'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'xskin-theme.ps1')
$StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot

$operationLock = Enter-DreamSkinOperationLock -TimeoutMilliseconds $(if ($NewLaunchPid) { 2000 } else { 60000 })
$automaticClosed = $false
try {
  Assert-DreamSkinPort -Port $Port
  if ($ProfilePath) { $ProfilePath = [System.IO.Path]::GetFullPath($ProfilePath) }
  $node = Get-DreamSkinNodeRuntime
  $currentCodex = Get-DreamSkinCodexInstall
  $codex = $currentCodex
  $themePaths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  Ensure-DreamSkinManagedDirectory -Path $themePaths.Root -Root $themePaths.Root
  $StatePath = Join-Path $StateRoot 'state.json'
  $StdoutPath = Join-Path $StateRoot 'injector.log'
  $StderrPath = Join-Path $StateRoot 'injector-error.log'
  $VerifyPath = Join-Path $StateRoot 'verify.log'
  $themePaths = Initialize-DreamSkinThemeStore -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
  $pauseWasSet = Test-DreamSkinPaused -StateRoot $StateRoot

  if ($NewLaunchPid -or $NewLaunchStartedAt) {
    if ($ExistingOnly -or -not $NewLaunchPid -or -not $NewLaunchStartedAt -or
      -not (Get-DreamSkinAutostart -StateRoot $StateRoot).Enabled -or $pauseWasSet -or
      (Read-XskinSettings -StateRoot $StateRoot).shortcutSkinEnabled -eq $false -or
      -not (Test-DreamSkinNewCodexLaunch -Codex $currentCodex -ProcessId $NewLaunchPid -StartedAt $NewLaunchStartedAt)) {
      throw 'Automatic apply is disabled, paused, or its fresh official process identity changed.'
    }
  }

  $previousState = Read-DreamSkinState -Path $StatePath
  $settings = Read-XskinSettings -StateRoot $StateRoot
  if (-not $PortExplicit -and $settings.launchPort) { $Port = [int]$settings.launchPort; Assert-DreamSkinPort -Port $Port }
  if (-not $PortExplicit -and $null -ne $previousState -and $previousState.port) {
    $savedPort = [int]$previousState.port
    Assert-DreamSkinPort -Port $savedPort
    $Port = $savedPort
  }
  $savedPathCandidate = Get-DreamSkinCodexStatePathCandidate -State $previousState
  $savedCodex = Get-DreamSkinCodexInstallFromState -State $previousState
  $candidateMatchesCurrent = [bool]($null -ne $savedPathCandidate -and
    (Test-DreamSkinPathEqual -Left $savedPathCandidate.PackageRoot -Right $currentCodex.PackageRoot) -and
    (Test-DreamSkinPathEqual -Left $savedPathCandidate.Executable -Right $currentCodex.Executable))
  if ($null -ne $savedPathCandidate -and $null -eq $savedCodex -and -not $candidateMatchesCurrent) {
    $unverifiedSavedRunning = (Get-DreamSkinCodexProcesses -Codex $savedPathCandidate).Count -gt 0
    $unverifiedSavedOwnsPort = Test-DreamSkinCodexPortOwner -Port $Port -Codex $savedPathCandidate
    if ($unverifiedSavedRunning -or $unverifiedSavedOwnsPort) {
      throw 'The saved Codex path is still active but no longer matches a registered OpenAI.Codex package. Close it manually; state was preserved.'
    }
  }

  $currentProcesses = Get-DreamSkinCodexProcesses -Codex $currentCodex
  $activeCodex = $currentCodex
  $cdpIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $currentCodex
  $savedIsDifferent = [bool]($null -ne $savedCodex -and
    -not (Test-DreamSkinPathEqual -Left $savedCodex.Executable -Right $currentCodex.Executable))
  if ($savedIsDifferent) {
    $savedProcesses = Get-DreamSkinCodexProcesses -Codex $savedCodex
    $savedOwnsPort = Test-DreamSkinCodexPortOwner -Port $Port -Codex $savedCodex
    if ($currentProcesses.Count -gt 0 -and ($savedProcesses.Count -gt 0 -or $savedOwnsPort)) {
      throw 'Multiple registered Codex package versions are active. Close them manually before starting Dream Skin.'
    }
    if ($savedProcesses.Count -gt 0 -or $savedOwnsPort) {
      if ($savedOwnsPort -and $savedProcesses.Count -eq 0) {
        throw 'The saved Codex listener is active but its process cannot be managed safely; state was preserved.'
      }
      $savedIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $savedCodex
      if ($null -ne $savedIdentity) {
        $codex = $savedCodex
        $activeCodex = $savedCodex
        $cdpIdentity = $savedIdentity
        Write-Warning 'Reapplying Dream Skin to the still-running registered Codex version; the current Store version will be used after that app exits.'
      } else {
        $activeCodex = $savedCodex
        $currentProcesses = $savedProcesses
      }
    }
  }
  $debugReady = $null -ne $cdpIdentity
  $codexProcesses = if (Test-DreamSkinPathEqual -Left $activeCodex.Executable -Right $currentCodex.Executable) {
    $currentProcesses
  } else {
    Get-DreamSkinCodexProcesses -Codex $activeCodex
  }
  if ($ExistingOnly -and -not $debugReady) { throw 'Apply requires an existing verified Xskin connection. Open Codex (Xskin) first.' }
  if (-not $ExistingOnly -and ($pauseWasSet -or (Read-XskinSettings -StateRoot $StateRoot).shortcutSkinEnabled -eq $false) -and -not $Resume) {
    $null = Start-DreamSkinCodex -Codex $codex
    Write-Host 'Xskin is paused or shortcut backgrounds are disabled. Official Codex was left open without applying a skin.'
    return
  }
  if (-not $debugReady -and $codexProcesses.Count -gt 0) {
    if (-not $NewLaunchPid) {
      throw 'Codex is already open without a verified Xskin connection. Fully exit Codex, then open Codex (Xskin). Your app was left running.'
    }
    $preflight = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @($Injector, '--check-payload', '--theme-dir', $themePaths.Active)
    if ($preflight.ExitCode -ne 0) { throw 'Automatic apply payload validation failed; Codex was left running.' }
    if (-not (Test-DreamSkinPortAvailable -Port $Port)) {
      if ($PortExplicit) { throw "Port $Port is occupied by an unverified listener." }
      $Port = Select-DreamSkinPort -PreferredPort $Port
    }
    if (-not (Stop-DreamSkinRecordedInjector -State $previousState)) { throw 'The saved injector could not be verified; Codex was left running.' }
    Stop-DreamSkinNewCodexLaunch -Codex $currentCodex -ProcessId $NewLaunchPid -StartedAt $NewLaunchStartedAt
    $automaticClosed = $true
    $codex = $currentCodex
  }
  if ($NewLaunchPid -and $debugReady) { return }
  if ($NewLaunchPid -and $codexProcesses.Count -eq 0) { throw 'The fresh Codex launch exited before automatic apply.' }
  if (-not $debugReady) {
    if (-not (Test-DreamSkinPortAvailable -Port $Port)) {
      if ($PortExplicit) { throw "Port $Port is occupied by an unverified listener." }
      $Port = Select-DreamSkinPort -PreferredPort $Port
    }
    $arguments = @('--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$Port")
    if ($ProfilePath) {
      New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null
      $arguments += "--user-data-dir=$ProfilePath"
    }
    $null = Start-DreamSkinCodex -Codex $codex -Arguments $arguments
  }
  $deadline = (Get-Date).AddSeconds(45)
  $cdpIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
  if ($ExistingOnly -and -not $cdpIdentity) { throw 'The existing Xskin connection closed before apply.' }
  while ($null -eq $cdpIdentity) {
    if ((Get-Date) -ge $deadline) {
      throw "Codex did not expose a verified loopback connection on port $Port. It was left running; fully exit it before retrying Codex (Xskin)."
    }
    Start-Sleep -Milliseconds 400
    $cdpIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
  }
  if (-not $Resume -and $previousState -and $previousState.browserId -ceq $cdpIdentity.BrowserId -and
    $previousState.port -eq $Port -and
    (Test-DreamSkinPathEqual -Left $previousState.injectorPath -Right $Injector) -and
    (Test-DreamSkinPathEqual -Left $previousState.themeDir -Right $themePaths.Active) -and
    (Stop-DreamSkinRecordedInjector -State $previousState -CheckOnly)) {
    if (-not $ExistingOnly) { $null = Start-DreamSkinCodex -Codex $codex }
    Write-Host 'Xskin is already active; reusing its injector.'
    return
  }

  $recordedInjectorStopped = Stop-DreamSkinRecordedInjector -State $previousState
  if (-not $recordedInjectorStopped) {
    $staleStatePath = Archive-DreamSkinStateFile -Path $StatePath
    Write-Warning "Archived stale Dream Skin state at $staleStatePath"
  }

  Set-DreamSkinPaused -Paused $false -StateRoot $StateRoot | Out-Null
  $pauseCleared = $true

  if ($ForegroundInjector) {
    try {
      Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
      Exit-DreamSkinOperationLock -Mutex $operationLock
      $operationLock = $null
      & $node.Path $Injector --watch --port $Port --browser-id $cdpIdentity.BrowserId `
        --theme-dir $themePaths.Active --pause-file $themePaths.PauseFile
      $foregroundExitCode = $LASTEXITCODE
      if ($foregroundExitCode -ne 0 -and $pauseWasSet) {
        Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
      }
      exit $foregroundExitCode
    } catch {
      if ($pauseWasSet) {
        try { Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null } catch {
          Write-Warning 'Foreground startup rollback could not restore the existing paused state.'
        }
      }
      throw
    }
  }

  $state = $null
  $daemon = $null
  try {
    if ($ExistingOnly) {
      $liveIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
      if (-not $liveIdentity -or $liveIdentity.BrowserId -cne $cdpIdentity.BrowserId) { throw 'The existing Xskin connection closed before apply.' }
    }
    $injectorArgs = @((ConvertTo-DreamSkinProcessArgument -Value $Injector), '--watch', '--port', "$Port",
      '--browser-id', $cdpIdentity.BrowserId, '--theme-dir',
      (ConvertTo-DreamSkinProcessArgument -Value $themePaths.Active), '--pause-file',
      (ConvertTo-DreamSkinProcessArgument -Value $themePaths.PauseFile))
    $daemon = Start-Process -FilePath $node.Path -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru `
      -WorkingDirectory $StateRoot `
      -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
    Start-Sleep -Milliseconds 500
    if ($daemon.HasExited) { throw "The injector exited during startup. See $StderrPath" }

    $injectorStartedAt = Get-DreamSkinProcessStartedAt -ProcessId $daemon.Id
    if (-not $injectorStartedAt) { throw 'The injector process identity could not be recorded safely.' }
    $mainProcesses = @(Get-DreamSkinCodexProcesses -Codex $codex | Where-Object {
      $_.CommandLine -and $_.CommandLine -notmatch '(?i)(?:^|[\s"])--type(?:[=\s"]|$)'
    })
    $mainPid = if ($mainProcesses.Count -eq 1) { $mainProcesses[0].ProcessId } else { $null }
    $state = [pscustomobject]@{
      schemaVersion = 3
      platform = 'windows'
      port = $Port
      injectorPid = $daemon.Id
      injectorStartedAt = $injectorStartedAt
      injectorPath = $Injector
      nodePath = $node.Path
      nodeVersion = $node.Version
      codexExe = $codex.Executable
      codexPackageRoot = $codex.PackageRoot
      codexPackageFullName = $codex.PackageFullName
      codexPackageFamilyName = $codex.PackageFamilyName
      codexVersion = $codex.Version
      codexPid = $mainPid
      codexStartedAt = if ($mainPid) { Get-DreamSkinProcessStartedAt -ProcessId $mainPid } else { $null }
      browserId = $cdpIdentity.BrowserId
      profilePath = $ProfilePath
      themeDir = $themePaths.Active
      pauseFile = $themePaths.PauseFile
      createdAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    Write-DreamSkinState -Path $StatePath -State $state

    if ($ExistingOnly) {
      $liveIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
      if (-not $liveIdentity -or $liveIdentity.BrowserId -cne $cdpIdentity.BrowserId) { throw 'The existing Xskin connection closed during apply.' }
    }
    $verify = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
      $Injector, '--verify', '--port', "$Port",
      '--theme-dir', $themePaths.Active,
      '--browser-id', $cdpIdentity.BrowserId, '--timeout-ms', '30000', '--prepare-first-frame')
    Write-DreamSkinUtf8FileAtomically -Path $VerifyPath -Content (($verify.Output -join "`r`n") + "`r`n")
    if ($verify.ExitCode -ne 0) { throw "Dream Skin verification failed. See $VerifyPath" }
  } catch {
    $startupError = $_
    $injectorStopped = $true
    if ($null -ne $state) {
      try {
        $injectorStopped = Stop-DreamSkinRecordedInjector -State $state
      } catch {
        $injectorStopped = $false
        Write-Warning $_.Exception.Message
      }
    } elseif ($null -ne $daemon -and -not $daemon.HasExited) {
      try {
        Stop-Process -InputObject $daemon -Force -ErrorAction Stop
        [void]$daemon.WaitForExit(5000)
        $injectorStopped = $daemon.HasExited
      } catch {
        $injectorStopped = $false
        Write-Warning 'The newly created injector could not be stopped during startup rollback.'
      }
    }
    if ($injectorStopped) {
      try {
        $rollbackIdentity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
        if ($null -ne $rollbackIdentity -and $rollbackIdentity.BrowserId -ceq $cdpIdentity.BrowserId) {
          $removal = Invoke-DreamSkinNative -FilePath $node.Path -ArgumentList @(
            $Injector, '--remove', '--port', "$Port",
            '--browser-id', $cdpIdentity.BrowserId, '--timeout-ms', '5000') -DiscardStderr
          if ($removal.ExitCode -ne 0) { throw 'Injector removal returned a failure status.' }
        }
      } catch {
        Write-Warning 'Startup rollback could not remove the partially applied live skin; reload or close Codex to clear it.'
      }
    }
    if ($injectorStopped) { Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue }
    if ($pauseWasSet -and $pauseCleared) {
      try {
        Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot | Out-Null
      } catch {
        Write-Warning 'Startup rollback could not restore the existing paused state.'
      }
    }
    throw $startupError
  }

  Write-Host "Codex Dream Skin is active on verified loopback port $Port."
} catch {
  $startupError = $_
  if ($automaticClosed) {
    try {
      if (@(Get-DreamSkinRegisteredCodexInstalls | Where-Object { (Get-DreamSkinCodexProcesses -Codex $_).Count -gt 0 }).Count -eq 0) {
        $null = Start-DreamSkinCodex -Codex $currentCodex
      }
    } catch { Write-Warning 'Automatic apply failed and the official app could not be reopened. Open Codex manually.' }
  }
  throw $startupError
} finally {
  if ($null -ne $operationLock) { Exit-DreamSkinOperationLock -Mutex $operationLock }
}
