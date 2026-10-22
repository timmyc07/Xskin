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

function Get-XskinAutostart {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  return Get-DreamSkinAutostart -StateRoot $StateRoot
}

function Initialize-XskinAutostart {
  param([Parameter(Mandatory = $true)][string]$SkillRoot, [Parameter(Mandatory = $true)][string]$StateRoot)
  if ((Read-XskinSettings -StateRoot $StateRoot).automaticSetupComplete -eq $true) { return }
  if (Test-DreamSkinPaused -StateRoot $StateRoot) {
    Write-XskinSettings -StateRoot $StateRoot -Values @{ automaticSetupComplete = $true }
    return
  }
  Set-XskinAutostart -Enabled $true -SkillRoot $SkillRoot -StateRoot $StateRoot
}

function Set-XskinAutostart {
  param([Parameter(Mandatory = $true)][bool]$Enabled, [Parameter(Mandatory = $true)][string]$SkillRoot,
    [Parameter(Mandatory = $true)][string]$StateRoot)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  $startup = Get-XskinAutostart -StateRoot $StateRoot
  if ($startup.Foreign) { throw 'Refusing to change an unrelated automatic-startup task.' }
  if ($Enabled) {
    $null = Get-DreamSkinCodexInstall
    $null = Install-DreamSkinRuntimeEngine -SkillRoot $SkillRoot -StateRoot $StateRoot
    Stop-DreamSkinAutostart -StateRoot $StateRoot
    $task = Get-DreamSkinAutostartTask
    $previous = if ($task) { $task.Xml } else { $null }
    try {
      Register-DreamSkinAutostartTask -StateRoot $StateRoot
      Start-DreamSkinAutostart -StateRoot $StateRoot
    } catch {
      $folder = Get-DreamSkinAutostartTaskFolder
      $name = Get-DreamSkinAutostartTaskName
      if ($null -ne $previous) {
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        $null = $folder.RegisterTask($name, $previous, 6, $sid, $null, 3)
      } elseif (Get-DreamSkinAutostartTask) { $folder.DeleteTask($name, 0) }
      throw
    }
  } else {
    Stop-DreamSkinAutostart -StateRoot $StateRoot
    if (Get-DreamSkinAutostartTask) {
      (Get-DreamSkinAutostartTaskFolder).DeleteTask((Get-DreamSkinAutostartTaskName), 0)
    }
  }
  $startupShortcut = Get-DreamSkinAutostartShortcutPath
  Assert-DreamSkinNoReparseComponents -Path $startupShortcut
  if (Test-Path -LiteralPath $startupShortcut) {
    $link = Get-DreamSkinShortcut -Path $startupShortcut
    if ($link.Description -ceq 'Xskin official Codex launch monitor' -and $link.WorkingDirectory) {
      $legacyArguments = ConvertTo-DreamSkinArgumentLine -Arguments @('-NoProfile', '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $link.WorkingDirectory 'engine\scripts\watch-codex-launches.ps1'),
        '-StateRoot', $link.WorkingDirectory)
      if ((Test-DreamSkinPathEqual -Left $link.TargetPath -Right (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')) -and
        $link.Arguments -ceq $legacyArguments -and
        (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $link.WorkingDirectory) -Right $StateRoot)) {
        Remove-Item -LiteralPath $startupShortcut -Force
      }
    }
  }
  # Remove only the previous Xskin-owned entry points when changing this preference.
  foreach ($file in Get-XskinLaunchShortcutPaths) {
    Assert-DreamSkinNoReparseComponents -Path $file
    if (-not (Test-Path -LiteralPath $file)) { continue }
    $link = Get-DreamSkinShortcut -Path $file
    if ($link.Description -ceq 'Xskin automatic Codex background launcher' -and
      (Test-DreamSkinCommandLineToken -CommandLine $link.Arguments -Token (Join-Path $StateRoot 'engine\scripts\start-dream-skin.ps1'))) {
      Remove-Item -LiteralPath $file -Force
    }
  }
  Write-XskinSettings -StateRoot $StateRoot -Values @{ automaticSetupComplete = $true }
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
