function Get-DreamSkinAutostartShortcutPath {
  return Join-Path ([Environment]::GetFolderPath('Startup')) 'Xskin Codex backgrounds.lnk'
}

function Get-DreamSkinAutostartArguments {
  param([string]$StateRoot, [switch]$EventTrigger)
  if ($EventTrigger) {
    return ConvertTo-DreamSkinArgumentLine -Arguments @('watch','-StateRoot',$StateRoot,'-LaunchPid','$(LaunchPid)','-EventTime','$(EventTime)')
  }
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

function Get-DreamSkinLaunchSubscription {
  return '<QueryList><Query Id="0" Path="Microsoft-Windows-AppModel-Runtime/Admin"><Select Path="Microsoft-Windows-AppModel-Runtime/Admin">*[System[EventID=201] and EventData[Data[@Name="ApplicationName"]="OpenAI.Codex_2p2nqsd0c76g0!App" and Data[@Name="ImageName"]="ChatGPT.exe"]]</Select></Query></QueryList>'
}

function Test-DreamSkinAutostartTask {
  param([AllowNull()][object]$Task, [string]$StateRoot)
  if (-not $Task -or -not $StateRoot) { return $false }
  $definition = $Task.Definition
  if ($definition.Triggers.Count -ne 1) { return $false }
  $trigger = $definition.Triggers.Item(1)
  $eventTrigger = $trigger.Type -eq 0
  if ($eventTrigger) {
    if ($trigger.Subscription -cne (Get-DreamSkinLaunchSubscription) -or $trigger.ValueQueries.Count -ne 2) { return $false }
    $queries = @{}
    foreach ($pair in $trigger.ValueQueries) { $queries[$pair.Name] = $pair.Value }
    if ($queries.LaunchPid -cne "Event/EventData/Data[@Name='ProcessID']" -or
      $queries.EventTime -cne 'Event/System/TimeCreated/@SystemTime') { return $false }
  } elseif ($trigger.Type -ne 9 -or -not (Test-DreamSkinAutostartUser -Identity $trigger.UserId)) { return $false }
  return $definition.RegistrationInfo.Description -ceq 'Xskin official Codex launch monitor' -and
    (Test-DreamSkinAutostartUser -Identity $definition.Principal.UserId) -and $definition.Principal.LogonType -eq 3 -and
    $definition.Principal.RunLevel -eq 0 -and $definition.Actions.Count -eq 1 -and
    $definition.Actions.Item(1).Type -eq 0 -and
    (Test-DreamSkinPathEqual -Left $definition.Actions.Item(1).Path -Right (Join-Path $StateRoot 'engine\scripts\xskin-quiet.exe')) -and
    $definition.Actions.Item(1).Arguments -ceq (Get-DreamSkinAutostartArguments -StateRoot $StateRoot -EventTrigger:$eventTrigger) -and
    (Test-DreamSkinPathEqual -Left $definition.Actions.Item(1).WorkingDirectory -Right $StateRoot)
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
  $trigger = $definition.Triggers.Create(0)
  $trigger.Subscription = Get-DreamSkinLaunchSubscription
  $null = $trigger.ValueQueries.Create('LaunchPid', "Event/EventData/Data[@Name='ProcessID']")
  $null = $trigger.ValueQueries.Create('EventTime', 'Event/System/TimeCreated/@SystemTime')
  $action = $definition.Actions.Create(0)
  $action.Path = Get-DreamSkinQuietLauncher -StateRoot $StateRoot
  $action.Arguments = Get-DreamSkinAutostartArguments -StateRoot $StateRoot -EventTrigger
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
  $task = Get-DreamSkinAutostartTask
  if (-not (Test-DreamSkinAutostartTask -Task $task -StateRoot $StateRoot) -or -not $task.Enabled) {
    throw 'The Xskin task is disabled or its identity does not match.'
  }
  $null = Get-DreamSkinQuietLauncher -StateRoot $StateRoot
  if ($task.Definition.Triggers.Item(1).Type -eq 0) {
    if (-not $task.Definition.Triggers.Item(1).Enabled) { throw 'The Xskin event trigger is disabled.' }
    return
  }
  # A failed engine swap may have restored the pre-event runtime and its login task.
  $version = [version](Read-DreamSkinUtf8File -Path (Join-Path $StateRoot 'engine/VERSION')).Trim()
  if ($version -ge [version]'1.9.18') {
    Register-DreamSkinAutostartTask -StateRoot $StateRoot
  } else {
    Write-DreamSkinState -Path (Join-Path $StateRoot 'autostart.json') -State @{ preserveExistingBefore = [datetimeoffset]::UtcNow.ToString('o') }
    $null = $task.Run($null)
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
  if ($age -lt 0 -or $age -ge 60) { return $false }
  $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  if (-not $info -or -not $info.CommandLine) { return $null }
  return [bool](
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

function Invoke-DreamSkinLaunchEvent {
  param([int]$LaunchPid, [datetimeoffset]$EventTime, [string]$StateRoot)
  $age = ([datetimeoffset]::UtcNow - $EventTime).TotalSeconds
  if ($LaunchPid -le 0 -or $age -lt -2 -or $age -ge 60 -or
    -not (Test-DreamSkinAutostartEnabled -StateRoot $StateRoot) -or
    (Test-DreamSkinPaused -StateRoot $StateRoot) -or
    (Read-XskinSettings -StateRoot $StateRoot).shortcutSkinEnabled -eq $false) { return }
  $process = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object Id -eq $LaunchPid
  if (-not $process -or -not $process.StartTime) { return }
  $startedAt = $process.StartTime.ToUniversalTime()
  if ($startedAt -gt $EventTime.UtcDateTime.AddSeconds(2)) { return }
  $codex = Get-DreamSkinCodexInstall
  do {
    $fresh = Test-DreamSkinNewCodexLaunch -Codex $codex -ProcessId $LaunchPid -StartedAt $startedAt.ToString('o')
    if ($fresh -eq $false -or $process.HasExited) { return }
    $process.Refresh()
    if ($fresh -and $process.MainWindowHandle -ne [IntPtr]::Zero) {
      & (Join-Path $StateRoot 'engine/scripts/start-dream-skin.ps1') -NewLaunchPid $LaunchPid -NewLaunchStartedAt $startedAt.ToString('o') -StateRoot $StateRoot
      return
    }
    Start-Sleep -Milliseconds 200
  } while (([datetimeoffset]::UtcNow - $EventTime).TotalSeconds -lt 60)
}

function Test-DreamSkinAutostartEnabled {
  param([string]$StateRoot)
  $task = Get-DreamSkinAutostartTask
  return $null -ne $task -and $task.Enabled -and (Test-DreamSkinAutostartTask -Task $task -StateRoot $StateRoot)
}

function Get-DreamSkinAutostart {
  param([string]$StateRoot)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  $task = Get-DreamSkinAutostartTask
  $owned = Test-DreamSkinAutostartTask -Task $task -StateRoot $StateRoot
  return [pscustomobject]@{
    Enabled = $owned -and $task.Enabled; Foreign = $null -ne $task -and -not $owned
    Loaded = $owned -and $task.Enabled -and $task.Definition.Triggers.Item(1).Type -eq 0 -and $task.Definition.Triggers.Item(1).Enabled
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
    if ($task.Definition.Triggers.Item(1).Type -eq 0 -and $task.State -in @(2, 4)) { $task.Stop(0) }
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
