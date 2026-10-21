[CmdletBinding()]
param([ValidateRange(30,600)][int]$Seconds = 90, [string]$Output)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\common-windows.ps1')
$statePath = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\state.json'
$state = Read-DreamSkinState -Path $statePath
$codex = Get-DreamSkinCodexInstallFromState -State $state
if (-not $codex) { throw 'Start Codex through Codex (Xskin) before measuring.' }
$identity = Get-DreamSkinVerifiedCdpIdentity -Port $state.port -Codex $codex
if (-not $identity -or $identity.BrowserId -cne $state.browserId) { throw 'The saved Codex browser identity changed.' }
$injector = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.injectorPid)"
if (-not $injector -or -not (Test-DreamSkinPathEqual -Left $injector.ExecutablePath -Right $state.nodePath) -or
  (Get-DreamSkinProcessStartedAt -ProcessId $state.injectorPid) -cne $state.injectorStartedAt) {
  throw 'The recorded Xskin process is no longer running.'
}
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$processes = @(Get-DreamSkinCodexProcesses -Codex $codex) + @($injector)
$ids = @($processes.ProcessId | Sort-Object)
$cpuFilter = ($ids | ForEach-Object { "IDProcess=$_" }) -join ' OR '
$gpuFilter = ($ids | ForEach-Object { "Name LIKE 'pid_$($_)_%'" }) -join ' OR '

function Get-ResourceSample {
  $rows = @(Get-CimInstance Win32_PerfRawData_PerfProc_Process -Filter $cpuFilter)
  if ((@($rows.IDProcess | Sort-Object) -join ',') -ne ($ids -join ',')) {
    throw 'A measured process exited; repeat the comparison with a stable session.'
  }
  $engines = @(Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUEngine -Filter $gpuFilter |
    Where-Object { $_.Name -match '^pid_(\d+)_' -and [int]$Matches[1] -in $ids })
  if (-not $engines.Count) { throw 'Windows GPU engine counters are unavailable.' }
  $engineMap = @{}
  foreach ($engine in $engines) { $engineMap[$engine.Name] = [double]$engine.RunningTime }
  $watcher = $rows | Where-Object IDProcess -eq $state.injectorPid
  [pscustomobject]@{
    Timestamp = [double]$rows[0].Timestamp_Sys100NS
    GpuTimestamp = [double]$engines[0].Timestamp_Sys100NS
    Cpu = [double](($rows | Measure-Object PercentProcessorTime -Sum).Sum)
    InjectorCpu = [double]$watcher.PercentProcessorTime
    PrivateMiB = (($rows | Measure-Object PrivateBytes -Sum).Sum) / 1MB
    WorkingPrivateMiB = (($rows | Measure-Object WorkingSetPrivate -Sum).Sum) / 1MB
    InjectorPrivateMiB = $watcher.PrivateBytes / 1MB
    Engines = $engineMap
  }
}

$samples = [Collections.Generic.List[object]]::new()
$samples.Add((Get-ResourceSample))
$clock = [Diagnostics.Stopwatch]::StartNew()
while ($clock.Elapsed.TotalSeconds -lt $Seconds) {
  Start-Sleep -Seconds 1
  $samples.Add((Get-ResourceSample))
}
$first = $samples[0]
$last = $samples[$samples.Count - 1]
$elapsed = $last.Timestamp - $first.Timestamp
$gpuElapsed = $last.GpuTimestamp - $first.GpuTimestamp
if ($elapsed -le 0 -or $gpuElapsed -le 0 -or $last.Cpu -lt $first.Cpu -or $cores -lt 1) {
  throw 'Performance counters reset or returned an invalid interval; discard this run.'
}
$gpu = @{}
if ((@($last.Engines.Keys | Sort-Object) -join ',') -ne (@($first.Engines.Keys | Sort-Object) -join ',')) {
  throw 'GPU engine instances changed during measurement; discard this run.'
}
foreach ($name in $last.Engines.Keys) {
  if ($first.Engines.ContainsKey($name) -and $name -match '_engtype_(.+)$') {
    $type = $Matches[1]
    $delta = $last.Engines[$name] - $first.Engines[$name]
    if ($delta -lt 0) { throw 'A GPU counter reset; discard this run.' }
    if (-not $gpu.ContainsKey($type)) { $gpu[$type] = 0.0 }
    $gpu[$type] += $delta / $gpuElapsed * 100
  }
}
foreach ($original in $processes) {
  $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($original.ProcessId)"
  if (-not $current -or $current.CreationDate -ne $original.CreationDate) {
    throw 'A measured process was replaced; discard this run.'
  }
}
$currentIds = @((Get-DreamSkinCodexProcesses -Codex $codex).ProcessId) + @([int]$state.injectorPid)
if ((@($currentIds | Sort-Object) -join ',') -ne ($ids -join ',')) {
  throw 'Codex created another process during measurement; repeat with a stable session.'
}
$finalState = Read-DreamSkinState -Path $statePath
if ($finalState.injectorPid -ne $state.injectorPid -or $finalState.browserId -cne $state.browserId) {
  throw 'The Xskin session changed during measurement; discard this run.'
}
$result = [pscustomobject]@{
  CodexVersion = $codex.Version
  ElapsedSeconds = $elapsed / 1e7
  LogicalProcessors = $cores
  CpuPercent = ($last.Cpu - $first.Cpu) / $elapsed * 100 / $cores
  InjectorCpuPercent = ($last.InjectorCpu - $first.InjectorCpu) / $elapsed * 100 / $cores
  PrivateMiB = ($samples | Measure-Object PrivateMiB -Average).Average
  WorkingPrivateMiB = ($samples | Measure-Object WorkingPrivateMiB -Average).Average
  InjectorPrivateMiB = ($samples | Measure-Object InjectorPrivateMiB -Average).Average
  GpuEnginePercent = $gpu
  ProcessCount = $ids.Count
}
$json = $result | ConvertTo-Json -Depth 4
if ($Output) { Write-DreamSkinUtf8FileAtomically -Path $Output -Content ($json + "`n") }
$json
