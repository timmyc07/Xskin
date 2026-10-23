. (Join-Path $PSScriptRoot 'config-utf8.ps1')

function Enter-DreamSkinOperationLock {
  param([int]$TimeoutMilliseconds = 0)
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Operation")
  $acquired = $false
  try {
    $acquired = $mutex.WaitOne($TimeoutMilliseconds)
  } catch [System.Threading.AbandonedMutexException] {
    $acquired = $true
  }
  if (-not $acquired) {
    $mutex.Dispose()
    throw 'Another Codex Dream Skin install, start, restore, or verify operation is already running.'
  }
  return $mutex
}

function Exit-DreamSkinOperationLock {
  param([Parameter(Mandatory = $true)][System.Threading.Mutex]$Mutex)
  try { $Mutex.ReleaseMutex() } finally { $Mutex.Dispose() }
}

function Assert-DreamSkinPort {
  param([Parameter(Mandatory = $true)][int]$Port)
  if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port must be between 1024 and 65535: $Port" }
}

function Test-DreamSkinPathEqual {
  param([string]$Left, [string]$Right)
  if (-not $Left -or -not $Right) { return $false }
  try {
    return ([System.IO.Path]::GetFullPath($Left).TrimEnd('\') -ieq [System.IO.Path]::GetFullPath($Right).TrimEnd('\'))
  } catch {
    return $false
  }
}

function Test-DreamSkinPathWithin {
  param([string]$Path, [string]$Root)
  if (-not $Path -or -not $Root) { return $false }
  try {
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $prefix = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    return $fullPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

function Get-DreamSkinStateRootLocatorPath {
  return Join-Path ([Environment]::GetFolderPath('UserProfile')) '.xskin-state-root.json'
}

function Resolve-DreamSkinStateRoot {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  $root = [IO.Path]::GetFullPath($StateRoot)
  if (Test-DreamSkinPathEqual -Left $root -Right (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')) {
    $managedRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $locator = $null
    $candidate = $null
    if ((Split-Path -Leaf (Split-Path -Parent $PSScriptRoot)) -ieq 'engine') {
      $candidate = $managedRoot
    } else {
      $locatorPath = Get-DreamSkinStateRootLocatorPath
      Assert-DreamSkinNoReparseComponents -Path $locatorPath
      if (Test-Path -LiteralPath $locatorPath) {
        if ((Get-Item -LiteralPath $locatorPath).Length -gt 256KB) { throw 'The Xskin store locator exceeds its size limit.' }
        $locator = (Read-DreamSkinUtf8File -Path $locatorPath) | ConvertFrom-Json
        if ($locator.owner -cne 'Xskin' -or $locator.stateRoot -isnot [string] -or -not $locator.stateRoot) { throw 'The Xskin store locator is invalid; it was preserved.' }
        $candidate = [string]$locator.stateRoot
      }
    }
    if ($candidate) {
      if (-not [IO.Path]::IsPathRooted($candidate)) { throw 'The saved Xskin state root is not absolute.' }
      Assert-DreamSkinNoReparseComponents -Path $candidate
      if (-not (Test-Path -LiteralPath (Join-Path $candidate 'active-theme\theme.json') -PathType Leaf)) {
        throw 'The saved Xskin store is missing; refusing to create an empty replacement.'
      }
      $root = [IO.Path]::GetFullPath($candidate)
    }
    if (-not $candidate) {
      $task = Get-DreamSkinAutostartTask
      if ($task -and $task.Definition.Actions.Count -eq 1) {
        $candidate = "$($task.Definition.Actions.Item(1).WorkingDirectory)"
        if ($candidate -and [IO.Path]::IsPathRooted($candidate) -and
          (Test-DreamSkinAutostartTask -Task $task -StateRoot $candidate)) {
          $launcher = Join-Path $candidate 'engine\scripts\xskin-quiet.exe'
          Assert-DreamSkinNoReparseComponents -Path $launcher
          if ((Test-Path -LiteralPath $launcher) -and -not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
            throw 'The Xskin quiet launcher is not an ordinary file.'
          }
          # Recover the physical MSIX store before retiring its old login task.
          $root = [IO.Path]::GetFullPath($candidate)
        }
      }
    }
  }
  $anchor = Join-Path $root 'active-theme\theme.json'
  Assert-DreamSkinNoReparseComponents -Path $anchor
  if (-not (Test-Path -LiteralPath $anchor -PathType Leaf)) { return $root }
  if (-not ('CodexDreamSkin.PhysicalPath' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
namespace CodexDreamSkin {
  public static class PhysicalPath {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandle(SafeFileHandle file, StringBuilder path, uint size, uint flags);
    public static string Read(string path) {
      using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete)) {
        var buffer = new StringBuilder(32768);
        uint length = GetFinalPathNameByHandle(file.SafeFileHandle, buffer, (uint)buffer.Capacity, 0);
        if (length == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
        if (length >= buffer.Capacity) throw new IOException("The physical state path exceeds the Windows path limit.");
        string result = buffer.ToString();
        if (result.StartsWith(@"\\?\UNC\")) return @"\\" + result.Substring(8);
        return result.StartsWith(@"\\?\") ? result.Substring(4) : result;
      }
    }
  }
}
'@
  }
  # MSIX can redirect individual files while their parent directory still resolves to the logical path.
  $physical = [CodexDreamSkin.PhysicalPath]::Read($anchor)
  $resolved = [IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($physical))
  Assert-DreamSkinNoReparseComponents -Path $resolved
  return $resolved
}

function Get-DreamSkinRuntimeEnginePaths {
  param([string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'))
  $root = Join-Path ([System.IO.Path]::GetFullPath($StateRoot)) 'engine'
  $scripts = Join-Path $root 'scripts'
  return [pscustomobject]@{
    Root = $root
    Scripts = $scripts
    Start = Join-Path $scripts 'start-dream-skin.ps1'
    Restore = Join-Path $scripts 'restore-dream-skin.ps1'
    Tray = Join-Path $scripts 'tray-dream-skin.ps1'
  }
}

function Test-DreamSkinTrayActive {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutex = [System.Threading.Mutex]::new($false, "Local\CodexDreamSkin.$sid.Tray")
  $acquired = $false
  try {
    try { $acquired = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] {
      $acquired = $true
    }
    if ($acquired) {
      $mutex.ReleaseMutex()
      $acquired = $false
      return $false
    }
    return $true
  } finally {
    if ($acquired) { try { $mutex.ReleaseMutex() } catch {} }
    $mutex.Dispose()
  }
}

function Assert-DreamSkinRuntimeTree {
  param([Parameter(Mandatory = $true)][string]$Path)
  $root = [System.IO.Path]::GetFullPath($Path)
  if (-not (Test-Path -LiteralPath $root -PathType Container)) {
    throw "Dream Skin runtime directory does not exist: $root"
  }
  if (-not (Get-Command Assert-DreamSkinNoReparseComponents -ErrorAction SilentlyContinue)) {
    throw 'Dream Skin managed-path validation is unavailable.'
  }
  Assert-DreamSkinNoReparseComponents -Path $root
  foreach ($item in Get-ChildItem -LiteralPath $root -Recurse -Force -ErrorAction Stop) {
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Dream Skin runtime contains a junction or symbolic link: $($item.FullName)"
    }
  }
}

function Remove-DreamSkinRuntimeTree {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$StateRoot
  )
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullStateRoot = [System.IO.Path]::GetFullPath($StateRoot)
  if (-not (Test-DreamSkinPathWithin -Path $fullPath -Root $fullStateRoot)) {
    throw "Refusing to remove a runtime path outside the Dream Skin state root: $fullPath"
  }
  if (-not (Test-Path -LiteralPath $fullPath)) { return }
  Assert-DreamSkinRuntimeTree -Path $fullPath
  Remove-Item -LiteralPath $fullPath -Recurse -Force -ErrorAction Stop
}

function Install-DreamSkinRuntimeEngine {
  param(
    [Parameter(Mandatory = $true)][string]$SkillRoot,
    [Parameter(Mandatory = $true)][string]$StateRoot
  )
  if (-not (Get-Command Ensure-DreamSkinManagedDirectory -ErrorAction SilentlyContinue)) {
    throw 'Dream Skin managed-directory validation is unavailable.'
  }

  $sourceRoot = [System.IO.Path]::GetFullPath($SkillRoot)
  $fullStateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $fullStateRoot
  $required = @(
    'VERSION',
    'assets\dream-reference.jpg',
    'assets\dream-skin.css',
    'assets\renderer-inject.js',
    'assets\token-overlay.js',
    'assets\theme.json',
    'scripts\common-windows.ps1',
    'scripts\autostart-windows.ps1',
    'scripts\watch-codex-launches.ps1',
    'scripts\config-utf8.ps1',
    'scripts\image-metadata.mjs',
    'scripts\injector.mjs',
    'scripts\token-usage.mjs',
    'scripts\quiet-launcher.cs',
    'scripts\install-dream-skin.ps1',
    'scripts\restore-dream-skin.ps1',
    'scripts\start-dream-skin.ps1',
    'scripts\theme-windows.ps1',
    'scripts\tray-dream-skin.ps1',
    'scripts\verify-dream-skin.ps1'
    'scripts\video-file.mjs',
    'scripts\xskin-theme.ps1',
    'scripts\xskin-command.ps1'
  )
  foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $relative) -PathType Leaf)) {
      throw "Dream Skin runtime source is incomplete: $relative"
    }
  }
  $runtimeDirectories = @('assets', 'scripts', 'presets')
  foreach ($directoryName in $runtimeDirectories) {
    $sourceDirectory = Join-Path $sourceRoot $directoryName
    if ((Test-DreamSkinPathEqual -Left $fullStateRoot -Right $sourceDirectory) -or
      (Test-DreamSkinPathWithin -Path $fullStateRoot -Root $sourceDirectory)) {
      throw "Dream Skin state root cannot be created inside its runtime source: $fullStateRoot"
    }
    Assert-DreamSkinRuntimeTree -Path $sourceDirectory
  }

  Ensure-DreamSkinManagedDirectory -Path $fullStateRoot -Root $fullStateRoot
  $token = [guid]::NewGuid().ToString('N')
  $stagingRoot = Join-Path $fullStateRoot ".engine-staging-$token"
  $backupRoot = Join-Path $fullStateRoot ".engine-backup-$token"
  Ensure-DreamSkinManagedDirectory -Path $stagingRoot -Root $fullStateRoot
  $resumeState = $null
  $resumeAutostart = $null

  try {
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'VERSION') -Destination $stagingRoot -ErrorAction Stop
    foreach ($directoryName in $runtimeDirectories) {
      Copy-Item -LiteralPath (Join-Path $sourceRoot $directoryName) -Destination $stagingRoot `
        -Recurse -Force -ErrorAction Stop
    }
    Assert-DreamSkinRuntimeTree -Path $stagingRoot
    foreach ($relative in $required) {
      if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot $relative) -PathType Leaf)) {
        throw "Staged Dream Skin runtime is incomplete: $relative"
      }
    }

    $sourcePrefix = $sourceRoot.TrimEnd('\') + '\'
    $sourceFiles = @(
      Get-ChildItem -LiteralPath (@((Join-Path $sourceRoot 'VERSION')) + @($runtimeDirectories | ForEach-Object { Join-Path $sourceRoot $_ })) `
        -Recurse -File -Force -ErrorAction Stop
    )
    $stagedFiles = @(
      Get-ChildItem -LiteralPath (@((Join-Path $stagingRoot 'VERSION')) + @($runtimeDirectories | ForEach-Object { Join-Path $stagingRoot $_ })) `
        -Recurse -File -Force -ErrorAction Stop
    )
    if ($sourceFiles.Count -ne $stagedFiles.Count) {
      throw 'Staged Dream Skin runtime file count does not match its source.'
    }
    foreach ($sourceFile in $sourceFiles) {
      $relative = $sourceFile.FullName.Substring($sourcePrefix.Length)
      $stagedFile = Join-Path $stagingRoot $relative
      if (-not (Test-Path -LiteralPath $stagedFile -PathType Leaf) -or
        (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile.FullName).Hash -cne
        (Get-FileHash -Algorithm SHA256 -LiteralPath $stagedFile).Hash) {
        throw "Staged Dream Skin runtime failed hash verification: $relative"
      }
    }

    $hasBackup = $false
    if (Test-Path -LiteralPath $engine.Root) {
      Assert-DreamSkinRuntimeTree -Path $engine.Root
      $previousState = Read-DreamSkinState -Path (Join-Path $fullStateRoot 'state.json')
      if ($null -ne $previousState -and $previousState.injectorPid -and $previousState.injectorPath -and
        (Test-DreamSkinPathEqual -Left $previousState.injectorPath -Right (Join-Path $engine.Scripts 'injector.mjs')) -and
        (Get-Process -Id $previousState.injectorPid -ErrorAction SilentlyContinue)) {
        # A running watcher's working directory prevents the engine directory swap on Windows.
        $null = Stop-DreamSkinRecordedInjector -State $previousState
        $resumeState = $previousState
      }
      $bundledNode = Join-Path $engine.Scripts 'node.exe'
      if (Test-Path -LiteralPath $bundledNode -PathType Leaf) {
        Copy-Item -LiteralPath $bundledNode -Destination (Join-Path $stagingRoot 'scripts\node.exe') -Force
      }
      $startupTask = Get-DreamSkinAutostartTask
      if ($startupTask -and $startupTask.Enabled -and (Test-DreamSkinAutostartTask -Task $startupTask -StateRoot $fullStateRoot)) {
        $resumeAutostart = $startupTask
        $startupTask.Enabled = $false
      }
      # Stop inherited pipe holders before the quiet host releases its executable.
      Stop-DreamSkinAutostart -StateRoot $fullStateRoot
      Move-Item -LiteralPath $engine.Root -Destination $backupRoot -ErrorAction Stop
      $hasBackup = $true
    }
    try {
      Move-Item -LiteralPath $stagingRoot -Destination $engine.Root -ErrorAction Stop
    } catch {
      $installError = $_.Exception.Message
      if ($hasBackup -and -not (Test-Path -LiteralPath $engine.Root)) {
        try {
          Move-Item -LiteralPath $backupRoot -Destination $engine.Root -ErrorAction Stop
          $hasBackup = $false
        } catch {
          throw "Dream Skin runtime update failed and its previous engine could not be restored. Backup preserved at ${backupRoot}: $installError"
        }
      }
      throw
    }
    if ($hasBackup) {
      try { Remove-DreamSkinRuntimeTree -Path $backupRoot -StateRoot $fullStateRoot } catch {
        try {
          Write-Warning "Installed the new runtime but could not remove its previous backup: $($_.Exception.Message)"
        } catch {
          # Cleanup must never make a committed runtime update look unsuccessful.
        }
      }
    }
    return Get-DreamSkinRuntimeEnginePaths -StateRoot $fullStateRoot
  } finally {
    try {
      if (Test-Path -LiteralPath $stagingRoot) {
        try { Remove-DreamSkinRuntimeTree -Path $stagingRoot -StateRoot $fullStateRoot } catch {
          try {
            Write-Warning "Could not remove the staged Dream Skin runtime: $($_.Exception.Message)"
          } catch {
            # Cleanup must never mask the runtime installation result.
          }
        }
      }
      if ($null -ne $resumeState) {
        $daemon = $null
        try {
          $resumeState.nodePath = (Get-DreamSkinNodeRuntime -RuntimePath (Join-Path $engine.Scripts 'node.exe')).Path
          $arguments = ConvertTo-DreamSkinArgumentLine -Arguments @(
            $resumeState.injectorPath, '--watch', '--port', "$($resumeState.port)",
            '--browser-id', $resumeState.browserId, '--theme-dir', (Join-Path $fullStateRoot 'active-theme'),
            '--pause-file', (Join-Path $fullStateRoot 'paused'))
          $daemon = Start-Process -FilePath $resumeState.nodePath -ArgumentList $arguments `
            -WorkingDirectory $fullStateRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $fullStateRoot 'injector.log') `
            -RedirectStandardError (Join-Path $fullStateRoot 'injector-error.log')
          Start-Sleep -Milliseconds 500
          if ($daemon.HasExited) { throw 'The background watcher exited while resuming the runtime update.' }
          $resumeState.injectorPid = $daemon.Id
          $resumeState.injectorStartedAt = Get-DreamSkinProcessStartedAt -ProcessId $daemon.Id
          if (-not $resumeState.injectorStartedAt) { throw 'The resumed watcher identity could not be recorded.' }
          Write-DreamSkinState -Path (Join-Path $fullStateRoot 'state.json') -State $resumeState
        } catch {
          if ($null -ne $daemon -and -not $daemon.HasExited) { Stop-Process -InputObject $daemon -Force }
          throw
        }
      }
    } finally {
      if ($resumeAutostart) {
        $resumeAutostart.Enabled = $true
        Start-DreamSkinAutostart -StateRoot $fullStateRoot
      }
    }
  }
}

function Test-DreamSkinCommandLineToken {
  param([string]$CommandLine, [string]$Token)
  if (-not $CommandLine -or -not $Token) { return $false }
  $pattern = '(?i)(?:^|[\s"])' + [regex]::Escape($Token) + '(?=$|[\s"])'
  return [regex]::IsMatch($CommandLine, $pattern)
}

function ConvertTo-DreamSkinProcessArgument {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)
  if ($Value.Contains('"')) { throw 'Process arguments containing a double quote are not supported.' }
  if ($Value.Length -eq 0) { return '""' }
  if ($Value -notmatch '\s') { return $Value }
  $escaped = [regex]::Replace($Value, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

function ConvertTo-DreamSkinArgumentLine {
  param([AllowEmptyCollection()][string[]]$Arguments = @())
  return (($Arguments | ForEach-Object { ConvertTo-DreamSkinProcessArgument -Value $_ }) -join ' ')
}

function Get-DreamSkinProcessExecutablePath {
  param([Parameter(Mandatory = $true)][object]$ProcessInfo)
  if ($ProcessInfo.ExecutablePath) { return "$($ProcessInfo.ExecutablePath)" }
  try {
    $process = Get-Process -Id ([int]$ProcessInfo.ProcessId) -ErrorAction Stop
    if ($process.Path) { return "$($process.Path)" }
    return "$($process.MainModule.FileName)"
  } catch {
    return $null
  }
}

# Windows PowerShell 5.1 promotes redirected native-command stderr lines to
# ErrorRecords; while $ErrorActionPreference is 'Stop' the first stderr line
# becomes a terminating NativeCommandError before the exit code can be read.
# Run the command with the preference relaxed and report output + exit code.
function Invoke-DreamSkinNative {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [switch]$DiscardStderr
  )
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($DiscardStderr) {
      $nativeOutput = @(& $FilePath @ArgumentList 2>$null)
    } else {
      $nativeOutput = @(& $FilePath @ArgumentList 2>&1)
    }
    $exitCode = $LASTEXITCODE
    $output = @($nativeOutput | ForEach-Object { "$_" })
    return [pscustomobject]@{ Output = $output; ExitCode = $exitCode }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

function Get-DreamSkinNodeRuntime {
  param([int]$MinimumMajor = 22, [string]$RuntimePath)

  $executable = if ($RuntimePath) { $RuntimePath } else { Join-Path $PSScriptRoot 'node.exe' }
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $command) { $command = Get-Command node -ErrorAction SilentlyContinue }
    if (-not $command) { throw "Node.js $MinimumMajor or newer is required for a source checkout." }
    $executable = $command.Source
  }
  $versionProbe = Invoke-DreamSkinNative -FilePath $executable -ArgumentList @('-p', 'process.versions.node') -DiscardStderr
  $version = ($versionProbe.Output -join '').Trim()
  if ($versionProbe.ExitCode -ne 0 -or -not $version) { throw 'The Node.js runtime could not be validated.' }
  $pathProbe = Invoke-DreamSkinNative -FilePath $executable -ArgumentList @('-p', 'process.execPath') -DiscardStderr
  $runtimePath = ($pathProbe.Output -join '').Trim()
  if ($pathProbe.ExitCode -ne 0 -or -not $runtimePath -or -not (Test-Path -LiteralPath $runtimePath)) {
    throw 'The Node.js executable path could not be validated.'
  }
  $major = 0
  if (-not [int]::TryParse(($version -split '\.')[0], [ref]$major) -or $major -lt $MinimumMajor) {
    throw "Node.js $MinimumMajor or newer is required; found $version at $runtimePath."
  }
  return [pscustomobject]@{ Path = $runtimePath; Version = $version; Major = $major }
}

function ConvertTo-DreamSkinCodexInstall {
  param(
    [Parameter(Mandatory = $true)][object]$Package,
    [AllowNull()][object]$Manifest
  )
  if ("$($Package.Name)" -ine 'OpenAI.Codex' -or -not $Package.InstallLocation -or
    -not $Package.PackageFullName -or -not $Package.PackageFamilyName -or
    "$($Package.SignatureKind)" -ine 'Store' -or [bool]$Package.IsDevelopmentMode) {
    return $null
  }
  $packageRoot = "$($Package.InstallLocation)"
  $executable = Join-Path $packageRoot 'app\ChatGPT.exe'
  if (-not (Test-Path -LiteralPath $executable)) { return $null }
  try {
    if (-not $PSBoundParameters.ContainsKey('Manifest')) {
      $Manifest = Get-AppxPackageManifest -Package $Package -ErrorAction Stop
    }
    $applications = @($Manifest.Package.Applications.Application | Where-Object {
      "$($_.Executable)".Replace('/', '\') -ieq 'app\ChatGPT.exe'
    })
    if ($applications.Count -ne 1) { return $null }
    $applicationId = "$($applications[0].Id)"
  } catch {
    return $null
  }
  $packageFamilyName = "$($Package.PackageFamilyName)"
  if ($packageFamilyName -cnotmatch '^[A-Za-z0-9._-]{1,128}$' -or
    $applicationId -cnotmatch '^[A-Za-z0-9._-]{1,64}$') {
    return $null
  }
  return [pscustomobject]@{
    PackageRoot = $packageRoot
    Executable = $executable
    Version = "$($Package.Version)"
    PackageFullName = "$($Package.PackageFullName)"
    PackageFamilyName = $packageFamilyName
    ApplicationId = $applicationId
    AppUserModelId = "$packageFamilyName!$applicationId"
    SignatureKind = "$($Package.SignatureKind)"
  }
}

function Get-DreamSkinRegisteredCodexInstalls {
  $packages = @(Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction Stop | Sort-Object Version -Descending)
  $installs = @()
  foreach ($package in $packages) {
    $install = ConvertTo-DreamSkinCodexInstall -Package $package
    if ($null -ne $install) { $installs += $install }
  }
  return $installs
}

function Get-DreamSkinCodexInstall {
  $installs = @(Get-DreamSkinRegisteredCodexInstalls)
  if ($installs.Count -eq 0) { throw 'The official OpenAI.Codex Store package is not installed or its identity cannot be validated.' }
  return $installs[0]
}

function Initialize-DreamSkinPackageLauncher {
  if ('CodexDreamSkin.PackageLauncher' -as [type]) { return }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace CodexDreamSkin {
  [Flags]
  internal enum ActivateOptions : uint {
    None = 0
  }

  [ComImport]
  [Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IApplicationActivationManager {
    [PreserveSig]
    int ActivateApplication(
      [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      [MarshalAs(UnmanagedType.LPWStr)] string arguments,
      ActivateOptions options,
      out uint processId);
  }

  [ComImport]
  [Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c")]
  internal class ApplicationActivationManager {}

  public static class PackageLauncher {
    public static uint Launch(string appUserModelId, string arguments) {
      var manager = (IApplicationActivationManager)new ApplicationActivationManager();
      try {
        uint processId;
        int result = manager.ActivateApplication(
          appUserModelId,
          arguments ?? string.Empty,
          ActivateOptions.None,
          out processId);
        Marshal.ThrowExceptionForHR(result);
        return processId;
      } finally {
        if (Marshal.IsComObject(manager)) Marshal.FinalReleaseComObject(manager);
      }
    }
  }
}
'@
}

function Start-DreamSkinCodex {
  param(
    [Parameter(Mandatory = $true)][object]$Codex,
    [AllowEmptyCollection()][string[]]$Arguments = @()
  )
  $appUserModelId = "$($Codex.AppUserModelId)"
  if ($appUserModelId -cnotmatch '^[A-Za-z0-9._-]{1,128}![A-Za-z0-9._-]{1,64}$') {
    throw 'The registered Codex AppUserModelId is unavailable or invalid.'
  }
  Initialize-DreamSkinPackageLauncher
  $argumentLine = ConvertTo-DreamSkinArgumentLine -Arguments $Arguments
  $processId = [CodexDreamSkin.PackageLauncher]::Launch($appUserModelId, $argumentLine)
  if ($processId -le 0) { throw 'Windows did not return a Codex process ID after package activation.' }
  return $processId
}

function Get-DreamSkinCodexStatePathCandidate {
  param([AllowNull()][object]$State)
  if ($null -eq $State -or -not $State.codexExe -or -not $State.codexPackageRoot) { return $null }
  $executable = "$($State.codexExe)"
  $packageRoot = "$($State.codexPackageRoot)"
  $expectedExecutable = Join-Path $packageRoot 'app\ChatGPT.exe'
  if (-not (Test-DreamSkinPathEqual -Left $executable -Right $expectedExecutable)) { return $null }
  return [pscustomobject]@{
    PackageRoot = $packageRoot
    Executable = $executable
    Version = "$($State.codexVersion)"
    FromState = $true
    RegisteredPackageVerified = $false
  }
}

function Resolve-DreamSkinCodexInstallFromState {
  param(
    [AllowNull()][object]$State,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$RegisteredInstalls
  )
  $candidate = Get-DreamSkinCodexStatePathCandidate -State $State
  if ($null -eq $candidate) { return $null }

  $hasFullName = [bool]$State.codexPackageFullName
  $hasFamilyName = [bool]$State.codexPackageFamilyName
  if ($hasFullName -xor $hasFamilyName) { return $null }
  foreach ($install in $RegisteredInstalls) {
    $pathMatches = (Test-DreamSkinPathEqual -Left $candidate.PackageRoot -Right $install.PackageRoot) -and
      (Test-DreamSkinPathEqual -Left $candidate.Executable -Right $install.Executable)
    if (-not $pathMatches) { continue }
    if ($hasFullName -and ("$($State.codexPackageFullName)" -ine $install.PackageFullName -or
      "$($State.codexPackageFamilyName)" -ine $install.PackageFamilyName)) {
      continue
    }
    return [pscustomobject]@{
      PackageRoot = $install.PackageRoot
      Executable = $install.Executable
      Version = $install.Version
      PackageFullName = $install.PackageFullName
      PackageFamilyName = $install.PackageFamilyName
      ApplicationId = $install.ApplicationId
      AppUserModelId = $install.AppUserModelId
      SignatureKind = $install.SignatureKind
      FromState = $true
      RegisteredPackageVerified = $true
    }
  }
  return $null
}

function Get-DreamSkinCodexInstallFromState {
  param([AllowNull()][object]$State)
  try { $installs = @(Get-DreamSkinRegisteredCodexInstalls) } catch { return $null }
  return Resolve-DreamSkinCodexInstallFromState -State $State -RegisteredInstalls $installs
}

function Test-DreamSkinWebSocketUrl {
  param([string]$Value, [int]$Port)
  try {
    $uri = [Uri]$Value
    $hostName = $uri.Host.ToLowerInvariant()
    return ($uri.IsAbsoluteUri -and $uri.Scheme -eq 'ws' -and $uri.Port -eq $Port -and
      $hostName -in @('127.0.0.1', 'localhost', '::1', '[::1]') -and -not $uri.UserInfo -and
      -not $uri.Query -and -not $uri.Fragment -and
      $uri.AbsolutePath -cmatch '^/devtools/(?:page|browser)/[A-Za-z0-9._-]{1,200}$')
  } catch {
    return $false
  }
}

function Test-DreamSkinCdpPageTarget {
  param([AllowNull()][object]$Target, [int]$Port)
  if ($null -eq $Target -or "$($Target.type)" -cne 'page' -or
    "$($Target.url)" -notlike 'app://*') {
    return $false
  }
  if ($Target.id -isnot [string]) { return $false }
  $targetId = "$($Target.id)"
  $webSocketUrl = "$($Target.webSocketDebuggerUrl)"
  if (-not (Test-DreamSkinBrowserId -Value $targetId) -or
    -not (Test-DreamSkinWebSocketUrl -Value $webSocketUrl -Port $Port)) {
    return $false
  }
  try {
    return ([Uri]$webSocketUrl).AbsolutePath -ceq "/devtools/page/$targetId"
  } catch {
    return $false
  }
}

function Get-DreamSkinCdpTargets {
  param([int]$Port)
  try {
    $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2 `
      -MaximumRedirection 0 -ErrorAction Stop
    return @($targets | Where-Object { Test-DreamSkinCdpPageTarget -Target $_ -Port $Port })
  } catch {
    return @()
  }
}

function Test-DreamSkinBrowserId {
  param([string]$Value)
  return [bool]($Value -and $Value.Length -le 200 -and $Value -cmatch '^[A-Za-z0-9._-]+$')
}

function Get-DreamSkinCdpBrowserIdentity {
  param([int]$Port)
  try {
    $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 `
      -MaximumRedirection 0 -ErrorAction Stop
    $webSocketUrl = "$($version.webSocketDebuggerUrl)"
    if (-not (Test-DreamSkinWebSocketUrl -Value $webSocketUrl -Port $Port)) { return $null }
    $uri = [Uri]$webSocketUrl
    $match = [regex]::Match($uri.AbsolutePath, '^/devtools/browser/(?<id>[A-Za-z0-9._-]{1,200})$')
    if (-not $match.Success -or $uri.Query -or $uri.Fragment) { return $null }
    $browserId = $match.Groups['id'].Value
    if (-not (Test-DreamSkinBrowserId -Value $browserId)) { return $null }
    return [pscustomobject]@{
      BrowserId = $browserId
      WebSocketDebuggerUrl = $webSocketUrl
      Browser = "$($version.Browser)"
    }
  } catch {
    return $null
  }
}

function Get-DreamSkinPortListeners {
  param([int]$Port)
  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    throw 'Get-NetTCPConnection is required to verify CDP listener ownership.'
  }
  return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Test-DreamSkinPortAvailable {
  param([int]$Port)
  return (Get-DreamSkinPortListeners -Port $Port).Count -eq 0
}

function Test-DreamSkinCodexPortOwner {
  param([int]$Port, [Parameter(Mandatory = $true)][object]$Codex)
  $listeners = Get-DreamSkinPortListeners -Port $Port
  if ($listeners.Count -eq 0) { return $false }
  foreach ($listener in $listeners) {
    if ($listener.LocalAddress -notin @('127.0.0.1', '::1')) { return $false }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$listener.OwningProcess)" -ErrorAction SilentlyContinue
    $processPath = if ($process) { Get-DreamSkinProcessExecutablePath -ProcessInfo $process } else { $null }
    if (-not $processPath -or -not (Test-DreamSkinPathEqual -Left $processPath -Right $Codex.Executable)) {
      return $false
    }
  }
  return $true
}

function Get-DreamSkinVerifiedCdpIdentity {
  param([int]$Port, [Parameter(Mandatory = $true)][object]$Codex)
  if (-not (Test-DreamSkinCodexPortOwner -Port $Port -Codex $Codex)) { return $null }
  $browser = Get-DreamSkinCdpBrowserIdentity -Port $Port
  if ($null -eq $browser) { return $null }
  $targets = Get-DreamSkinCdpTargets -Port $Port
  if ($targets.Count -eq 0) { return $null }
  if (-not (Test-DreamSkinCodexPortOwner -Port $Port -Codex $Codex)) { return $null }
  return [pscustomobject]@{
    BrowserId = $browser.BrowserId
    BrowserWebSocketDebuggerUrl = $browser.WebSocketDebuggerUrl
    Browser = $browser.Browser
    TargetCount = $targets.Count
  }
}

function Test-DreamSkinCodexCdpEndpoint {
  param([int]$Port, [Parameter(Mandatory = $true)][object]$Codex)
  return $null -ne (Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $Codex)
}

function Select-DreamSkinPort {
  param([int]$PreferredPort)
  for ($candidate = $PreferredPort; $candidate -le [Math]::Min(65535, $PreferredPort + 100); $candidate++) {
    if (Test-DreamSkinPortAvailable -Port $candidate) { return $candidate }
  }
  throw "No free loopback port was found between $PreferredPort and $([Math]::Min(65535, $PreferredPort + 100))."
}

function Wait-DreamSkinPortAvailable {
  param([int]$Port, [int]$TimeoutSeconds = 5)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    if (Test-DreamSkinPortAvailable -Port $Port) { return $true }
    Start-Sleep -Milliseconds 200
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Read-DreamSkinState {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try {
    $state = (Read-DreamSkinUtf8File -Path $Path) | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $state -or $state -is [string] -or $state -is [array]) { throw 'State root must be an object.' }
    $properties = @($state.PSObject.Properties.Name)
    if ($properties -contains 'platform' -and "$($state.platform)" -ine 'windows') {
      throw 'State platform is not Windows.'
    }
    $schemaVersion = 1
    if ($properties -contains 'schemaVersion') {
      $schemaVersion = 0
      if (-not [int]::TryParse("$($state.schemaVersion)", [ref]$schemaVersion) -or
        $schemaVersion -lt 1 -or $schemaVersion -gt 3) {
        throw 'State schema is not supported.'
      }
    }
    if ($schemaVersion -ge 3) {
      foreach ($required in @(
        'platform', 'port', 'injectorPid', 'injectorStartedAt', 'injectorPath', 'nodePath',
        'codexExe', 'codexPackageRoot', 'codexPackageFullName', 'codexPackageFamilyName', 'browserId'
      )) {
        if ($properties -notcontains $required -or -not $state.$required) {
          throw "State schema 3 is missing required field: $required"
        }
      }
    }
    if ($properties -contains 'port') {
      $statePort = 0
      if (-not [int]::TryParse("$($state.port)", [ref]$statePort)) { throw 'State port is invalid.' }
      Assert-DreamSkinPort -Port $statePort
    }
    if ($properties -contains 'injectorPid' -and $null -ne $state.injectorPid) {
      $statePid = 0
      if (-not [int]::TryParse("$($state.injectorPid)", [ref]$statePid) -or $statePid -le 0) {
        throw 'State injector PID is invalid.'
      }
    }
    if ($properties -contains 'browserId' -and $state.browserId -and
      -not (Test-DreamSkinBrowserId -Value "$($state.browserId)")) {
      throw 'State browser ID is invalid.'
    }
    return $state
  } catch {
    throw "Dream Skin state is unreadable; it was preserved for inspection: $Path"
  }
}

function Write-DreamSkinState {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][object]$State)
  $json = $State | ConvertTo-Json -Depth 6
  Write-DreamSkinUtf8FileAtomically -Path $Path -Content ($json + "`r`n")
}

function Archive-DreamSkinStateFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $directory = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($Path))
  $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss-fff')
  $archivePath = Join-Path $directory "state.stale-$stamp-$([guid]::NewGuid().ToString('N')).json"
  Move-Item -LiteralPath $Path -Destination $archivePath -ErrorAction Stop
  return $archivePath
}

function Get-DreamSkinProcessStartedAt {
  param([int]$ProcessId)
  try {
    return (Get-Process -Id $ProcessId -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')
  } catch {
    return $null
  }
}

function Stop-DreamSkinRecordedInjector {
  param([AllowNull()][object]$State, [switch]$CheckOnly)
  if ($null -eq $State -or -not $State.injectorPid) { return -not $CheckOnly }
  $processId = [int]$State.injectorPid
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
  if (-not $process) { return -not $CheckOnly }

  $expectedInjector = if ($State.injectorPath) {
    "$($State.injectorPath)"
  } elseif ($State.skillRoot) {
    Join-Path "$($State.skillRoot)" 'scripts\injector.mjs'
  } else {
    $null
  }
  $processPath = Get-DreamSkinProcessExecutablePath -ProcessInfo $process
  $commandLine = "$($process.CommandLine)"
  if (-not $processPath -or -not $commandLine) {
    throw "The recorded injector PID $processId is running, but its identity cannot be inspected. State was preserved."
  }
  $isNodeExecutable = [System.IO.Path]::GetFileName("$processPath") -ieq 'node.exe'
  $nodeMatches = -not $State.nodePath -or
    (Test-DreamSkinPathEqual -Left $processPath -Right "$($State.nodePath)")
  $injectorMatches = [bool]($expectedInjector -and
    (Test-DreamSkinCommandLineToken -CommandLine $commandLine -Token $expectedInjector) -and
    (Test-DreamSkinCommandLineToken -CommandLine $commandLine -Token '--watch'))
  if ($State.port) {
    $portPattern = '(?i)(?:^|\s)--port(?:=|\s+)' + [regex]::Escape("$($State.port)") + '(?=$|\s)'
    $injectorMatches = $injectorMatches -and [regex]::IsMatch($commandLine, $portPattern)
  } else {
    $injectorMatches = $false
  }
  if ($State.browserId) {
    $browserPattern = '(?:^|\s)(?i:--browser-id)(?:=|\s+)' + [regex]::Escape("$($State.browserId)") + '(?=$|\s)'
    $injectorMatches = $injectorMatches -and [regex]::IsMatch($commandLine, $browserPattern)
  }
  $startedAt = Get-DreamSkinProcessStartedAt -ProcessId $processId
  $startMatches = -not $State.injectorStartedAt -or
    ($startedAt -and [datetimeoffset]$startedAt -eq [datetimeoffset]$State.injectorStartedAt)
  $identityMatches = [bool]($isNodeExecutable -and $nodeMatches -and $injectorMatches -and $startMatches)

  if (-not $identityMatches) {
    throw "The recorded injector PID $processId is running, but its visible identity does not match the saved Dream Skin process. State was preserved."
  }

  if ($CheckOnly) { return $true }
  Stop-Process -Id $processId -Force -ErrorAction Stop
  try { Wait-Process -Id $processId -Timeout 5 -ErrorAction Stop } catch {}
  $remainingProcess = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($remainingProcess -and -not $remainingProcess.HasExited) {
    throw "The recorded Dream Skin injector did not stop: PID $processId"
  }
  return $true
}

function Get-DreamSkinCodexProcesses {
  param([Parameter(Mandatory = $true)][object]$Codex)
  return @(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $processPath = Get-DreamSkinProcessExecutablePath -ProcessInfo $_
      Test-DreamSkinPathEqual -Left $processPath -Right $Codex.Executable
    })
}

function Initialize-DreamSkinShortcut {
  if ('CodexDreamSkin.Shortcut' -as [type]) { return }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace CodexDreamSkin {
  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, IntPtr data, uint flags);
    void GetIDList(out IntPtr list);
    void SetIDList(IntPtr list);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int size);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int size);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
    void GetHotkey(out short hotkey);
    void SetHotkey(short hotkey);
    void GetShowCmd(out int command);
    void SetShowCmd(int command);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
    void Resolve(IntPtr window, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
  }

  public static class Shortcut {
    public sealed class Info {
      public string TargetPath;
      public string Arguments;
      public string WorkingDirectory;
      public string Description;
    }

    private static IShellLinkW Create() {
      return (IShellLinkW)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046")));
    }

    public static Info Read(string path) {
      var link = Create();
      try {
        ((IPersistFile)link).Load(path, 0);
        var text = new StringBuilder(32768);
        var info = new Info();
        link.GetPath(text, text.Capacity, IntPtr.Zero, 0);
        info.TargetPath = text.ToString();
        link.GetArguments(text.Clear(), text.Capacity);
        info.Arguments = text.ToString();
        link.GetWorkingDirectory(text.Clear(), text.Capacity);
        info.WorkingDirectory = text.ToString();
        link.GetDescription(text.Clear(), text.Capacity);
        info.Description = text.ToString();
        return info;
      } finally { Marshal.FinalReleaseComObject(link); }
    }

    public static void Save(string path, string target, string arguments, string directory, string description, string icon) {
      var link = Create();
      try {
        link.SetPath(target);
        link.SetArguments(arguments);
        link.SetWorkingDirectory(directory);
        link.SetDescription(description);
        link.SetShowCmd(7);
        if (!String.IsNullOrEmpty(icon)) link.SetIconLocation(icon, 0);
        string temporary = path + "." + Guid.NewGuid().ToString("N") + ".lnk";
        try {
          ((IPersistFile)link).Save(temporary, true);
          if (System.IO.File.Exists(path)) System.IO.File.Replace(temporary, path, null);
          else System.IO.File.Move(temporary, path);
        } finally {
          if (System.IO.File.Exists(temporary)) System.IO.File.Delete(temporary);
        }
      } finally { Marshal.FinalReleaseComObject(link); }
    }
  }
}
'@
}

function Get-DreamSkinShortcut {
  param([string]$Path)
  Initialize-DreamSkinShortcut
  return [CodexDreamSkin.Shortcut]::Read($Path)
}

function Set-DreamSkinShortcut {
  param([string]$Path, [string]$TargetPath, [string]$Arguments, [string]$WorkingDirectory, [string]$Description, [string]$IconPath)
  Initialize-DreamSkinShortcut
  [CodexDreamSkin.Shortcut]::Save($Path, $TargetPath, $Arguments, $WorkingDirectory, $Description, $IconPath)
}

function Request-DreamSkinCodexQuit {
  param([Parameter(Mandatory = $true)][object]$Process)
  if (-not ('CodexDreamSkin.RestartManager' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace CodexDreamSkin {
  public static class RestartManager {
    [StructLayout(LayoutKind.Sequential)]
    private struct UniqueProcess {
      public uint Id;
      public System.Runtime.InteropServices.ComTypes.FILETIME StartedAt;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmStartSession(out uint session, uint flags, StringBuilder key);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmRegisterResources(uint session, uint files, string[] paths,
      uint applications, UniqueProcess[] processes, uint services, string[] names);
    [DllImport("rstrtmgr.dll")]
    private static extern int RmShutdown(uint session, uint flags, IntPtr callback);
    [DllImport("rstrtmgr.dll")]
    private static extern int RmEndSession(uint session);

    private static void Check(int result) {
      if (result != 0) throw new Win32Exception(result);
    }

    public static void Quit(uint id, long startedAt) {
      uint session;
      Check(RmStartSession(out session, 0, new StringBuilder(33)));
      try {
        var process = new UniqueProcess {
          Id = id,
          StartedAt = new System.Runtime.InteropServices.ComTypes.FILETIME {
            dwLowDateTime = unchecked((int)startedAt),
            dwHighDateTime = (int)(startedAt >> 32)
          }
        };
        Check(RmRegisterResources(session, 0, null, 1, new[] { process }, 0, null));
        // WM_CLOSE only hides Codex; request session-end without RmForceShutdown.
        Check(RmShutdown(session, 0, IntPtr.Zero));
      } finally {
        RmEndSession(session);
      }
    }
  }
}
'@
  }
  [CodexDreamSkin.RestartManager]::Quit([uint32]$Process.Id, $Process.StartTime.ToUniversalTime().ToFileTimeUtc())
}

function Stop-DreamSkinCodex {
  param([Parameter(Mandatory = $true)][object]$Codex, [switch]$AllowForce)
  $processes = Get-DreamSkinCodexProcesses -Codex $Codex
  if ($processes.Count -eq 0) { return }
  foreach ($item in $processes | Where-Object { $_.CommandLine -and $_.CommandLine -notmatch '(?i)(?:^|[\s"])--type(?:[=\s"]|$)' }) {
    $process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
    if ($process -and $process.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId -and
      (Test-DreamSkinPathEqual -Left $process.Path -Right $Codex.Executable)) {
      try { Request-DreamSkinCodexQuit -Process $process } catch {
        if (-not $AllowForce) { throw }
      }
    }
  }

  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-DreamSkinCodexProcesses -Codex $Codex).Count -gt 0 -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
  }
  $remaining = Get-DreamSkinCodexProcesses -Codex $Codex
  if ($remaining.Count -eq 0) { return }
  if (-not $AllowForce) {
    throw 'Codex did not close within 15 seconds. Close it manually or explicitly authorize a forced restart.'
  }
  foreach ($item in $remaining) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$item.ProcessId)" -ErrorAction SilentlyContinue
    $currentPath = if ($current) { Get-DreamSkinProcessExecutablePath -ProcessInfo $current } else { $null }
    if ($currentPath -and (Test-DreamSkinPathEqual -Left $currentPath -Right $Codex.Executable)) {
      Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 500
  if ((Get-DreamSkinCodexProcesses -Codex $Codex).Count -gt 0) { throw 'Codex could not be stopped safely.' }
}

function Confirm-DreamSkinRestart {
  param([string]$Message)
  $shell = New-Object -ComObject WScript.Shell
  return $shell.Popup($Message, 0, 'Codex Dream Skin', 52) -eq 6
}

. (Join-Path $PSScriptRoot 'autostart-windows.ps1')

function Get-DreamSkinQuietLauncher {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  $scripts = Join-Path $StateRoot 'engine\scripts'
  $source = Join-Path $scripts 'quiet-launcher.cs'
  $executable = Join-Path $scripts 'xskin-quiet.exe'
  Assert-DreamSkinNoReparseComponents -Path $source
  Assert-DreamSkinNoReparseComponents -Path $executable
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'The Xskin quiet launcher source is missing; reinstall the complete package.' }
  if ((Test-Path -LiteralPath $executable -PathType Leaf) -and
    [IO.File]::GetLastWriteTimeUtc($executable) -ge [IO.File]::GetLastWriteTimeUtc($source)) { return $executable }

  $compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The Windows .NET Framework C# compiler is unavailable.' }
  $temporary = Join-Path $scripts ('.xskin-quiet-' + [guid]::NewGuid().ToString('N') + '.exe')
  try {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $compiler
    $start.Arguments = ConvertTo-DreamSkinArgumentLine -Arguments @('/nologo', '/target:winexe',
      '/reference:System.Windows.Forms.dll', "/out:$temporary", $source)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    try {
      $process.StartInfo = $start
      $null = $process.Start()
      $output = $process.StandardOutput.ReadToEndAsync()
      $errors = $process.StandardError.ReadToEndAsync()
      $process.WaitForExit()
      $diagnostic = ($output.Result + $errors.Result).Trim()
      if ($diagnostic.Length -gt 4096) { $diagnostic = $diagnostic.Substring(0, 4096) }
      if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $temporary -PathType Leaf)) {
        throw "The Xskin quiet launcher could not be compiled: $diagnostic"
      }
    } finally { $process.Dispose() }
    if (Test-Path -LiteralPath $executable) { [IO.File]::Replace($temporary, $executable, [NullString]::Value) }
    else { [IO.File]::Move($temporary, $executable) }
    return $executable
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  }
}
