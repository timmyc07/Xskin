function Get-DreamSkinAutostartShortcutPath {
  return Join-Path ([Environment]::GetFolderPath('Startup')) 'Xskin Codex backgrounds.lnk'
}

function Get-DreamSkinAutostartArguments {
  param([string]$StateRoot)
  return ConvertTo-DreamSkinArgumentLine -Arguments @('-NoProfile', '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $StateRoot 'engine\scripts\watch-codex-launches.ps1'),
    '-StateRoot', $StateRoot)
}

function Get-DreamSkinAutostartProcess {
  param([string]$StateRoot, [switch]$Strict)
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
  $shortcut = Get-DreamSkinAutostartShortcutPath
  Assert-DreamSkinNoReparseComponents -Path $shortcut
  $exists = Test-Path -LiteralPath $shortcut
  $owned = $false
  if ($exists) {
    $link = Get-DreamSkinShortcut -Path $shortcut
    $owned = $link.Description -ceq 'Xskin official Codex launch monitor' -and
      (Test-DreamSkinPathEqual -Left $link.TargetPath -Right (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')) -and
      $link.Arguments -ceq (Get-DreamSkinAutostartArguments -StateRoot $StateRoot)
  }
  return [pscustomobject]@{
    Enabled = $owned; Foreign = $exists -and -not $owned
    Loaded = $owned -and $null -ne (Get-DreamSkinAutostartProcess -StateRoot $StateRoot)
  }
}

function Stop-DreamSkinAutostart {
  param([string]$StateRoot)
  $process = Get-DreamSkinAutostartProcess -StateRoot $StateRoot -Strict
  if ($process) {
    Stop-Process -InputObject $process -Force -ErrorAction Stop
    if (-not $process.WaitForExit(5000)) { throw 'The automatic-startup monitor did not stop.' }
  }
}

function Start-DreamSkinAutostart {
  param([string]$StateRoot)
  if (Get-DreamSkinAutostartProcess -StateRoot $StateRoot -Strict) { return }
  $shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $process = Start-Process -FilePath $shell -ArgumentList (Get-DreamSkinAutostartArguments -StateRoot $StateRoot) `
    -WorkingDirectory $StateRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $StateRoot 'autostart.log') `
    -RedirectStandardError (Join-Path $StateRoot 'autostart-error.log')
  try {
    $deadline = [datetime]::UtcNow.AddSeconds(15)
    do {
      if ($process.HasExited) { throw 'The automatic-startup monitor exited. See autostart-error.log.' }
      $ready = Get-DreamSkinAutostartProcess -StateRoot $StateRoot
      if ($ready -and $ready.Id -eq $process.Id) { return }
      Start-Sleep -Milliseconds 100
    } while ([datetime]::UtcNow -lt $deadline)
    throw 'The automatic-startup monitor did not become ready.'
  } catch {
    if (-not $process.HasExited) { Stop-Process -InputObject $process -Force }
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
  param([object]$Codex, [int]$ProcessId, [string]$StartedAt)
  if (-not (Test-DreamSkinNewCodexLaunch @PSBoundParameters)) { throw 'The newly launched Codex identity or launch age changed; automatic restart was skipped.' }
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
      & (Join-Path $StateRoot 'engine\scripts\start-dream-skin.ps1') -NewLaunchPid $process.Id -NewLaunchStartedAt $startedAt
    } catch {
      if ($key) { $Context.Seen[$key] = $true }
      Write-Warning "Automatic apply failed; this launch will not be retried: $($_.Exception.Message)"
    }
  }
  foreach ($key in @($Context.Seen.Keys)) { if (-not $live.ContainsKey($key)) { $Context.Seen.Remove($key) } }
}
