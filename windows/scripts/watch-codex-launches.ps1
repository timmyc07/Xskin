[CmdletBinding()]
param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

Ensure-DreamSkinManagedDirectory -Path $StateRoot -Root $StateRoot
$hash = [Security.Cryptography.SHA256]::Create()
try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($StateRoot).ToLowerInvariant()))).Replace('-', '') }
finally { $hash.Dispose() }
$mutex = [Threading.Mutex]::new($false, "Local\CodexDreamSkin.Autostart.$key")
$acquired = $false
try {
  try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
  if (-not $acquired) { exit 0 }
  $sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
  $context = @{ Seen = @{}; LastHandoff = [datetimeoffset]::MinValue }
  # The launch-age guard leaves older windows alone and handles Codex starting before the login monitor.
  Assert-DreamSkinNoReparseComponents -Path (Join-Path $StateRoot 'autostart.json')
  $previous = Read-DreamSkinState -Path (Join-Path $StateRoot 'autostart.json')
  if ($previous -and $previous.lastHandoff) { $context.LastHandoff = [datetimeoffset]$previous.lastHandoff }
  $context.State = [pscustomobject]@{
    processId = $PID; startedAt = Get-DreamSkinProcessStartedAt -ProcessId $PID
    lastHandoff = $context.LastHandoff.ToString('o')
  }
  Write-DreamSkinState -Path (Join-Path $StateRoot 'autostart.json') -State $context.State
  Write-Output 'Watching new official Codex launches.'
  while ((Get-DreamSkinAutostart -StateRoot $StateRoot).Enabled) {
    $candidates = @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $sessionId })
    Invoke-DreamSkinAutostartStep -Candidates $candidates -Context $context -StateRoot $StateRoot
    Start-Sleep -Seconds 1
  }
} finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
