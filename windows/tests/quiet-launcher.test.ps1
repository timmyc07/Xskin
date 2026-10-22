$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\common-windows.ps1')
. (Join-Path $PSScriptRoot '..\scripts\theme-windows.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-quiet-' + [guid]::NewGuid().ToString('N'))
$state = Join-Path $temporary ('state ' + [char]0x6E2C + [char]0x8A66)
$scripts = Join-Path $state 'engine\scripts'
New-Item -ItemType Directory -Path $scripts -Force | Out-Null
$processes = @()
try {
  $source = Join-Path $scripts 'quiet-launcher.cs'
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\scripts\quiet-launcher.cs') -Destination $source
  $executable = Get-DreamSkinQuietLauncher -StateRoot $state
  $bytes = [IO.File]::ReadAllBytes($executable)
  $pe = [BitConverter]::ToInt32($bytes, 0x3c)
  if ([BitConverter]::ToUInt16($bytes, $pe + 24 + 68) -ne 2) { throw 'The quiet launcher is not a Windows GUI executable.' }
  $compiledAt = [IO.File]::GetLastWriteTimeUtc($executable)
  if ((Get-DreamSkinQuietLauncher -StateRoot $state) -cne $executable -or [IO.File]::GetLastWriteTimeUtc($executable) -ne $compiledAt) {
    throw 'The unchanged quiet launcher was needlessly recompiled.'
  }
  [IO.File]::SetLastWriteTimeUtc($source, $compiledAt.AddSeconds(1))
  $null = Get-DreamSkinQuietLauncher -StateRoot $state
  if ([IO.File]::GetLastWriteTimeUtc($executable) -eq $compiledAt) { throw 'The changed launcher source was not rebuilt atomically.' }

  $fixture = @'
param([string]$ResultPath, [string]$Label, [string]$Trailing, [string]$Quoted, [AllowEmptyString()][string]$EmptyValue)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class QuietConsole {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
}
"@
$report = @{ label=$Label; trailing=$Trailing; quoted=$Quoted; empty=$EmptyValue; console=[QuietConsole]::GetConsoleWindow().ToInt64() }
[IO.File]::WriteAllText($ResultPath, (ConvertTo-Json -InputObject $report -Compress), [Text.UTF8Encoding]::new($false))
[Console]::Out.WriteLine(('O' * 12000))
[Console]::Error.WriteLine('fixture failure')
exit 17
'@
  [IO.File]::WriteAllText((Join-Path $scripts 'watch-codex-launches.ps1'), $fixture, [Text.UTF8Encoding]::new($true))
  $result = Join-Path $temporary 'arguments.json'
  $label = ([char]0x6E2C).ToString() + [char]0x8A66 + ' & ; $value % ! ^'
  $trailing = 'C:\folder with spaces\'
  $quoted = 'a"b\\'
  function Quote-QuietFixtureArgument {
    param([AllowEmptyString()][string]$Value)
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    return '"' + [regex]::Replace($escaped, '(\\+)$', '$1$1') + '"'
  }
  $arguments = @('watch', '-ResultPath', $result, '-Label', $label, '-Trailing', $trailing, '-Quoted', $quoted, '-EmptyValue', '')
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $executable
  $start.Arguments = (($arguments | ForEach-Object { Quote-QuietFixtureArgument -Value $_ }) -join ' ')
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $process = [Diagnostics.Process]::Start($start)
  $processes += $process
  if (-not $process.WaitForExit(30000)) { throw 'The quiet fixture did not exit.' }
  if ($process.ExitCode -ne 17) { throw "The launcher did not return the child exit code: $($process.ExitCode)" }
  $report = [IO.File]::ReadAllText($result) | ConvertFrom-Json
  if ($report.console -ne 0) { throw 'The child PowerShell process allocated a console window.' }
  if ($report.label -cne $label -or $report.trailing -cne $trailing -or $report.quoted -cne $quoted -or $report.empty -cne '') {
    throw 'Special, quoted, empty, or Unicode launcher arguments did not round-trip.'
  }
  $errorLog = [IO.File]::ReadAllText((Join-Path $scripts 'quiet-launcher-error.log'))
  if ($errorLog.Length -gt 4200 -or $errorLog -notmatch 'code 17') { throw 'The watch error diagnostic is missing or unbounded.' }

  $package = Join-Path $temporary 'package'
  $packageScripts = Join-Path $package 'scripts'
  New-Item -ItemType Directory -Path $packageScripts -Force | Out-Null
  $installer = Join-Path $package 'Install Xskin.exe'
  Copy-Item -LiteralPath $executable -Destination $installer
  [IO.File]::WriteAllText((Join-Path $packageScripts 'install-dream-skin.ps1'), "[IO.File]::WriteAllText((Join-Path `$PSScriptRoot 'installed.txt'), 'installed')", [Text.UTF8Encoding]::new($true))
  $start.FileName = $installer
  $start.Arguments = ''
  $process = [Diagnostics.Process]::Start($start)
  $processes += $process
  if (-not $process.WaitForExit(30000) -or $process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $packageScripts 'installed.txt'))) {
    throw 'The GUI installer did not run the fixed package install script by default.'
  }

  $tokens = $null
  $parseErrors = $null
  $tray = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\scripts\tray-dream-skin.ps1'), [ref]$tokens, [ref]$parseErrors)
  $operation = $tray.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Start-DreamSkinQuietOperation' }, $true)
  if ($parseErrors.Count -gt 0 -or -not $operation) { throw 'The tray quiet-operation boundary could not be loaded.' }
  & {
    param($FunctionText, $FixtureRoot, $FixtureLauncher)
    $StateRoot = $FixtureRoot
    $calls = New-Object 'Collections.Generic.List[object]'
    function Get-DreamSkinQuietLauncher {
      param($StateRoot)
      if ($StateRoot -cne $FixtureRoot) { throw 'The tray lost its managed state root.' }
      return $FixtureLauncher
    }
    function Start-Process {
      param($FilePath, $ArgumentList, $WindowStyle)
      $calls.Add([pscustomobject]@{ Path=$FilePath; Arguments=$ArgumentList; Style=$WindowStyle })
    }
    . ([scriptblock]::Create($FunctionText))
    foreach ($mode in @('start', 'restore')) {
      Start-DreamSkinQuietOperation -Mode $mode -Arguments @('-Port', '9335', '-PromptRestart', '-Name', 'saved & chosen')
      $call = $calls[$calls.Count - 1]
      $expected = $mode + ' -StateRoot "' + $FixtureRoot + '" -Port 9335 -PromptRestart -Name "saved & chosen"'
      if ($call.Path -cne $FixtureLauncher -or $call.Style -cne 'Hidden' -or $call.Arguments -cne $expected) {
        throw 'A tray operation lost its GUI launcher, hidden startup, state root, or forwarded arguments.'
      }
    }
    if ($calls.Count -ne 2) { throw 'The tray did not launch exactly one GUI host per operation.' }
  } $operation.Extent.Text $state $executable

  $previousHash = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash
  [IO.File]::WriteAllText($source, 'invalid C# source')
  [IO.File]::SetLastWriteTimeUtc($source, [IO.File]::GetLastWriteTimeUtc($executable).AddSeconds(2))
  $failed = $false
  try { $null = Get-DreamSkinQuietLauncher -StateRoot $state } catch { $failed = $true }
  if (-not $failed -or (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -cne $previousHash -or
    @(Get-ChildItem -LiteralPath $scripts -Filter '.xskin-quiet-*').Count -ne 0) {
    throw 'A failed launcher compilation damaged the old executable or left staging files.'
  }
} finally {
  foreach ($process in $processes) {
    if (-not $process.HasExited) { Stop-Process -InputObject $process -Force; $null = $process.WaitForExit(5000) }
    $process.Dispose()
  }
  $resolved = [IO.Path]::GetFullPath($temporary)
  if (-not $resolved.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected quiet fixture cleanup path.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
Write-Host 'PASS: GUI launcher, no child console, Unicode/quoted arguments, installer default, tray boundary, exit code and compiler rollback.'
