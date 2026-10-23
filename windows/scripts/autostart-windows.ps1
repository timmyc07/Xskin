function Get-DreamSkinAutostartShortcutPath {
  return Join-Path ([Environment]::GetFolderPath('Startup')) 'Xskin Codex backgrounds.lnk'
}

function Get-DreamSkinAutostartArguments {
  param([string]$StateRoot)
  return ConvertTo-DreamSkinArgumentLine -Arguments @('watch', '-StateRoot', $StateRoot)
}

function Get-DreamSkinAutostartTaskName {
  return 'Xskin-Codex-backgrounds-' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
}

function Test-DreamSkinAutostartUser {
  param([string]$Identity)
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($Identity -ceq $sid) { return $true }
  try { return ([Security.Principal.NTAccount]$Identity).Translate([Security.Principal.SecurityIdentifier]).Value -ceq $sid }
  catch { return $false }
}

function Test-DreamSkinAutostartTask {
  param([AllowNull()][object]$Task, [string]$StateRoot)
  if (-not $Task -or -not $StateRoot) { return $false }
  $definition = $Task.Definition
  return $definition.RegistrationInfo.Description -ceq 'Xskin official Codex launch monitor' -and
    (Test-DreamSkinAutostartUser -Identity $definition.Principal.UserId) -and $definition.Principal.LogonType -eq 3 -and
    $definition.Principal.RunLevel -eq 0 -and $definition.Actions.Count -eq 1 -and
    $definition.Actions.Item(1).Type -eq 0 -and
    (Test-DreamSkinPathEqual -Left $definition.Actions.Item(1).Path -Right (Join-Path $StateRoot 'engine\scripts\xskin-quiet.exe')) -and
    $definition.Actions.Item(1).Arguments -ceq (Get-DreamSkinAutostartArguments -StateRoot $StateRoot) -and
    (Test-DreamSkinPathEqual -Left $definition.Actions.Item(1).WorkingDirectory -Right $StateRoot) -and
    $definition.Triggers.Count -eq 1 -and $definition.Triggers.Item(1).Type -eq 9 -and
    (Test-DreamSkinAutostartUser -Identity $definition.Triggers.Item(1).UserId)
}

