. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

function New-XskinImport {
  param(
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [string]$VideoPath,
    [string]$Name,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  Assert-DreamSkinImageFile -Path $ImagePath
  if ($VideoPath) { Assert-DreamSkinVideoFile -Path $VideoPath }
  $directory = Join-Path $StateRoot ('imports\' + [guid]::NewGuid().ToString('N'))
  Ensure-DreamSkinManagedDirectory -Path $directory -Root $StateRoot
  try {
  $imageName = 'background' + [System.IO.Path]::GetExtension($ImagePath).ToLowerInvariant()
  Copy-Item -LiteralPath $ImagePath -Destination (Join-Path $directory $imageName)
  $source = if ($VideoPath) { $VideoPath } else { $ImagePath }
  $name = if ($Name) { $Name } else { [System.IO.Path]::GetFileNameWithoutExtension($source) }
  $theme = [pscustomobject]@{
    id = 'xskin-' + [guid]::NewGuid().ToString('N')
    name = $name.Substring(0, [Math]::Min(80, $name.Length))
    image = $imageName
    layout = 'wallpaper'
    appearance = 'dark'
    maskOpacity = 0.62
    art = [pscustomobject]@{ focusX = 0.5; focusY = 0.5; safeArea = 'none'; taskMode = 'ambient' }
  }
  if ($VideoPath) {
    Copy-Item -LiteralPath $VideoPath -Destination (Join-Path $directory 'background.mp4')
    $theme | Add-Member -NotePropertyName video -NotePropertyValue 'background.mp4'
  }
  Write-DreamSkinTheme -ThemeDirectory $directory -Theme $theme
  return Read-DreamSkinTheme -ThemeDirectory $directory
  } catch {
    Remove-DreamSkinRuntimeTree -Path $directory -StateRoot $StateRoot
    throw
  }
}

function Convert-XskinImage {
  param([Parameter(Mandatory = $true)][string]$Source, [Parameter(Mandatory = $true)][string]$Destination)
  Assert-DreamSkinNoReparseComponents -Path $Source
  Assert-DreamSkinNoReparseComponents -Path $Destination
  if ([IO.Path]::GetExtension($Source).ToLowerInvariant() -notin @('.png','.jpg','.jpeg','.webp','.heic','.heif','.tif','.tiff')) {
    throw 'Choose MP4, PNG, JPEG, WebP, HEIC, or TIFF.'
  }
  $file = Get-Item -LiteralPath $Source
  if ($file.PSIsContainer -or $file.Length -lt 1 -or $file.Length -gt 50MB) { throw 'Images must be regular files no larger than 50 MiB.' }
  Add-Type -AssemblyName PresentationCore
  $stream = [IO.File]::Open($Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create($stream,
      [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat, [Windows.Media.Imaging.BitmapCacheOption]::OnDemand)
    $frame = $decoder.Frames[0]
    if ($frame.PixelWidth -lt 1 -or $frame.PixelHeight -lt 1 -or $frame.PixelWidth -gt 16384 -or
      $frame.PixelHeight -gt 16384 -or [long]$frame.PixelWidth * $frame.PixelHeight -gt 50000000) { throw 'Unsupported image dimensions (16384px / 50MP limit).' }
    $scale = [Math]::Min(1, 4096 / [double][Math]::Max($frame.PixelWidth, $frame.PixelHeight))
    $scaled = [Windows.Media.Imaging.TransformedBitmap]::new($frame, [Windows.Media.ScaleTransform]::new($scale,$scale))
    $encoder = [Windows.Media.Imaging.JpegBitmapEncoder]::new()
    $encoder.QualityLevel = 90
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($scaled))
    $output = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $encoder.Save($output) } finally { $output.Dispose() }
  } catch {
    throw "Image conversion failed. HEIC/HEIF requires a Windows image codec. $($_.Exception.Message)"
  } finally { $stream.Dispose() }
  Assert-DreamSkinImageFile -Path $Destination
}

function Read-XskinSettings {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  $file = Join-Path $StateRoot 'studio.json'
  Assert-DreamSkinNoReparseComponents -Path $file
  if (-not (Test-Path -LiteralPath $file)) { return [pscustomobject]@{} }
  $settings = (Read-DreamSkinUtf8File -Path $file) | ConvertFrom-Json
  if ($null -eq $settings -or $settings -is [array] -or $settings -is [string]) { throw 'Invalid studio settings.' }
  if ($settings.language -and $settings.language -notin @('en','zh-Hant','zh-Hans','ja')) { throw 'Unsupported saved language.' }
  return $settings
}

function Write-XskinSettings {
  param([Parameter(Mandatory = $true)][string]$StateRoot, [Parameter(Mandatory = $true)][hashtable]$Values)
  $settings = Read-XskinSettings -StateRoot $StateRoot
  foreach ($key in $Values.Keys) { $settings | Add-Member -NotePropertyName $key -NotePropertyValue $Values[$key] -Force }
  Write-DreamSkinUtf8FileAtomically -Path (Join-Path $StateRoot 'studio.json') -Content ($settings | ConvertTo-Json -Depth 5)
}

function Get-XskinLaunchShortcutPaths {
  return @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex (Xskin).lnk'),
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Codex (Xskin).lnk'))
}

function Test-XskinLaunchShortcut {
  param([object]$Link, [string]$StateRoot)
  return $Link.Description -ceq 'Xskin managed Codex shortcut' -and
    (Test-DreamSkinPathEqual -Left $Link.TargetPath -Right (Join-Path $StateRoot 'engine\scripts\xskin-quiet.exe')) -and
    (Test-DreamSkinPathEqual -Left $Link.WorkingDirectory -Right $StateRoot) -and
    $Link.Arguments -ceq (ConvertTo-DreamSkinArgumentLine -Arguments @('start', '-StateRoot', $StateRoot))
}

function Test-XskinLegacyLaunchShortcut {
  param([object]$Link, [string]$StateRoot)
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $StateRoot
  $arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $engine.Start + '"'
  return $Link.Description -ceq 'Xskin automatic Codex background launcher' -and
    (Test-DreamSkinPathEqual -Left $Link.TargetPath -Right (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')) -and
    (Test-DreamSkinPathEqual -Left $Link.WorkingDirectory -Right $engine.Root) -and $Link.Arguments -ceq $arguments
}

function Set-XskinLaunchShortcuts {
  param([string]$StateRoot, [switch]$Remove)
  $paths = @(Get-XskinLaunchShortcutPaths)
  # Check all entries before changing either one.
  foreach ($file in $paths) {
    Assert-DreamSkinNoReparseComponents -Path $file
    if (Test-Path -LiteralPath $file) {
      $link = Get-DreamSkinShortcut -Path $file
      if ((Test-XskinLaunchShortcut -Link $link -StateRoot $StateRoot) -or
        (Test-XskinLegacyLaunchShortcut -Link $link -StateRoot $StateRoot)) { continue }
      if ($Remove) { continue }
      throw "An unrelated shortcut already exists: $file. Rename it before installing Codex (Xskin)."
    }
  }
  $launcher = if (-not $Remove) { Get-DreamSkinQuietLauncher -StateRoot $StateRoot }
  $codex = if (-not $Remove) { Get-DreamSkinCodexInstall }
  foreach ($file in $paths) {
    if ($Remove) {
      if ((Test-Path -LiteralPath $file) -and
        ((Test-XskinLaunchShortcut -Link (Get-DreamSkinShortcut -Path $file) -StateRoot $StateRoot) -or
        (Test-XskinLegacyLaunchShortcut -Link (Get-DreamSkinShortcut -Path $file) -StateRoot $StateRoot))) {
        Remove-Item -LiteralPath $file -Force
      }
    } else {
      Set-DreamSkinShortcut -Path $file -TargetPath $launcher -WorkingDirectory $StateRoot -IconPath $codex.Executable `
        -Description 'Xskin managed Codex shortcut' -Arguments (ConvertTo-DreamSkinArgumentLine -Arguments @('start', '-StateRoot', $StateRoot))
    }
  }
}

function Get-XskinLegacyShortcutDefinitions {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $menu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  foreach ($folder in @($desktop, $menu)) {
    @{ Path = (Join-Path $folder 'Codex Dream Skin.lnk'); Mode = 'start'; Switches = @('-PromptRestart'); Description = 'Launch the official Codex app with Codex Dream Skin' }
    @{ Path = (Join-Path $folder 'Codex Dream Skin - Tray.lnk'); Mode = 'tray'; Switches = @(); Description = 'Open Codex Dream Skin status and theme controls in the system tray' }
  }
  @{ Path = (Join-Path $desktop 'Codex Dream Skin - Restore.lnk'); Mode = 'restore'; Switches = @('-RestoreBaseTheme', '-PromptRestart'); Description = 'Restore the official Codex appearance and close the CDP session' }
}

function Remove-XskinLegacyShortcuts {
  param([string]$StateRoot)
  $engine = Get-DreamSkinRuntimeEnginePaths -StateRoot $StateRoot
  foreach ($entry in Get-XskinLegacyShortcutDefinitions) {
    Assert-DreamSkinNoReparseComponents -Path $entry.Path
    if (-not (Test-Path -LiteralPath $entry.Path)) { continue }
    $link = Get-DreamSkinShortcut -Path $entry.Path
    if ($link.Description -cne $entry.Description -or
      -not (Test-DreamSkinPathEqual -Left $link.TargetPath -Right (Join-Path $engine.Scripts 'xskin-quiet.exe')) -or
      -not (Test-DreamSkinPathEqual -Left $link.WorkingDirectory -Right $engine.Root)) { continue }
    $arguments = $link.Arguments
    $port = [regex]::Match($arguments, ' -Port ([0-9]{4,5})$')
    if ($port.Success) {
      if ([int]$port.Groups[1].Value -lt 1024 -or [int]$port.Groups[1].Value -gt 65535) { continue }
      $arguments = $arguments.Substring(0, $port.Index)
    }
    $expected = ConvertTo-DreamSkinArgumentLine -Arguments (@($entry.Mode) + $entry.Switches + @('-StateRoot', $StateRoot))
    if ($arguments -ceq $expected) { Remove-Item -LiteralPath $entry.Path -Force }
  }
}

function Save-XskinStateRoot {
  param([string]$StateRoot)
  $path = Get-DreamSkinStateRootLocatorPath
  Assert-DreamSkinNoReparseComponents -Path $path
  if (Test-Path -LiteralPath $path) {
    if ((Get-Item -LiteralPath $path).Length -gt 256KB) { throw 'The Xskin store locator exceeds its size limit.' }
    $previous = (Read-DreamSkinUtf8File -Path $path) | ConvertFrom-Json
    if ($previous.owner -cne 'Xskin') { throw 'Refusing to overwrite an unrelated store locator.' }
  }
  Write-DreamSkinUtf8FileAtomically -Path $path -Content (@{ owner = 'Xskin'; stateRoot = $StateRoot } | ConvertTo-Json)
}

function Get-XskinAutostart {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  $enabled = (Read-XskinSettings -StateRoot $StateRoot).shortcutSkinEnabled -ne $false
  $loaded = @(Get-XskinLaunchShortcutPaths | Where-Object {
    (Test-Path -LiteralPath $_) -and (Test-XskinLaunchShortcut -Link (Get-DreamSkinShortcut -Path $_) -StateRoot $StateRoot)
  }).Count -eq 2
  return [pscustomobject]@{ Enabled = $enabled; Loaded = $loaded; Foreign = $false }
}

function Initialize-XskinAutostart {
  param([Parameter(Mandatory = $true)][string]$SkillRoot, [Parameter(Mandatory = $true)][string]$StateRoot)
  $settings = Read-XskinSettings -StateRoot $StateRoot
  if ($settings.launchSetupVersion -eq 2) { return }
  $legacy = Get-DreamSkinAutostart -StateRoot $StateRoot
  $enabled = -not $settings.automaticSetupComplete -or $legacy.Enabled
  Set-XskinAutostart -Enabled $enabled -SkillRoot $SkillRoot -StateRoot $StateRoot
}

function Set-XskinAutostart {
  param([Parameter(Mandatory = $true)][bool]$Enabled, [Parameter(Mandatory = $true)][string]$SkillRoot,
    [Parameter(Mandatory = $true)][string]$StateRoot)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  $null = Install-DreamSkinRuntimeEngine -SkillRoot $SkillRoot -StateRoot $StateRoot
  Set-XskinLaunchShortcuts -StateRoot $StateRoot
  # Persist the physical store before deleting the legacy task that used to locate it.
  Save-XskinStateRoot -StateRoot $StateRoot
  Remove-DreamSkinLegacyAutostart -StateRoot $StateRoot
  Write-XskinSettings -StateRoot $StateRoot -Values @{ launchSetupVersion = 2; shortcutSkinEnabled = $Enabled }
}

function Test-XskinApplied {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  if (Test-DreamSkinPaused -StateRoot $StateRoot) { return $false }
  $state = Read-DreamSkinState -Path (Join-Path $StateRoot 'state.json')
  if ($null -eq $state -or -not (Get-Process -Id $state.injectorPid -ErrorAction SilentlyContinue)) { return $false }
  $codex = Get-DreamSkinCodexInstallFromState -State $state
  if ($null -eq $codex) { return $false }
  $identity = Get-DreamSkinVerifiedCdpIdentity -Port $state.port -Codex $codex
  return $null -ne $identity -and $identity.BrowserId -ceq $state.browserId
}

function Set-XskinMask {
  param([Parameter(Mandatory = $true)][double]$Opacity, [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][scriptblock]$Apply)
  if ([double]::IsNaN($Opacity) -or [double]::IsInfinity($Opacity) -or $Opacity -lt 0 -or $Opacity -gt 1) {
    throw 'Mask opacity must be a number between 0 and 1.'
  }
  $active = Join-Path $StateRoot 'active-theme'
  $theme = Read-DreamSkinTheme -ThemeDirectory $active
  $previous = Read-DreamSkinUtf8File -Path $theme.ThemePath
  $theme.Theme | Add-Member -NotePropertyName maskOpacity -NotePropertyValue $Opacity -Force
  Write-DreamSkinTheme -ThemeDirectory $active -Theme $theme.Theme
  try { & $Apply | Out-Host } catch {
    $failure = $_
    Write-DreamSkinUtf8FileAtomically -Path $theme.ThemePath -Content $previous
    try { & $Apply | Out-Null } catch {}
    throw $failure
  }
}

function Invoke-XskinApply {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [Parameter(Mandatory = $true)][scriptblock]$Apply,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $operation = Enter-DreamSkinOperationLock
  $backup = Join-Path $StateRoot ('.xskin-rollback-' + [guid]::NewGuid().ToString('N'))
  $preserveBackup = $false
  try {
    if (-not (Test-DreamSkinThemePathWithin -Path $ThemeDirectory -Root $StateRoot)) {
      throw 'Select an imported or saved Xskin theme.'
    }
    $candidate = Read-DreamSkinTheme -ThemeDirectory $ThemeDirectory
    $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
    $previous = Read-DreamSkinTheme -ThemeDirectory $paths.Active
    $wasPaused = Test-DreamSkinPaused -StateRoot $StateRoot
    Ensure-DreamSkinManagedDirectory -Path $backup -Root $StateRoot
    Copy-Item -LiteralPath $previous.ImagePath -Destination $backup
    if ($previous.VideoPath) { Copy-Item -LiteralPath $previous.VideoPath -Destination $backup }
    Write-DreamSkinTheme -ThemeDirectory $backup -Theme $previous.Theme
    $previous = Read-DreamSkinTheme -ThemeDirectory $backup
    try {
      $null = Set-DreamSkinActiveTheme -ImagePath $candidate.ImagePath -VideoPath $candidate.VideoPath `
        -Theme $candidate.Theme -StateRoot $StateRoot
      & $Apply | Out-Host
    } catch {
      $applyError = $_
      try {
        $null = Set-DreamSkinActiveTheme -ImagePath $previous.ImagePath -VideoPath $previous.VideoPath `
          -Theme $previous.Theme -StateRoot $StateRoot
        $null = Set-DreamSkinPaused -Paused $wasPaused -StateRoot $StateRoot
      } catch {
        $preserveBackup = $true
        throw "Apply and rollback failed. Previous theme preserved at ${backup}: $($_.Exception.Message)"
      }
      throw $applyError
    }
  } finally {
    try {
      if (-not $preserveBackup -and (Test-Path -LiteralPath $backup)) {
        Remove-DreamSkinRuntimeTree -Path $backup -StateRoot $StateRoot
      }
    } finally { Exit-DreamSkinOperationLock -Mutex $operation }
  }
}
