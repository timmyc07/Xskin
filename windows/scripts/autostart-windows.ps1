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
  if ($info -and
    (Test-DreamSkinPathEqual -Left (Get-DreamSkinProcessExecutablePath -ProcessInfo $info) -Right $expectedShell) -and
    (Test-DreamSkinCommandLineToken -CommandLine $info.CommandLine -Token (Join-Path $StateRoot 'engine\scripts\watch-codex-launches.ps1')) -and
    (Test-DreamSkinCommandLineToken -CommandLine $info.CommandLine -Token $StateRoot)) { return $process }
  if ($Strict) { throw 'The automatic-startup process identity does not match; state was preserved.' }
  return $null
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
}

function Start-DreamSkinAutostart {
  param([string]$StateRoot)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  if (Get-DreamSkinAutostartProcess -StateRoot $StateRoot -Strict) { return }
  $startup = Get-DreamSkinAutostart -StateRoot $StateRoot
  if (-not $startup.Enabled -or $startup.Foreign) { throw 'The Xskin login task is not enabled or its identity does not match.' }
  $null = Get-DreamSkinQuietLauncher -StateRoot $StateRoot
  $task = Get-DreamSkinAutostartTask
  $running = $task.Run($null)
  try {
    $deadline = [datetime]::UtcNow.AddSeconds(15)
    do {
      $ready = Get-DreamSkinAutostartProcess -StateRoot $StateRoot
      if ($ready) { return }
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
    Stop-DreamSkinAutostart -StateRoot $StateRoot
    try { $running.Stop() } catch { } # A failed monitor can already have exited.
    throw
  }
}

function Test-DreamSkinNewCodexLaunch {
  param([object]$Codex, [int]$ProcessId, [string]$StartedAt)
  if (-not $StartedAt) { return $false }
  $age = ([datetimeoffset]::UtcNow - [datetimeoffset]$StartedAt).TotalSeconds
  if ($age -lt 0 -or $age -gt 15) { return $false }
  $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  return [bool]($info -and $info.CommandLine -and
    $info.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId -and
    $info.CommandLine -notmatch '(?i)(?:^|[\s"])--(?:type|remote-debugging-[\w-]+)(?:[=\s"]|$)' -and
    (Test-DreamSkinPathEqual -Left (Get-DreamSkinProcessExecutablePath -ProcessInfo $info) -Right $Codex.Executable) -and
    (Get-DreamSkinProcessStartedAt -ProcessId $ProcessId) -ceq $StartedAt)
}

function Stop-DreamSkinNewCodexLaunch {
  param([object]$Codex, [int]$ProcessId, [string]$StartedAt, [ref]$QuitRequested)
  if (-not (Test-DreamSkinNewCodexLaunch -Codex $Codex -ProcessId $ProcessId -StartedAt $StartedAt)) { throw 'The newly launched Codex identity or launch age changed; automatic restart was skipped.' }
  $mainProcesses = @(Get-DreamSkinCodexProcesses -Codex $Codex | Where-Object {
    $_.CommandLine -notmatch '(?i)(?:^|[\s"])--type(?:[=\s"]|$)'
  })
  if ($mainProcesses.Count -ne 1 -or $mainProcesses[0].ProcessId -ne $ProcessId) {
    throw 'Automatic restart requires exactly one newly launched Codex main process.'
  }
  $process = Get-Process -Id $ProcessId -ErrorAction Stop
  if ($process.StartTime.ToUniversalTime().ToString('o') -cne $StartedAt -or
    -not (Test-DreamSkinPathEqual -Left $process.Path -Right $Codex.Executable)) {
    throw 'The Codex process changed before automatic restart.'
  }
  if ($QuitRequested) { $QuitRequested.Value = $true }
  Request-DreamSkinCodexQuit -Process $process
  if (-not $process.WaitForExit(15000)) { throw 'Codex did not close; automatic restart will not force it.' }
  $deadline = [datetime]::UtcNow.AddSeconds(5)
  while ((Get-DreamSkinCodexProcesses -Codex $Codex).Count -gt 0) {
    if ([datetime]::UtcNow -ge $deadline) { throw 'Codex still has running processes; automatic restart was skipped.' }
    Start-Sleep -Milliseconds 100
  }
}

function Invoke-DreamSkinAutostartStep {
  param([object[]]$Candidates, [hashtable]$Context, [string]$StateRoot)
  $live = @{}
  foreach ($process in $Candidates) {
    $key = $null
    $handoffStarted = $false
    try {
      $startedAt = $process.StartTime.ToUniversalTime().ToString('o')
      $key = "$($process.Id):$startedAt"
      $live[$key] = $true
      if ($Context.Seen.ContainsKey($key)) { continue }
      $age = ([datetimeoffset]::UtcNow - [datetimeoffset]$startedAt).TotalSeconds
      if ($age -lt 0 -or $age -gt 15 -or (Test-DreamSkinPaused -StateRoot $StateRoot)) {
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
      if (([datetimeoffset]::UtcNow - $Context.LastHandoff).TotalSeconds -lt 30) { continue }
      $Context.LastHandoff = [datetimeoffset]::UtcNow
      $Context.State.lastHandoff = $Context.LastHandoff.ToString('o')
      Write-DreamSkinState -Path (Join-Path $StateRoot 'autostart.json') -State $Context.State
      $handoffStarted = $true
      & (Join-Path $StateRoot 'engine\scripts\start-dream-skin.ps1') -NewLaunchPid $process.Id -NewLaunchStartedAt $startedAt -StateRoot $StateRoot
    } catch {
      $failureMessage = $_.Exception.Message
      if ($key) { $Context.Seen[$key] = $true }
      try {
        if ($handoffStarted -and @(Get-DreamSkinCodexProcesses -Codex $codex | Where-Object {
          $_.CommandLine -and $_.CommandLine -notmatch '(?i)(?:^|[\s"])--type(?:[=\s"]|$)'
        }).Count -eq 0) {
          $Context.LastHandoff = [datetimeoffset]::MinValue
          $Context.State.lastHandoff = $Context.LastHandoff.ToString('o')
          Write-DreamSkinState -Path (Join-Path $StateRoot 'autostart.json') -State $Context.State
        }
        $failurePath = Join-Path $StateRoot 'autostart-error.log'
        Assert-DreamSkinNoReparseComponents -Path $failurePath
        $diagnostic = [datetimeoffset]::UtcNow.ToString('o') + " Automatic apply failed ($key): " + $failureMessage
        Write-DreamSkinUtf8FileAtomically -Path $failurePath -Content ($diagnostic.Substring(0, [Math]::Min(4096, $diagnostic.Length)) + "`r`n")
      } catch { Write-Warning 'Could not save the automatic-apply failure diagnostic.' }
      Write-Warning "Automatic apply failed; this launch will not be retried: $failureMessage"
    }
  }
  foreach ($key in @($Context.Seen.Keys)) { if (-not $live.ContainsKey($key)) { $Context.Seen.Remove($key) } }
}
