[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$RuntimeRoot)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$version = (Get-Content -LiteralPath (Join-Path $repository 'windows\VERSION') -Raw).Trim()
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
if (-not (Test-Path -LiteralPath (Join-Path $RuntimeRoot 'scripts\node.exe') -PathType Leaf)) {
  throw 'Build the Windows runtime with bundled Node before packaging its plugin.'
}
& (Join-Path $RuntimeRoot 'scripts\node.exe') (Join-Path $repository 'plugin\build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'The embedded studio build failed.' }
$release = Join-Path $repository 'build\windows'
$package = Join-Path $release ('plugin-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $package | Out-Null
foreach ($directory in @('plugin', 'docs', '.agents\plugins')) {
  New-Item -ItemType Directory -Path (Join-Path $package $directory) | Out-Null
}
Copy-Item -LiteralPath (Join-Path $repository 'plugin.json') -Destination $package
Copy-Item -LiteralPath (Join-Path $repository 'mcp.windows.json') -Destination (Join-Path $package 'mcp.json')
Copy-Item -LiteralPath (Join-Path $repository '.agents\plugins\marketplace.json') -Destination (Join-Path $package '.agents\plugins')
Copy-Item -LiteralPath (Join-Path $repository 'plugin\launch-windows.ps1') -Destination (Join-Path $package 'plugin')
Copy-Item -LiteralPath (Join-Path $repository 'plugin\dist') -Destination (Join-Path $package 'plugin') -Recurse
Copy-Item -LiteralPath (Join-Path $repository 'skills') -Destination $package -Recurse
& (Join-Path $PSScriptRoot 'prepare-package-docs.ps1') -PackageRoot $package
Copy-Item -LiteralPath $RuntimeRoot -Destination (Join-Path $package 'windows') -Recurse
$zip = Join-Path $release "xskin-plugin-v$version-windows-x64.zip"
Compress-Archive -LiteralPath $package -DestinationPath $zip -Force
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($zip + '.sha256'), "$hash  $([IO.Path]::GetFileName($zip))`n", [Text.Encoding]::ASCII)
Write-Host "Windows plugin ZIP: $zip"
