$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'windows\scripts\common-windows.ps1')
$node = Get-DreamSkinNodeRuntime
& $node.Path (Join-Path $root 'plugin\dist\server.mjs') (Join-Path $root 'windows')
exit $LASTEXITCODE