function Get-DreamSkinAutostartTaskFolder {
  $scheduler = New-Object -ComObject Schedule.Service
  $scheduler.Connect()
  return $scheduler.GetFolder('\')
}

function Get-DreamSkinAutostartTask {
  try { return (Get-DreamSkinAutostartTaskFolder).GetTask((Get-DreamSkinAutostartTaskName)) }
  catch {
    if ($_.Exception.GetBaseException().HResult -eq -2147024894) { return $null }
    throw
  }
}

function Register-DreamSkinAutostartTask {
  param([string]$StateRoot)
  $scheduler = New-Object -ComObject Schedule.Service
  $scheduler.Connect()
  $definition = $scheduler.NewTask(0)
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $definition.RegistrationInfo.Description = 'Xskin official Codex launch monitor'
  $definition.Principal.UserId = $sid
  $definition.Principal.LogonType = 3
  $definition.Principal.RunLevel = 0
  $definition.Settings.Enabled = $true
  $definition.Settings.Hidden = $true
  $definition.Settings.DisallowStartIfOnBatteries = $false
  $definition.Settings.StopIfGoingOnBatteries = $false
  $definition.Settings.ExecutionTimeLimit = 'PT0S'
  $definition.Settings.MultipleInstances = 2
  $definition.Settings.RestartCount = 999
  $definition.Settings.RestartInterval = 'PT1M'
  $trigger = $definition.Triggers.Create(9)
  $trigger.UserId = $sid
  $action = $definition.Actions.Create(0)
  $action.Path = Get-DreamSkinQuietLauncher -StateRoot $StateRoot
  $action.Arguments = Get-DreamSkinAutostartArguments -StateRoot $StateRoot
  $action.WorkingDirectory = $StateRoot
  $null = $scheduler.GetFolder('\').RegisterTaskDefinition((Get-DreamSkinAutostartTaskName), $definition, 6, $sid, $null, 3)
}

function Get-DreamSkinAutostartProcess {
  param([string]$StateRoot, [switch]$Strict)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  Assert-DreamSkinNoReparseComponents -Path (Join-Path $StateRoot 'autostart.json')
  $state = Read-DreamSkinState -Path (Join-Path $StateRoot 'autostart.json')
  if (-not $state -or -not $state.processId) { return $null }
  $process = Get-Process -Id ([int]$state.processId) -ErrorAction SilentlyContinue
  if (-not $process -or $process.HasExited) { return $null }
  if (-not $state.startedAt -or [datetimeoffset]$process.StartTime.ToUniversalTime() -ne [datetimeoffset]$state.startedAt) { return $null }
  $info = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$state.processId)" -ErrorAction Stop
  $expectedShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  if ($info -and $info.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId -and
    (Test-DreamSkinPathEqual -Left (Get-DreamSkinProcessExecutablePath -ProcessInfo $info) -Right $expectedShell) -and
    (Test-DreamSkinCommandLineToken -CommandLine $info.CommandLine -Token (Join-Path $StateRoot 'engine\scripts\watch-codex-launches.ps1')) -and
    (Test-DreamSkinCommandLineToken -CommandLine $info.CommandLine -Token $StateRoot)) { return $process }
  # CIM can lose identity fields just before the disabled monitor signals exit.
  if ($process.HasExited -or $process.WaitForExit(250)) { return $null }
  if ($Strict) { throw 'The automatic-startup process identity does not match; state was preserved.' }
  return $null
}

function Start-DreamSkinAutostart {
  param([string]$StateRoot)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  if (Get-DreamSkinAutostartProcess -StateRoot $StateRoot -Strict) { return }
  $startup = Get-DreamSkinAutostart -StateRoot $StateRoot
  if (-not $startup.Enabled -or $startup.Foreign) { throw 'The Xskin login task is disabled or its identity does not match.' }
  $null = Get-DreamSkinQuietLauncher -StateRoot $StateRoot
  $task = Get-DreamSkinAutostartTask
  $running = $task.Run($null)
  try {
    $deadline = [datetime]::UtcNow.AddSeconds(15)
    do {
      if (Get-DreamSkinAutostartProcess -StateRoot $StateRoot) { return }
      try { $running.Refresh() } catch {
        if ($_.Exception.GetBaseException().HResult -eq -2147216629) {
          throw "The automatic-startup monitor exited (task result $($task.LastTaskResult))."
        }
        throw
      }
      if ($running.State -notin @(2, 4) -and $task.State -notin @(2, 4)) { throw "The automatic-startup monitor exited (task result $($task.LastTaskResult))." }
      Start-Sleep -Milliseconds 100
    } while ([datetime]::UtcNow -lt $deadline)
    throw 'The automatic-startup monitor did not become ready.'
  } catch {
    try { $running.Stop() } catch { }
    throw
  }
}

function Enable-DreamSkinAutostart {
  param([string]$StateRoot)
  $startup = Get-DreamSkinAutostart -StateRoot $StateRoot
  if ($startup.Foreign) { throw 'Refusing to replace an unrelated automatic-startup task.' }
  $previous = Get-DreamSkinAutostartTask
  $previousXml = if ($previous) { $previous.Xml }
  $previousEnabled = $previous -and $previous.Enabled
  Disable-DreamSkinAutostart -StateRoot $StateRoot
  try {
    Register-DreamSkinAutostartTask -StateRoot $StateRoot
    Start-DreamSkinAutostart -StateRoot $StateRoot
  } catch {
    $enableError = $_
    if ($previousXml) {
      Disable-DreamSkinAutostart -StateRoot $StateRoot
      $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $restored = (Get-DreamSkinAutostartTaskFolder).RegisterTask((Get-DreamSkinAutostartTaskName), $previousXml, 6, $sid, $null, 3)
      $restored.Enabled = $previousEnabled
      if ($previousEnabled) { Start-DreamSkinAutostart -StateRoot $StateRoot }
    }
    throw $enableError
  }
}

function Disable-DreamSkinAutostart {
  param([string]$StateRoot)
  $task = Get-DreamSkinAutostartTask
  if ($task -and -not (Test-DreamSkinAutostartTask -Task $task -StateRoot $StateRoot)) {
    throw 'Refusing to change an unrelated automatic-startup task.'
  }
  if ($task) { $task.Enabled = $false }
  Stop-DreamSkinAutostart -StateRoot $StateRoot
  if ($task) { (Get-DreamSkinAutostartTaskFolder).DeleteTask((Get-DreamSkinAutostartTaskName), 0) }
  Remove-DreamSkinLegacyStartupShortcut -StateRoot $StateRoot
}

function Test-DreamSkinNewCodexLaunch {
  param([object]$Codex, [int]$ProcessId, [string]$StartedAt)
  if (-not $StartedAt) { return $false }
  $age = ([datetimeoffset]::UtcNow - [datetimeoffset]$StartedAt).TotalSeconds
  if ($age -lt 0 -or $age -ge 15) { return $false }
  $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  return [bool]($info -and $info.CommandLine -and
    $info.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId -and
    $info.CommandLine -notmatch '(?i)(?:^|[\s"])--(?:type|remote-debugging-[\w-]+)(?:[=\s"]|$)' -and
    (Test-DreamSkinPathEqual -Left (Get-DreamSkinProcessExecutablePath -ProcessInfo $info) -Right $Codex.Executable) -and
    (Get-DreamSkinProcessStartedAt -ProcessId $ProcessId) -ceq $StartedAt)
}

function Stop-DreamSkinNewCodexLaunch {
  param([object]$Codex, [int]$ProcessId, [string]$StartedAt)
  if (-not (Test-DreamSkinNewCodexLaunch -Codex $Codex -ProcessId $ProcessId -StartedAt $StartedAt)) {
    throw 'The fresh Codex process identity changed; automatic apply was skipped.'
  }
  $mainProcesses = @(Get-DreamSkinCodexProcesses -Codex $Codex | Where-Object {
    $_.CommandLine -and $_.CommandLine -notmatch '(?i)(?:^|[\s"])--type(?:[=\s"]|$)'
  })
  if ($mainProcesses.Count -ne 1 -or $mainProcesses[0].ProcessId -ne $ProcessId) {
    throw 'Automatic apply requires exactly one fresh official Codex main process.'
  }
  $process = Get-Process -Id $ProcessId -ErrorAction Stop
  if ($process.StartTime.ToUniversalTime().ToString('o') -cne $StartedAt -or
    -not (Test-DreamSkinPathEqual -Left $process.Path -Right $Codex.Executable)) {
    throw 'The Codex process changed before automatic apply.'
  }
  Request-DreamSkinCodexQuit -Process $process
  if (-not $process.WaitForExit(15000)) { throw 'Codex did not close; automatic apply will not force it.' }
  $deadline = [datetime]::UtcNow.AddSeconds(5)
  while ((Get-DreamSkinCodexProcesses -Codex $Codex).Count -gt 0) {
    if ([datetime]::UtcNow -ge $deadline) { throw 'Codex still has running processes; automatic apply was stopped.' }
    Start-Sleep -Milliseconds 100
  }
}

function Invoke-DreamSkinAutostartStep {
  param([object[]]$Candidates, [hashtable]$Context, [string]$StateRoot)
  $live = @{}
  foreach ($process in $Candidates) {
    $key = $null
    try {
      $startedAt = $process.StartTime.ToUniversalTime().ToString('o')
      $key = "$($process.Id):$startedAt"
      $live[$key] = $true
      if ($Context.Seen.ContainsKey($key)) { continue }
      if ((Test-DreamSkinPaused -StateRoot $StateRoot) -or
        (Read-XskinSettings -StateRoot $StateRoot).shortcutSkinEnabled -eq $false) {
        $Context.Seen[$key] = $true
        continue
      }
      $codex = Get-DreamSkinCodexInstall
      if (-not (Test-DreamSkinNewCodexLaunch -Codex $codex -ProcessId $process.Id -StartedAt $startedAt)) {
        $Context.Seen[$key] = $true
        continue
      }
      if ($process.MainWindowHandle -eq [IntPtr]::Zero) { continue }
      $Context.Seen[$key] = $true
      try {
        & (Join-Path $StateRoot 'engine\scripts\start-dream-skin.ps1') -NewLaunchPid $process.Id -NewLaunchStartedAt $startedAt -StateRoot $StateRoot
      } finally {
        # Consume managed and ordinary recovery launches even if applying failed.
        foreach ($relaunch in @(Get-DreamSkinCodexProcesses -Codex $codex)) {
          $relaunchStart = Get-DreamSkinProcessStartedAt -ProcessId $relaunch.ProcessId
          if ($relaunchStart) {
            $relaunchKey = "$($relaunch.ProcessId):$relaunchStart"
            $Context.Seen[$relaunchKey] = $true
            $live[$relaunchKey] = $true
          }
        }
      }
    } catch {
      if ($key) { $Context.Seen[$key] = $true }
      $diagnostic = [datetimeoffset]::UtcNow.ToString('o') + " Automatic apply failed ($key): " + $_.Exception.Message
      Write-Warning $diagnostic
      try {
        $failurePath = Join-Path $StateRoot 'autostart-error.log'
        Assert-DreamSkinNoReparseComponents -Path $failurePath
        Write-DreamSkinUtf8FileAtomically -Path $failurePath -Content ($diagnostic.Substring(0, [Math]::Min(4096, $diagnostic.Length)) + "`r`n")
      } catch { Write-Warning 'Could not save the automatic-apply diagnostic.' }
    }
  }
  foreach ($key in @($Context.Seen.Keys)) { if (-not $live.ContainsKey($key)) { $Context.Seen.Remove($key) } }
  $state = Read-DreamSkinState -Path (Join-Path $StateRoot 'state.json')
  if ($state -and $state.codexPid -and $state.codexStartedAt) {
    $currentStart = Get-DreamSkinProcessStartedAt -ProcessId ([int]$state.codexPid)
    if ($currentStart -cne $state.codexStartedAt) { $null = Stop-DreamSkinRecordedInjector -State $state }
  }
}

function Get-DreamSkinAutostart {
  param([string]$StateRoot)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  $task = Get-DreamSkinAutostartTask
  $owned = Test-DreamSkinAutostartTask -Task $task -StateRoot $StateRoot
  return [pscustomobject]@{
    Enabled = $owned -and $task.Enabled; Foreign = $null -ne $task -and -not $owned
    Loaded = $owned -and $task.Enabled -and $null -ne (Get-DreamSkinAutostartProcess -StateRoot $StateRoot)
  }
}

function Stop-DreamSkinAutostart {
  param([string]$StateRoot)
  $process = Get-DreamSkinAutostartProcess -StateRoot $StateRoot -Strict
  if ($process) {
    Stop-Process -InputObject $process -Force -ErrorAction Stop
    if (-not $process.WaitForExit(5000)) { throw 'The automatic-startup monitor did not stop.' }
  }
  $startup = Get-DreamSkinAutostart -StateRoot $StateRoot
  $task = Get-DreamSkinAutostartTask
  if ($task -and -not $startup.Foreign) {
    $deadline = [datetime]::UtcNow.AddSeconds(5)
    while ($task.State -in @(2, 4)) {
      if ([datetime]::UtcNow -ge $deadline) { throw 'The quiet automatic-startup host did not stop.' }
      Start-Sleep -Milliseconds 50
    }
  }
}

function Remove-DreamSkinLegacyStartupShortcut {
  param([string]$StateRoot)
  $path = Get-DreamSkinAutostartShortcutPath
  Assert-DreamSkinNoReparseComponents -Path $path
  if (Test-Path -LiteralPath $path) {
    $link = Get-DreamSkinShortcut -Path $path
    $arguments = ConvertTo-DreamSkinArgumentLine -Arguments @('-NoProfile', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $StateRoot 'engine\scripts\watch-codex-launches.ps1'), '-StateRoot', $StateRoot)
    if ($link.Description -ceq 'Xskin official Codex launch monitor' -and
      (Test-DreamSkinPathEqual -Left $link.TargetPath -Right (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')) -and
      (Test-DreamSkinPathEqual -Left $link.WorkingDirectory -Right $StateRoot) -and $link.Arguments -ceq $arguments) {
      Remove-Item -LiteralPath $path -Force
    }
  }
}
