[CmdletBinding()]
param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'xskin-theme.ps1')
$StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
Ensure-DreamSkinManagedDirectory -Path $StateRoot -Root $StateRoot
$hash = [Security.Cryptography.SHA256]::Create()
try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($StateRoot.ToLowerInvariant()))).Replace('-', '') }
finally { $hash.Dispose() }
$mutex = [Threading.Mutex]::new($false, "Local\CodexDreamSkin.Autostart.$key")
$acquired = $false
try {
  try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }
  $sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
  $context = @{ Seen = @{} }
  # Installation and login leave every already-open session alone, including fresh ones.
  foreach ($process in @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $sessionId })) {
    try { $context.Seen["$($process.Id):$($process.StartTime.ToUniversalTime().ToString('o'))"] = $true } catch { }
  }
  Assert-DreamSkinNoReparseComponents -Path (Join-Path $StateRoot 'autostart.json')
  Write-DreamSkinState -Path (Join-Path $StateRoot 'autostart.json') -State @{
    processId = $PID; startedAt = Get-DreamSkinProcessStartedAt -ProcessId $PID
  }
  while ((Get-DreamSkinAutostart -StateRoot $StateRoot).Enabled) {
    $candidates = @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $sessionId })
    Invoke-DreamSkinAutostartStep -Candidates $candidates -Context $context -StateRoot $StateRoot
    Start-Sleep -Seconds 1
  }
} finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
