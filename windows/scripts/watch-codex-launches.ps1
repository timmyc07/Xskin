[CmdletBinding()]
param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'), [int]$LaunchPid, [datetimeoffset]$EventTime)

$ErrorActionPreference = 'Stop'
if (-not $LaunchPid) { return }
. (Join-Path $PSScriptRoot 'xskin-theme.ps1')
$StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
Invoke-DreamSkinLaunchEvent -LaunchPid $LaunchPid -EventTime $EventTime -StateRoot $StateRoot
