$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-autostart-' + [guid]::NewGuid().ToString('N'))
$stateRoot = Join-Path $temporary ('state ' + [char]0x4E2D + [char]0x6587)
New-Item -ItemType Directory -Path (Join-Path $stateRoot 'engine\scripts') -Force | Out-Null
$realFunctions = @{}
foreach ($name in @('Get-CimInstance','Get-Process','Get-DreamSkinCodexInstall','Get-DreamSkinProcessStartedAt','Get-DreamSkinCodexProcesses','Request-DreamSkinCodexQuit')) {
  $command = Get-Command $name
  if ($command.CommandType -eq 'Function') { $realFunctions[$name] = $command.ScriptBlock }
}
try {
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
param([int]$NewLaunchPid, [string]$NewLaunchStartedAt)
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
  $startupShortcut = Join-Path $temporary 'startup.lnk'
  $helpers = Join-Path $source 'scripts\autostart-windows.ps1'
  $helperSource = [IO.File]::ReadAllText($helpers).Replace(
    "Join-Path ([Environment]::GetFolderPath('Startup')) 'Xskin Codex backgrounds.lnk'", "'$($startupShortcut.Replace("'", "''"))'")
  $helperSource += "`nfunction Get-DreamSkinCodexInstall { throw 'Isolated monitor must not manage the real app.' }`n"
  [IO.File]::WriteAllText($helpers, $helperSource, [Text.UTF8Encoding]::new($false))
  function Get-DreamSkinAutostartShortcutPath { return $startupShortcut }
  $legacyPaths = @((Join-Path $temporary 'desktop.lnk'), (Join-Path $temporary 'start.lnk'))
  function Get-XskinLaunchShortcutPaths { return $legacyPaths }
  function Get-DreamSkinCodexInstall { return $codex }
  $shell = New-Object -ComObject WScript.Shell
  $old = $shell.CreateShortcut($legacyPaths[0])
  $old.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $old.Arguments = '-File "' + (Join-Path $stateRoot 'engine\scripts\start-dream-skin.ps1') + '"'
  $old.Description = 'Xskin automatic Codex background launcher'
  $old.Save()
  $foreign = $shell.CreateShortcut($legacyPaths[1])
  $foreign.TargetPath = $old.TargetPath
  $foreign.Description = 'unrelated'
  $foreign.Save()
  Remove-Item -LiteralPath (Join-Path $stateRoot 'autostart.json')
  Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot
  $startup = Get-XskinAutostart -StateRoot $stateRoot
  if (-not $startup.Enabled -or -not $startup.Loaded) {
    $link = $shell.CreateShortcut($startupShortcut)
    $diagnostic = [pscustomobject]@{
      startup = $startup; target = $link.TargetPath; description = $link.Description
      arguments = $link.Arguments; expectedArguments = Get-DreamSkinAutostartArguments -StateRoot $stateRoot
      state = Read-DreamSkinState -Path (Join-Path $stateRoot 'autostart.json')
      log = [IO.File]::ReadAllText((Join-Path $stateRoot 'autostart.log'))
      error = [IO.File]::ReadAllText((Join-Path $stateRoot 'autostart-error.log'))
    }
    throw "The real background monitor was not registered and ready: $($diagnostic | ConvertTo-Json -Depth 4 -Compress)"
  }
  if ((Test-Path -LiteralPath $legacyPaths[0]) -or -not (Test-Path -LiteralPath $legacyPaths[1])) { throw 'Migration did not remove only the old owned shortcut.' }
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
  if ((Get-XskinAutostart -StateRoot $stateRoot).Enabled -or -not $after.WaitForExit(5000)) { throw 'Disable left automatic startup enabled.' }
  $foreign = $shell.CreateShortcut($startupShortcut)
  $foreign.TargetPath = $old.TargetPath
  $foreign.Description = 'unrelated'
  $foreign.Save()
  try { Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot; throw 'A foreign startup entry was overwritten.' }
  catch { if ($_.Exception.Message -notmatch 'unrelated automatic-startup') { throw } }
  if (($shell.CreateShortcut($startupShortcut)).Description -cne 'unrelated') { throw 'A foreign startup entry was changed.' }
  Remove-Item -LiteralPath $startupShortcut
  [IO.File]::WriteAllText((Join-Path $source 'scripts\watch-codex-launches.ps1'), 'exit 1')
  try { Set-XskinAutostart -Enabled $true -SkillRoot $source -StateRoot $stateRoot; throw 'Monitor startup failure was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'monitor exited') { throw } }
  if (Test-Path -LiteralPath $startupShortcut) { throw 'Failed enable left a startup registration behind.' }
} finally {
  foreach ($name in $realFunctions.Keys) { Set-Item -Path "Function:\$name" -Value $realFunctions[$name] }
  Remove-Item Function:\Get-CimInstance,Function:\Get-Process -ErrorAction SilentlyContinue
  try { Stop-DreamSkinAutostart -StateRoot $stateRoot } catch { Write-Warning $_.Exception.Message }
  $fullPath = [IO.Path]::GetFullPath($temporary)
  if (-not $fullPath.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
  Remove-Item -LiteralPath $fullPath -Recurse -Force
}
Write-Host 'PASS: native-launch identity/age/session checks, graceful refusal, duplicate/loop guards, pause, real monitor lifecycle, engine replacement and shortcut migration.'
