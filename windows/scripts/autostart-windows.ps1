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

function Remove-DreamSkinLegacyAutostart {
  param([string]$StateRoot)
  $task = Get-DreamSkinAutostartTask
  if ($task -and (Test-DreamSkinAutostartTask -Task $task -StateRoot $StateRoot)) {
    $task.Enabled = $false
  }
  # Old quiet hosts wait on inherited pipes: stop the verified injector before their PowerShell.
  if (Get-DreamSkinAutostartProcess -StateRoot $StateRoot -Strict) {
    $state = Read-DreamSkinState -Path (Join-Path $StateRoot 'state.json')
    if (-not (Stop-DreamSkinRecordedInjector -State $state)) { throw 'The saved injector could not be verified; migration stopped.' }
    Stop-DreamSkinAutostart -StateRoot $StateRoot
  }
  if ($task -and (Test-DreamSkinAutostartTask -Task $task -StateRoot $StateRoot)) {
    (Get-DreamSkinAutostartTaskFolder).DeleteTask((Get-DreamSkinAutostartTaskName), 0)
  }
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
