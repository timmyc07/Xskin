[CmdletBinding()]
param([string]$Flutter = 'flutter', [switch]$SkipTests)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$repository = Split-Path -Parent $root
$panel = Join-Path $root 'panel'
$version = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
if (-not $SkipTests) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'tests\run-tests.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Windows engine tests failed.' }
}
Push-Location $panel
try {
  & $Flutter pub get
  if ($LASTEXITCODE -ne 0) { throw 'Flutter dependencies could not be resolved.' }
  if (-not $SkipTests) {
    & $Flutter analyze --no-pub
    if ($LASTEXITCODE -ne 0) { throw 'Flutter analysis failed.' }
    & $Flutter test --no-pub
    if ($LASTEXITCODE -ne 0) { throw 'Flutter tests failed.' }
  }
  & $Flutter build windows --release --no-pub "--dart-define=XSKIN_VERSION=$version"
  if ($LASTEXITCODE -ne 0) { throw 'Flutter Windows build failed.' }
} finally { Pop-Location }
$release = Join-Path $repository 'build\windows'
New-Item -ItemType Directory -Force -Path $release | Out-Null
$package = Join-Path $release ('Xskin-' + $version + '-flutter-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $package | Out-Null
Copy-Item -Path (Join-Path $panel 'build\windows\x64\runner\Release\*') -Destination $package -Recurse
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$studio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$redistributables = Get-ChildItem -LiteralPath (Join-Path $studio 'VC\Redist\MSVC') -Directory |
  Where-Object { $_.Name -match '^\d+\.\d+' } | Sort-Object { [version]$_.Name } -Descending
$crt = Join-Path $redistributables[0].FullName 'x64\Microsoft.VC143.CRT'
if (-not (Test-Path -LiteralPath $crt)) { throw 'The x64 Visual C++ redistributable is required for the portable package.' }
Copy-Item -Path (Join-Path $crt '*.dll') -Destination $package
foreach ($name in @('scripts','assets','references','README.md','README.en.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','VERSION')) {
  Copy-Item -LiteralPath (Join-Path $root $name) -Destination $package -Recurse
}
. (Join-Path $root 'scripts\common-windows.ps1')
$nodeRuntime = Get-DreamSkinNodeRuntime
$nodeLicense = Join-Path (Split-Path -Parent $nodeRuntime.Path) 'LICENSE'
if (-not (Test-Path -LiteralPath $nodeLicense)) { throw 'The Node.js distribution license is required for packaging.' }
Copy-Item -LiteralPath $nodeRuntime.Path -Destination (Join-Path $package 'scripts\node.exe')
Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $package 'Node-LICENSE.txt')
$quietCompiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$quietLauncher = Join-Path $package 'scripts\xskin-quiet.exe'
& $quietCompiler /nologo /target:winexe /reference:System.Windows.Forms.dll "/out:$quietLauncher" (Join-Path $package 'scripts\quiet-launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'The GUI-only Xskin launcher could not be built.' }
Copy-Item -LiteralPath $quietLauncher -Destination (Join-Path $package 'Install Xskin.exe')
Copy-Item -LiteralPath (Join-Path $repository 'macos\LICENSE'), (Join-Path $repository 'macos\NOTICE.md') -Destination $package
$zip = Join-Path $release "Xskin-$version-windows-x64.zip"
Compress-Archive -Path $package -DestinationPath $zip -Force
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText(($zip + '.sha256'), "$hash  $([System.IO.Path]::GetFileName($zip))`n", [System.Text.Encoding]::ASCII)
Write-Host "Flutter Windows app: $(Join-Path $package 'xskin.exe')"
Write-Host "Release ZIP: $zip"
