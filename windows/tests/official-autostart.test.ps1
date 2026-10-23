$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-official-start-' + [guid]::NewGuid().ToString('N'))
$stateRoot = Join-Path $temporary 'state 中文 🌙'
New-Item -ItemType Directory -Path (Join-Path $stateRoot 'engine\scripts') -Force | Out-Null
try {
  $codex = @{ Executable = 'C:\Store\Official\ChatGPT.exe' }
  $startedAt = [datetime]::UtcNow.ToString('o')
  $currentStart = $startedAt
  $info = [pscustomobject]@{ ProcessId = 101; ExecutablePath = $codex.Executable; CommandLine = '"C:\Store\Official\ChatGPT.exe"'; SessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId }
  function Get-CimInstance { return $info }
  function Get-DreamSkinProcessStartedAt { return $currentStart }
  function Get-DreamSkinCodexInstall { return $codex }
  $identity = @{ Codex = $codex; ProcessId = 101; StartedAt = $startedAt }
  if (-not (Test-DreamSkinNewCodexLaunch @identity)) { throw 'Fresh official identity was rejected.' }
  foreach ($suffix in @(' --type=renderer', ' "--type=utility"', ' --remote-debugging-port=9335', ' --remote-debugging-pipe')) {
    $info.CommandLine += $suffix
    if (Test-DreamSkinNewCodexLaunch @identity) { throw 'Child/debug launch was accepted.' }
    $info.CommandLine = '"C:\Store\Official\ChatGPT.exe"'
  }
  $info.ExecutablePath = 'C:\Unrelated\ChatGPT.exe'
  if (Test-DreamSkinNewCodexLaunch @identity) { throw 'Foreign executable was accepted.' }
  $info.ExecutablePath = $codex.Executable
  $info.SessionId++
  if (Test-DreamSkinNewCodexLaunch @identity) { throw 'Another user session was accepted.' }
  $info.SessionId--
  $currentStart = [datetime]::UtcNow.AddMinutes(-1).ToString('o')
  if (Test-DreamSkinNewCodexLaunch @identity) { throw 'Reused PID was accepted.' }
  if (Test-DreamSkinNewCodexLaunch -Codex $codex -ProcessId 101 -StartedAt $currentStart) { throw 'Old session was accepted.' }
  $currentStart = $startedAt

  $fake = [pscustomobject]@{ Id = 101; StartTime = [datetime]$startedAt; MainWindowHandle = [IntPtr]1; Path = $codex.Executable }
  $fake | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($Timeout) return $script:exitResult }
  $script:quitCalls = 0
  $script:exitResult = $true
  $script:refuseQuit = $false
  $script:multiple = $false
  function Get-Process { return $fake }
  function Request-DreamSkinCodexQuit { $script:quitCalls++; if ($script:refuseQuit) { throw 'refused quit' } }
  function Get-DreamSkinCodexProcesses {
    if ($script:quitCalls -gt 0 -and $script:exitResult) { return @() }
    if ($script:multiple) { return @($info, $info) }
    return @($info)
  }
  Stop-DreamSkinNewCodexLaunch @identity
  if ($script:quitCalls -ne 1) { throw 'Fresh launch was not asked to quit once.' }
  foreach ($mode in @('refused','timeout','multiple')) {
    $script:quitCalls = 0
    $script:refuseQuit = $mode -eq 'refused'
    $script:exitResult = $mode -ne 'timeout'
    $script:multiple = $mode -eq 'multiple'
    try { Stop-DreamSkinNewCodexLaunch @identity; throw 'Unsafe automatic close was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'refused|not close|exactly one') { throw } }
  }
  Remove-Item Function:\Get-Process
  [IO.File]::WriteAllText((Join-Path $stateRoot 'engine\scripts\start-dream-skin.ps1'), @'
param([int]$NewLaunchPid, [string]$NewLaunchStartedAt, [string]$StateRoot)
[IO.File]::AppendAllText((Join-Path $StateRoot 'handoffs'), "$NewLaunchPid`n")
if (Test-Path -LiteralPath (Join-Path $StateRoot 'fail')) { throw 'fixture failure' }
'@, [Text.UTF8Encoding]::new($true))
  $context = @{ Seen = @{ "101:$startedAt" = $true } }
  Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot
  if (Test-Path -LiteralPath (Join-Path $stateRoot 'handoffs')) { throw 'Already-open session was changed.' }
  foreach ($id in @(110, 120, 130)) {
    $fake.Id = $id; $info.ProcessId = $id
    Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot
    Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot
  }
  if ((Get-Content -LiteralPath (Join-Path $stateRoot 'handoffs') -Raw) -cne "110`n120`n130`n") { throw 'Rapid independent launches were repeated or suppressed.' }
  $fake.Id = 140; $info.ProcessId = 140
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot
  Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot
  $null = Set-DreamSkinPaused -Paused $false -StateRoot $stateRoot
  Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot
  if (@(Get-Content -LiteralPath (Join-Path $stateRoot 'handoffs')).Count -ne 3) { throw 'Pause/resume restarted an existing session.' }
  $fake.Id = 150; $info.ProcessId = 150
  [IO.File]::WriteAllText((Join-Path $stateRoot 'fail'), 'fail')
  Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot 3>$null
  Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot 3>$null
  if (@(Get-Content -LiteralPath (Join-Path $stateRoot 'handoffs')).Count -ne 4) { throw 'Failed handoff was retried.' }
  Remove-Item -LiteralPath (Join-Path $stateRoot 'fail')
  $fake.Id = 160; $info.ProcessId = 160
  Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot
  if (@(Get-Content -LiteralPath (Join-Path $stateRoot 'handoffs')).Count -ne 5) { throw 'A failed handoff suppressed a new user launch.' }
  $fake.Id = 170; $info.ProcessId = 170
  $info.CommandLine += ' --remote-debugging-port=9335'
  Invoke-DreamSkinAutostartStep -Candidates @($fake) -Context $context -StateRoot $stateRoot
  if (@(Get-Content -LiteralPath (Join-Path $stateRoot 'handoffs')).Count -ne 5) { throw 'Managed relaunch looped.' }
  $stopped = 0
  function Stop-DreamSkinRecordedInjector { $script:stopped++; return $true }
  Write-DreamSkinState -Path (Join-Path $stateRoot 'state.json') -State @{ codexPid = 999; codexStartedAt = 'old' }
  Invoke-DreamSkinAutostartStep -Candidates @() -Context $context -StateRoot $stateRoot
  if ($stopped -ne 1) { throw 'Exited session retained its recorded injector.' }

  $fake | Add-Member -MemberType NoteProperty -Name HasExited -Value $false
  $script:exitDuringMonitorWait = $false
  $fake | Add-Member -Force -MemberType ScriptMethod -Name WaitForExit -Value {
    param($Timeout)
    if ($Timeout -ne 250) { throw 'Monitor identity inspection must use a bounded exit wait.' }
    if ($script:exitDuringMonitorWait) { $this.HasExited = $true }
    return $this.HasExited
  }
  function Get-Process { return $fake }
  Write-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json') -State @{
    processId = $fake.Id; startedAt = $startedAt
  }
  $stateHash = (Get-FileHash -LiteralPath (Join-Path $stateRoot 'autostart.json')).Hash
  function Get-CimInstance { $fake.HasExited = $true; return $null }
  if (Get-DreamSkinAutostartProcess -StateRoot $stateRoot -Strict) { throw 'An exited monitor was returned as live.' }
  $fake.HasExited = $false
  function Get-CimInstance {
    $fake.HasExited = $true
    return [pscustomobject]@{ SessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId; ExecutablePath = $null; CommandLine = $null }
  }
  if (Get-DreamSkinAutostartProcess -StateRoot $stateRoot -Strict) { throw 'Incomplete CIM data retained an exited monitor.' }
  $fake.HasExited = $false
  function Get-CimInstance { return $null }
  $script:exitDuringMonitorWait = $true
  if (Get-DreamSkinAutostartProcess -StateRoot $stateRoot -Strict) { throw 'A monitor exiting just after inspection was retained.' }
  $fake.HasExited = $false
  $script:exitDuringMonitorWait = $false
  try { $null = Get-DreamSkinAutostartProcess -StateRoot $stateRoot -Strict; throw 'Uninspectable live monitor was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'identity does not match') { throw } }
  if ((Get-FileHash -LiteralPath (Join-Path $stateRoot 'autostart.json')).Hash -cne $stateHash) { throw 'Monitor identity checks modified its saved state.' }
  Remove-Item Function:\Get-Process
} finally {
  Remove-Item -LiteralPath $temporary -Recurse -Force
}
Write-Host 'PASS: fresh exact identities, graceful refusal, existing/paused/debug skipping, rapid launches, failure isolation, injector cleanup and monitor query/exit race.'
