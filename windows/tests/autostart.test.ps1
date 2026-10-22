$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-autostart-' + [guid]::NewGuid().ToString('N'))
$stateRoot = Join-Path $temporary ('state ' + [char]0x4E2D + [char]0x6587 + [char]::ConvertFromUtf32(0x1F311))
$taskName = 'Xskin-autostart-test-' + [guid]::NewGuid().ToString('N')
$scheduler = New-Object -ComObject Schedule.Service
$scheduler.Connect()
$taskFolder = $scheduler.GetFolder('\')
New-Item -ItemType Directory -Path (Join-Path $stateRoot 'engine\scripts') -Force | Out-Null
$realFunctions = @{}
foreach ($name in @('Get-CimInstance','Get-Process','Get-DreamSkinCodexInstall','Get-DreamSkinProcessStartedAt','Get-DreamSkinCodexProcesses','Request-DreamSkinCodexQuit')) {
  $command = Get-Command $name
  if ($command.CommandType -eq 'Function') { $realFunctions[$name] = $command.ScriptBlock }
}
try {
  if (-not (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $stateRoot) -Right $stateRoot)) {
    throw 'State-root resolution changed a new normal directory.'
  }
  New-Item -ItemType Directory -Path (Join-Path $stateRoot 'active-theme') -Force | Out-Null
  Write-DreamSkinUtf8FileAtomically -Path (Join-Path $stateRoot 'active-theme\theme.json') -Content '{}'
  if (-not (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $stateRoot) -Right $stateRoot)) {
    throw 'State-root resolution did not preserve a normal Unicode directory.'
  }
  $junction = Join-Path $temporary 'linked-state'
  New-Item -ItemType Junction -Path $junction -Target $stateRoot | Out-Null
  try {
    try { $null = Resolve-DreamSkinStateRoot -StateRoot $junction; throw 'A reparse state root was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'junction or symbolic link') { throw } }
  } finally { [IO.Directory]::Delete($junction) }
  $codex = [pscustomobject]@{ Executable = 'C:\Store\OpenAI.Codex_fixture\app\ChatGPT.exe' }
  $startedAt = [datetime]::UtcNow.ToString('o')
  $identityStartedAt = $startedAt
  $launchInfo = [pscustomobject]@{
    ProcessId = 12345; ExecutablePath = $codex.Executable; CommandLine = '"C:\Store\OpenAI.Codex_fixture\app\ChatGPT.exe"'
    SessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
  }
  function Get-CimInstance { return $launchInfo }
  function Get-DreamSkinProcessStartedAt { return $identityStartedAt }
  function Get-DreamSkinCodexInstall { return $codex }
  $arguments = @{ Codex = $codex; ProcessId = 12345; StartedAt = $startedAt }
  if (-not (Test-DreamSkinNewCodexLaunch @arguments)) { throw 'A new official launch was rejected.' }
  foreach ($suffix in @(' --type=renderer',' --remote-debugging-port=9335',' --remote-debugging-pipe',' "--type=utility"')) {
    $launchInfo.CommandLine += $suffix
    if (Test-DreamSkinNewCodexLaunch @arguments) { throw 'An explicit debug launch or child process was accepted.' }
    $launchInfo.CommandLine = '"C:\Store\OpenAI.Codex_fixture\app\ChatGPT.exe"'
  }
  $identityStartedAt = [datetime]::UtcNow.AddMinutes(-1).ToString('o')
  if (Test-DreamSkinNewCodexLaunch @arguments) { throw 'PID reuse was accepted.' }
  $identityStartedAt = $startedAt
  if (Test-DreamSkinNewCodexLaunch -Codex $codex -ProcessId 12345 -StartedAt ([datetime]::UtcNow.AddMinutes(-1).ToString('o'))) { throw 'An old launch was accepted.' }
  $launchInfo.ExecutablePath = 'C:\unrelated\ChatGPT.exe'
  if (Test-DreamSkinNewCodexLaunch @arguments) { throw 'An unrelated executable was accepted.' }
  $launchInfo.ExecutablePath = $codex.Executable
  $launchInfo.SessionId++
  if (Test-DreamSkinNewCodexLaunch @arguments) { throw 'A different user session was accepted.' }
  $launchInfo.SessionId--

  $fakeProcess = [pscustomobject]@{ Id = 12345; StartTime = [datetime]$startedAt; MainWindowHandle = [IntPtr]1; Path = $codex.Executable }
  $closeResult = $true
  $exitResult = $true
  $closeCalls = 0
  $fakeProcess | Add-Member -MemberType ScriptMethod -Name CloseMainWindow -Value { throw 'Closing a window does not quit the tray app.' }
  function Request-DreamSkinCodexQuit {
    param([object]$Process)
    if ($Process.Id -ne 12345 -or $Process.StartTime.ToUniversalTime().ToString('o') -cne $startedAt) { throw 'Wrong shutdown identity.' }
    $script:closeCalls++
    if (-not $script:closeResult) { throw 'Codex refused the graceful shutdown request.' }
  }
  $fakeProcess | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { return $script:exitResult }
  function Get-Process { return $fakeProcess }
  $remaining = @($launchInfo)
  function Get-DreamSkinCodexProcesses {
    if ($closeCalls -gt 0 -and $exitResult) { return @() }
    return $remaining
  }
  Stop-DreamSkinNewCodexLaunch @arguments
  if ($closeCalls -ne 1) { throw 'The new launch was not closed exactly once.' }
  foreach ($refusal in @('refused','timeout','multiple')) {
    $closeCalls = 0
    $closeResult = $refusal -ne 'refused'
    $exitResult = $refusal -ne 'timeout'
    $remaining = if ($refusal -eq 'multiple') { @($launchInfo,$launchInfo) } else { @($launchInfo) }
    try { Stop-DreamSkinNewCodexLaunch @arguments; throw 'Unsafe automatic close was accepted.' }
    catch { if ($_.Exception.Message -notmatch 'refused|not close|exactly one') { throw } }
  }
  Remove-Item Function:\Get-Process

  $handoffs = Join-Path $stateRoot 'handoffs.txt'
  [IO.File]::WriteAllText((Join-Path $stateRoot 'engine\scripts\start-dream-skin.ps1'), @'
param([int]$NewLaunchPid, [string]$NewLaunchStartedAt, [string]$StateRoot)
$expectedStateRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ([IO.Path]::GetFullPath($StateRoot).TrimEnd('\') -ine $expectedStateRoot.TrimEnd('\')) {
  throw 'Automatic apply did not forward its custom state root.'
}
[IO.File]::AppendAllText((Join-Path $PSScriptRoot '..\..\handoffs.txt'), "$NewLaunchPid`n")
'@)
  $context = @{ Seen = @{}; LastHandoff = [datetimeoffset]::MinValue; State = [pscustomobject]@{lastHandoff=''} }
  $fakeProcess.MainWindowHandle = [IntPtr]::Zero
  Invoke-DreamSkinAutostartStep -Candidates @($fakeProcess) -Context $context -StateRoot $stateRoot
  if (Test-Path -LiteralPath $handoffs) { throw 'A windowless launch was restarted.' }
  $fakeProcess.MainWindowHandle = [IntPtr]1
  Invoke-DreamSkinAutostartStep -Candidates @($fakeProcess) -Context $context -StateRoot $stateRoot
  Invoke-DreamSkinAutostartStep -Candidates @($fakeProcess) -Context $context -StateRoot $stateRoot
  if (@(Get-Content -LiteralPath $handoffs).Count -ne 1) { throw 'One launch was handed off more than once.' }
  $context.Seen.Clear()
  Invoke-DreamSkinAutostartStep -Candidates @($fakeProcess) -Context $context -StateRoot $stateRoot
  if (@(Get-Content -LiteralPath $handoffs).Count -ne 1) { throw 'The restart-loop guard did not hold.' }
  $context.Seen.Clear()
  $context.LastHandoff = [datetimeoffset]::MinValue
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot
  Invoke-DreamSkinAutostartStep -Candidates @($fakeProcess) -Context $context -StateRoot $stateRoot
  $null = Set-DreamSkinPaused -Paused $false -StateRoot $stateRoot
  Invoke-DreamSkinAutostartStep -Candidates @($fakeProcess) -Context $context -StateRoot $stateRoot
  if (@(Get-Content -LiteralPath $handoffs).Count -ne 1) { throw 'Pause/resume restarted an already-open window.' }
  Invoke-DreamSkinAutostartStep -Candidates @() -Context $context -StateRoot $stateRoot
  if ($context.Seen.Count -ne 0) { throw 'Exited launches were retained forever.' }

  foreach ($name in $realFunctions.Keys) { Set-Item -Path "Function:\$name" -Value $realFunctions[$name] }
  Remove-Item Function:\Get-CimInstance
  . (Join-Path $root 'scripts\xskin-theme.ps1')
  $source = Join-Path $temporary 'source'
  New-Item -ItemType Directory -Path $source | Out-Null
  foreach ($name in @('assets','scripts')) { Copy-Item -LiteralPath (Join-Path $root $name) -Destination $source -Recurse }
  $startupShortcut = Join-Path $temporary ('startup-' + [char]::ConvertFromUtf32(0x1F311) + '.lnk')
  $helpers = Join-Path $source 'scripts\autostart-windows.ps1'
  $helperSource = [IO.File]::ReadAllText($helpers)
  $helperSource += "`nfunction Get-DreamSkinAutostartTaskName { return '$taskName' }`n"
  $helperSource += "function Get-DreamSkinAutostartShortcutPath { return '$($startupShortcut.Replace("'", "''"))' }`n"
  $helperSource += "function Get-DreamSkinCodexInstall { throw 'Isolated monitor must not manage the real app.' }`n"
  [IO.File]::WriteAllText($helpers, $helperSource, [Text.UTF8Encoding]::new($true))
  function Get-DreamSkinAutostartTaskName { return $taskName }
  function Get-DreamSkinAutostartShortcutPath { return $startupShortcut }
  $legacyPaths = @((Join-Path $temporary 'desktop.lnk'), (Join-Path $temporary 'start.lnk'))
  function Get-XskinLaunchShortcutPaths { return $legacyPaths }
  function Get-DreamSkinCodexInstall { return $codex }
  $shell = New-Object -ComObject WScript.Shell
  Set-DreamSkinShortcut -Path $legacyPaths[0] `
    -TargetPath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') `
    -Arguments ('-File "' + (Join-Path $stateRoot 'engine\scripts\start-dream-skin.ps1') + '"') `
    -WorkingDirectory $stateRoot -Description 'Xskin automatic Codex background launcher'
  $old = Get-DreamSkinShortcut -Path $legacyPaths[0]
  $foreign = $shell.CreateShortcut($legacyPaths[1])
  $foreign.TargetPath = $old.TargetPath
  $foreign.Description = 'unrelated'
  $foreign.Save()
  $legacyMonitorArguments = ConvertTo-DreamSkinArgumentLine -Arguments @('-NoProfile', '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $stateRoot 'engine\scripts\watch-codex-launches.ps1'),
    '-StateRoot', $stateRoot)
  Set-DreamSkinShortcut -Path $startupShortcut -TargetPath $old.TargetPath `
    -Arguments $legacyMonitorArguments `
    -WorkingDirectory $stateRoot -Description 'Xskin official Codex launch monitor'
  Remove-Item -LiteralPath (Join-Path $stateRoot 'autostart.json')
  Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot
  $startup = Get-XskinAutostart -StateRoot $stateRoot
  if (-not $startup.Enabled -or -not $startup.Loaded) {
    $diagnostic = [pscustomobject]@{
      startup = $startup; task = (Get-DreamSkinAutostartTask).Xml
      expectedArguments = Get-DreamSkinAutostartArguments -StateRoot $stateRoot
      state = Read-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json')
      log = (Get-Content -LiteralPath (Join-Path $stateRoot 'autostart.log') -Raw -ErrorAction Continue)
      error = (Get-Content -LiteralPath (Join-Path $stateRoot 'autostart-error.log') -Raw -ErrorAction Continue)
    }
    throw "The real background monitor was not registered and ready: $($diagnostic | ConvertTo-Json -Depth 4 -Compress)"
  }
  $task = Get-DreamSkinAutostartTask
  $definition = $task.Definition
  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $taskUserSids = @($definition.Principal.UserId, $definition.Triggers.Item(1).UserId) | ForEach-Object {
    if ($_ -match '^S-\d-') { [Security.Principal.SecurityIdentifier]::new($_).Value }
    else { [Security.Principal.NTAccount]::new($_).Translate([Security.Principal.SecurityIdentifier]).Value }
  }
  if ($taskUserSids[0] -cne $currentSid -or $definition.Principal.LogonType -ne 3 -or
    $definition.Principal.RunLevel -ne 0 -or $definition.Triggers.Count -ne 1 -or
    $definition.Triggers.Item(1).Type -ne 9 -or $taskUserSids[1] -cne $currentSid -or
    $definition.Settings.ExecutionTimeLimit -cne 'PT0S' -or $definition.Actions.Count -ne 1 -or
    -not (Test-DreamSkinPathEqual -Left $definition.Actions.Item(1).Path -Right (Join-Path $stateRoot 'engine\scripts\xskin-quiet.exe')) -or
    $definition.Actions.Item(1).Arguments -cne (Get-DreamSkinAutostartArguments -StateRoot $stateRoot)) {
    throw 'Logon task must use the current interactive user, least privilege, exact quiet-host action and unlimited runtime.'
  }
  if ((Test-Path -LiteralPath $startupShortcut) -or (Test-Path -LiteralPath $legacyPaths[0]) -or
    -not (Test-Path -LiteralPath $legacyPaths[1])) { throw 'Migration did not remove only the old owned shortcuts.' }
  $before = Get-DreamSkinAutostartProcess -StateRoot $stateRoot
  Start-DreamSkinAutostart -StateRoot $stateRoot
  if ((Get-DreamSkinAutostartProcess -StateRoot $stateRoot).Id -ne $before.Id) { throw 'Starting the monitor twice created a duplicate.' }
  $record = Read-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json')
  $record.lastHandoff = [datetimeoffset]::UtcNow.ToString('o')
  Write-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json') -State $record
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot
  $null = Install-DreamSkinRuntimeEngine -SkillRoot $source -StateRoot $stateRoot
  $after = Get-DreamSkinAutostartProcess -StateRoot $stateRoot
  if (-not $after -or $after.Id -eq $before.Id -or -not $before.WaitForExit(5000) -or
    -not (Test-DreamSkinPaused -StateRoot $stateRoot) -or
    (Read-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json')).lastHandoff -cne $record.lastHandoff) {
    throw 'Engine replacement did not resume the monitor and preserve pause/loop-guard state.'
  }
  if (@(Get-ChildItem -LiteralPath $stateRoot -Directory -Filter '.engine-backup-*').Count -ne 0) {
    throw 'The stopped quiet host kept the previous engine executable locked.'
  }
  function Move-Item {
    [CmdletBinding()]
    param([string]$LiteralPath, [string]$Destination)
    if ([IO.Path]::GetFileName($LiteralPath) -like '.engine-staging-*') { throw 'forced autostart engine swap failure' }
    Microsoft.PowerShell.Management\Move-Item @PSBoundParameters
  }
  try {
    try { $null = Install-DreamSkinRuntimeEngine -SkillRoot $source -StateRoot $stateRoot; throw 'Failed engine swap was accepted.' }
    catch { if ($_.Exception.Message -ne 'forced autostart engine swap failure') { throw } }
  } finally { Remove-Item Function:\Move-Item }
  $rolledBack = Get-DreamSkinAutostartProcess -StateRoot $stateRoot
  if (-not $rolledBack -or $rolledBack.Id -eq $after.Id -or -not $after.WaitForExit(5000) -or
    -not (Test-DreamSkinPaused -StateRoot $stateRoot)) { throw 'Failed engine swap did not resume the old monitor.' }
  $after = $rolledBack
  $validRecord = Read-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json')
  $invalid = [pscustomobject]@{processId=$PID;startedAt=(Get-DreamSkinProcessStartedAt -ProcessId $PID);lastHandoff=''}
  $reusedPid = [pscustomobject]@{processId=$PID;startedAt='2000-01-01T00:00:00.0000000Z';lastHandoff=''}
  Write-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json') -State $reusedPid
  if (Get-DreamSkinAutostartProcess -StateRoot $stateRoot -Strict) { throw 'A reused monitor PID was accepted.' }
  Write-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json') -State $invalid
  try { Stop-DreamSkinAutostart -StateRoot $stateRoot; throw 'An unrelated process identity was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'identity does not match') { throw } }
  Write-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json') -State $validRecord
  Set-XskinAutostart -Enabled $false -SkillRoot $source -StateRoot $stateRoot
  if ((Get-DreamSkinAutostartTask) -or -not $after.WaitForExit(5000)) { throw 'Disable left automatic startup enabled.' }

  $foreignTask = $scheduler.NewTask(0)
  $foreignTask.RegistrationInfo.Description = 'unrelated test task'
  $foreignTask.Principal.UserId = $currentSid
  $foreignTask.Principal.LogonType = 3
  $foreignTask.Principal.RunLevel = 0
  $foreignTask.Actions.Create(0).Path = Join-Path $env:SystemRoot 'System32\cmd.exe'
  $null = $taskFolder.RegisterTaskDefinition($taskName, $foreignTask, 6, $null, $null, 3)
  $foreignXml = (Get-DreamSkinAutostartTask).Xml
  foreach ($enabled in @($true, $false)) {
    try { Set-XskinAutostart -Enabled $enabled -SkillRoot $source -StateRoot $stateRoot; throw 'A foreign startup task was overwritten.' }
    catch { if ($_.Exception.Message -notmatch 'unrelated automatic-startup') { throw } }
    if ((Get-DreamSkinAutostartTask).Xml -cne $foreignXml) { throw 'A foreign startup task was changed.' }
  }
  $taskFolder.DeleteTask($taskName, 0)

  Set-DreamSkinShortcut -Path $startupShortcut -TargetPath $old.TargetPath -Arguments '' -WorkingDirectory $stateRoot -Description 'unrelated'
  $foreignShortcutBytes = [IO.File]::ReadAllBytes($startupShortcut)
  Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot
  if (-not (Test-DreamSkinBytesEqual -Left $foreignShortcutBytes -Right ([IO.File]::ReadAllBytes($startupShortcut)))) {
    throw 'An unrelated legacy Startup shortcut was changed.'
  }
  Stop-DreamSkinAutostart -StateRoot $stateRoot
  $previousTaskXml = (Get-DreamSkinAutostartTask).Xml
  $realStart = (Get-Command Start-DreamSkinAutostart).ScriptBlock
  function Start-DreamSkinAutostart { throw 'forced task startup failure' }
  try {
    try { Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot; throw 'Failed task replacement was accepted.' }
    catch { if ($_.Exception.Message -ne 'forced task startup failure') { throw } }
    if ((Get-DreamSkinAutostartTask).Xml -cne $previousTaskXml) { throw 'Failed task replacement did not preserve the previous task XML.' }
  } finally { Set-Item Function:\Start-DreamSkinAutostart -Value $realStart }
  Set-XskinAutostart -Enabled $false -SkillRoot $source -StateRoot $stateRoot

  [IO.File]::WriteAllText((Join-Path $source 'scripts\watch-codex-launches.ps1'), 'exit 1')
  try { Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot; throw 'Monitor startup failure was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'monitor exited|monitor did not become ready') { throw } }
  if (Get-DreamSkinAutostartTask) { throw 'Failed enable left a startup registration behind.' }

  Copy-Item -LiteralPath (Join-Path $root 'scripts\watch-codex-launches.ps1') -Destination (Join-Path $source 'scripts\watch-codex-launches.ps1') -Force
  $helperSource += @'

function Get-DreamSkinCodexInstall { return [pscustomobject]@{ Executable = 'C:\isolated\ChatGPT.exe' } }
function Test-DreamSkinNewCodexLaunch { param($Codex, $ProcessId, $StartedAt) return $true }
function Get-Process {
  [CmdletBinding()]
  param([string]$Name, [int]$Id)
  if ($Name -eq 'ChatGPT') {
    $fixture = Read-DreamSkinState -Path (Join-Path $StateRoot 'launch-fixture.json')
    foreach ($item in $fixture.candidates) {
      [pscustomobject]@{
        Id = $item.id; StartTime = [datetime]$item.startedAt
        SessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId; MainWindowHandle = [IntPtr]1
      }
    }
    return
  }
  Microsoft.PowerShell.Management\Get-Process @PSBoundParameters
}
'@
  [IO.File]::WriteAllText($helpers, $helperSource, [Text.UTF8Encoding]::new($true))
  [IO.File]::WriteAllText((Join-Path $source 'scripts\start-dream-skin.ps1'), @'
param([int]$NewLaunchPid, [string]$NewLaunchStartedAt, [string]$StateRoot)
[IO.File]::AppendAllText((Join-Path $StateRoot 'login-handoffs.txt'), "$NewLaunchPid`n")
'@)
  $null = Set-DreamSkinPaused -Paused $false -StateRoot $stateRoot
  Remove-Item -LiteralPath (Join-Path $stateRoot 'autostart.json') -ErrorAction SilentlyContinue
  Write-DreamSkinState -Path (Join-Path $stateRoot 'launch-fixture.json') -State ([pscustomobject]@{
    candidates = @(
      @{ id = 12344; startedAt = [datetime]::UtcNow.AddMinutes(-2).ToString('o') },
      @{ id = 12345; startedAt = [datetime]::UtcNow.ToString('o') }
    )
  })
  Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot
  $loginHandoffs = Join-Path $stateRoot 'login-handoffs.txt'
  $deadline = [datetime]::UtcNow.AddSeconds(5)
  while (-not (Test-Path -LiteralPath $loginHandoffs) -and [datetime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
  if (-not (Test-Path -LiteralPath $loginHandoffs) -or (Get-Content -LiteralPath $loginHandoffs -Raw).Trim() -cne '12345') {
    throw 'Login monitor must apply a fresh existing Codex launch and leave an old existing window alone.'
  }
  Set-XskinAutostart -Enabled $false -SkillRoot $source -StateRoot $stateRoot
} catch {
  foreach ($name in @('autostart.log', 'autostart-error.log')) {
    $path = Join-Path $stateRoot $name
    if (Test-Path -LiteralPath $path) { Write-Host "${name}: $(Get-Content -LiteralPath $path -Raw -ErrorAction Continue)" }
  }
  throw
} finally {
  foreach ($name in $realFunctions.Keys) { Set-Item -Path "Function:\$name" -Value $realFunctions[$name] }
  Remove-Item Function:\Get-CimInstance,Function:\Get-Process -ErrorAction SilentlyContinue
  try { Stop-DreamSkinAutostart -StateRoot $stateRoot } catch { Write-Warning $_.Exception.Message }
  try { $taskFolder.DeleteTask($taskName, 0) } catch { if ($_.Exception.HResult -ne -2147024894) { Write-Warning $_.Exception.Message } }
  $fullPath = [IO.Path]::GetFullPath($temporary)
  if (-not $fullPath.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
  Remove-Item -LiteralPath $fullPath -Recurse -Force
}
Write-Host 'PASS: native-launch identity/age/session checks, graceful refusal, duplicate/loop guards, pause, real scheduled monitor lifecycle, engine replacement, foreign-task preservation, rollback, shortcut migration and login launch ordering.'
