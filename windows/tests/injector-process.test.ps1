$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\common-windows.ps1')

$state = [pscustomobject]@{
  injectorPid = 12345
  nodePath = 'C:\Xskin\node.exe'
  injectorPath = 'C:\Xskin\injector.mjs'
  injectorStartedAt = '2026-10-21T00:00:00.0000000Z'
  port = 9335
  browserId = 'test-browser'
}
$commandLine = '"C:\Xskin\node.exe" "C:\Xskin\injector.mjs" --watch --port 9335 --browser-id test-browser'
$stopCount = 0
function Get-CimInstance {
  [CmdletBinding()] param($ClassName, $Filter)
  [pscustomobject]@{ExecutablePath='C:\Xskin\node.exe'; CommandLine=$commandLine}
}
function Get-DreamSkinProcessStartedAt { param($ProcessId) $state.injectorStartedAt }
function Stop-Process {
  [CmdletBinding()] param($Id, [switch]$Force)
  $script:stopCount++
}
function Wait-Process { [CmdletBinding()] param($Id, $Timeout) }
function Get-Process { [CmdletBinding()] param($Id) $remainingProcess }

foreach ($remainingProcess in @($null, [pscustomobject]@{HasExited=$true})) {
  if (-not (Stop-DreamSkinRecordedInjector -State $state)) {
    throw 'An absent or exited injector must allow relaunch.'
  }
}
$remainingProcess = [pscustomobject]@{HasExited=$false}
$rejected = $false
try { Stop-DreamSkinRecordedInjector -State $state | Out-Null }
catch { if ($_.Exception.Message -notlike '*did not stop*') { throw }; $rejected = $true }
if (-not $rejected) { throw 'An injector that is still running must block relaunch.' }

$commandLine = '"C:\Xskin\node.exe" "C:\another-script.mjs" --watch --port 9335 --browser-id test-browser'
$rejected = $false
try { Stop-DreamSkinRecordedInjector -State $state | Out-Null }
catch { if ($_.Exception.Message -notlike '*identity does not match*') { throw }; $rejected = $true }
if (-not $rejected -or $stopCount -ne 3) { throw 'An unrelated process must never be stopped.' }
Write-Host 'PASS: exited injector relaunch and live process identity safety.'
