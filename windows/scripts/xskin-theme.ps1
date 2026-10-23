. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

function New-XskinFailure {
  param([Parameter(Mandatory = $true)][string]$Code, [Parameter(Mandatory = $true)][string]$Message)
  $failure = [InvalidOperationException]::new($Message)
  $failure.Data['errorCode'] = $Code
  return $failure
}

function New-XskinImport {
  param(
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [string]$VideoPath,
    [string]$Name,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  Assert-DreamSkinImageFile -Path $ImagePath
  if ($VideoPath) {
    try {
      Assert-DreamSkinNoReparseComponents -Path $VideoPath
      $video = Get-Item -LiteralPath $VideoPath -ErrorAction Stop
    } catch {
      $code = if ($_.CategoryInfo.Category -eq 'PermissionDenied') { 'fileAccessDenied' } else { 'invalidLocalFile' }
      throw (New-XskinFailure -Code $code -Message $_.Exception.Message)
    }
    if ($video.PSIsContainer -or $video.Length -lt 1 -or $video.Length -gt 256MB) {
      throw (New-XskinFailure -Code videoSizeLimit -Message 'MP4 must be a regular file no larger than 256 MiB.')
    }
    try { Assert-DreamSkinVideoFile -Path $VideoPath }
    catch { throw (New-XskinFailure -Code invalidVideo -Message $_.Exception.Message) }
  }
  $directory = Join-Path $StateRoot ('imports\' + [guid]::NewGuid().ToString('N'))
  Ensure-DreamSkinManagedDirectory -Path $directory -Root $StateRoot
  try {
  $imageName = 'background' + [System.IO.Path]::GetExtension($ImagePath).ToLowerInvariant()
  Copy-Item -LiteralPath $ImagePath -Destination (Join-Path $directory $imageName)
  $source = if ($VideoPath) { $VideoPath } else { $ImagePath }
  $name = if ($Name) { $Name } else { [System.IO.Path]::GetFileNameWithoutExtension($source) }
  $theme = [pscustomobject]@{
    id = 'xskin-' + [guid]::NewGuid().ToString('N')
    name = $name
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
  try {
    Assert-DreamSkinNoReparseComponents -Path $Source
    $file = Get-Item -LiteralPath $Source -ErrorAction Stop
  } catch {
    $code = if ($_.CategoryInfo.Category -eq 'PermissionDenied') { 'fileAccessDenied' } else { 'invalidLocalFile' }
    throw (New-XskinFailure -Code $code -Message $_.Exception.Message)
  }
  Assert-DreamSkinNoReparseComponents -Path $Destination
  if ([IO.Path]::GetExtension($Source).ToLowerInvariant() -notin @('.png','.jpg','.jpeg','.webp','.heic','.heif','.tif','.tiff')) {
    throw (New-XskinFailure -Code unsupportedFormat -Message 'Choose MP4, PNG, JPEG, WebP, HEIC, or TIFF.')
  }
  if ($file.PSIsContainer -or $file.Length -lt 1 -or $file.Length -gt 50MB) {
    throw (New-XskinFailure -Code imageSizeLimit -Message 'Images must be regular files no larger than 50 MiB.')
  }
  Add-Type -AssemblyName PresentationCore
  $stream = [IO.File]::Open($Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create($stream,
      [Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat, [Windows.Media.Imaging.BitmapCacheOption]::OnDemand)
    $frame = $decoder.Frames[0]
    if ($frame.PixelWidth -lt 1 -or $frame.PixelHeight -lt 1 -or $frame.PixelWidth -gt 16384 -or
      $frame.PixelHeight -gt 16384 -or [long]$frame.PixelWidth * $frame.PixelHeight -gt 50000000) {
      throw (New-XskinFailure -Code imageDimensions -Message 'Unsupported image dimensions (16384px / 50MP limit).')
    }
    $scale = [Math]::Min(1, 4096 / [double][Math]::Max($frame.PixelWidth, $frame.PixelHeight))
    $scaled = [Windows.Media.Imaging.TransformedBitmap]::new($frame, [Windows.Media.ScaleTransform]::new($scale,$scale))
    $encoder = [Windows.Media.Imaging.JpegBitmapEncoder]::new()
    $encoder.QualityLevel = 90
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($scaled))
    $output = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $encoder.Save($output) } finally { $output.Dispose() }
  } catch {
    if ($_.Exception.Data['errorCode']) { throw }
    throw (New-XskinFailure -Code imageConversion -Message "Image conversion failed. HEIC/HEIF requires a Windows image codec. $($_.Exception.Message)")
  } finally { $stream.Dispose() }
  Assert-DreamSkinImageFile -Path $Destination
}

function Read-XskinSettings {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  $file = Join-Path $StateRoot 'studio.json'
  Assert-DreamSkinNoReparseComponents -Path $file
  if (-not (Test-Path -LiteralPath $file)) { return [pscustomobject]@{} }
  $settings = (Read-DreamSkinUtf8File -Path $file) | ConvertFrom-Json
  if ($null -eq $settings -or $settings -is [array] -or $settings -is [string]) { throw (New-XskinFailure -Code invalidStudio -Message 'Invalid studio settings.') }
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
  $enabled = (Read-XskinSettings -StateRoot $StateRoot).shortcutSkinEnabled -eq $true
  $startup = Get-DreamSkinAutostart -StateRoot $StateRoot
  return [pscustomobject]@{ Enabled = $enabled; Loaded = $startup.Loaded; Foreign = $startup.Foreign }
}

function Initialize-XskinAutostart {
  param([Parameter(Mandatory = $true)][string]$SkillRoot, [Parameter(Mandatory = $true)][string]$StateRoot)
  $settings = Read-XskinSettings -StateRoot $StateRoot
  if ($settings.launchSetupVersion -eq 3) { return }
  $legacy = Get-DreamSkinAutostart -StateRoot $StateRoot
  $enabled = if ($null -ne $settings.shortcutSkinEnabled) { [bool]$settings.shortcutSkinEnabled } else {
    -not $settings.automaticSetupComplete -or $legacy.Enabled
  }
  Set-XskinAutostart -Enabled $enabled -SkillRoot $SkillRoot -StateRoot $StateRoot
}

function Set-XskinAutostart {
  param([Parameter(Mandatory = $true)][bool]$Enabled, [Parameter(Mandatory = $true)][string]$SkillRoot,
    [Parameter(Mandatory = $true)][string]$StateRoot)
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  if ((Get-DreamSkinAutostart -StateRoot $StateRoot).Foreign) { throw 'Refusing to change an unrelated automatic-startup task.' }
  $null = Install-DreamSkinRuntimeEngine -SkillRoot $SkillRoot -StateRoot $StateRoot
  Set-XskinLaunchShortcuts -StateRoot $StateRoot
  # Persist the physical store before deleting the legacy task that used to locate it.
  Save-XskinStateRoot -StateRoot $StateRoot
  if ($Enabled) { Enable-DreamSkinAutostart -StateRoot $StateRoot }
  else { Disable-DreamSkinAutostart -StateRoot $StateRoot }
  Write-XskinSettings -StateRoot $StateRoot -Values @{ launchSetupVersion = 3; shortcutSkinEnabled = $Enabled }
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

function Start-XskinTransaction {
  param([string]$StateRoot, [string]$Next)
  $active = Join-Path $StateRoot 'active-theme'
  $previous = Read-DreamSkinTheme -ThemeDirectory $active
  if ($previous.Theme.PSObject.Properties['xskinTransaction']) {
    throw (New-XskinFailure -Code invalidBackground -Message 'The active background contains transaction metadata.')
  }
  $journal = Join-Path $active '.xskin-transaction.json'
  Assert-DreamSkinNoReparseComponents -Path $journal
  if (Test-Path -LiteralPath $journal) { throw (New-XskinFailure -Code operationBusy -Message 'Recover the interrupted background operation first.') }
  $previous.Theme | Add-Member -NotePropertyName xskinTransaction -NotePropertyValue @{
    schemaVersion = 1
    previous = Read-DreamSkinUtf8File -Path $previous.ThemePath
    next = $Next
    paused = Test-DreamSkinPaused -StateRoot $StateRoot
  }
  $json = $previous.Theme | ConvertTo-Json -Depth 12
  if ([Text.Encoding]::UTF8.GetByteCount($json) -gt 1MB) {
    throw (New-XskinFailure -Code invalidBackground -Message 'Background transaction metadata exceeds its size limit.')
  }
  Write-DreamSkinUtf8FileAtomically -Path $journal -Content $json
}

function Repair-XskinTransaction {
  param([Parameter(Mandatory = $true)][string]$StateRoot)
  $active = Join-Path $StateRoot 'active-theme'
  $journal = Join-Path $active '.xskin-transaction.json'
  try {
    Assert-DreamSkinNoReparseComponents -Path $journal
    if (-not (Test-Path -LiteralPath $journal)) { return $false }
    $file = Get-Item -LiteralPath $journal
    if ($file.PSIsContainer -or $file.Length -lt 1 -or $file.Length -gt 1MB) { throw 'Invalid transaction file.' }
    $saved = Read-DreamSkinTheme -ThemeDirectory $active -ThemeFile '.xskin-transaction.json'
    $transaction = $saved.Theme.xskinTransaction
    if ($null -eq $transaction -or $transaction.schemaVersion -ne 1 -or
      (($transaction.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'next,paused,previous,schemaVersion' -or
      $transaction.previous -isnot [string] -or $transaction.next -isnot [string] -or $transaction.paused -isnot [bool]) {
      throw 'Invalid background transaction.'
    }
    $previous = $transaction.previous | ConvertFrom-Json
    $next = $transaction.next | ConvertFrom-Json
    if ($null -eq $previous -or $null -eq $next -or $previous -is [array] -or $next -is [array] -or
      -not $previous.image -or -not $next.image -or $previous.PSObject.Properties['xskinTransaction'] -or
      $next.PSObject.Properties['xskinTransaction']) { throw 'Invalid background transaction settings.' }
    $saved.Theme.PSObject.Properties.Remove('xskinTransaction')
    if (($saved.Theme | ConvertTo-Json -Depth 12 -Compress) -cne ($previous | ConvertTo-Json -Depth 12 -Compress)) {
      throw 'The saved background does not match its transaction.'
    }
    $current = Read-DreamSkinUtf8File -Path (Join-Path $active 'theme.json')
    if ($current -cne $transaction.previous -and $current -cne $transaction.next) {
      throw 'The current background was changed outside the interrupted operation.'
    }
    Write-DreamSkinUtf8FileAtomically -Path (Join-Path $active 'theme.json') -Content $transaction.previous
    $null = Set-DreamSkinPaused -Paused $transaction.paused -StateRoot $StateRoot
    Remove-Item -LiteralPath $journal -Force
    return $true
  } catch { throw (New-XskinFailure -Code invalidBackground -Message $_.Exception.Message) }
}

function Set-XskinMask {
  param([Parameter(Mandatory = $true)][double]$Opacity, [Parameter(Mandatory = $true)][string]$StateRoot,
    [Parameter(Mandatory = $true)][scriptblock]$Apply)
  if ([double]::IsNaN($Opacity) -or [double]::IsInfinity($Opacity) -or $Opacity -lt 0 -or $Opacity -gt 1) {
    throw (New-XskinFailure -Code invalidMask -Message 'Mask opacity must be a number between 0 and 1.')
  }
  $active = Join-Path $StateRoot 'active-theme'
  $theme = Read-DreamSkinTheme -ThemeDirectory $active
  $theme.Theme | Add-Member -NotePropertyName maskOpacity -NotePropertyValue $Opacity -Force
  $next = ($theme.Theme | ConvertTo-Json -Depth 8) + "`r`n"
  Start-XskinTransaction -StateRoot $StateRoot -Next $next
  try {
    Write-DreamSkinUtf8FileAtomically -Path $theme.ThemePath -Content $next
    & $Apply | Out-Host
    Remove-Item -LiteralPath (Join-Path $active '.xskin-transaction.json') -Force
  } catch {
    $failure = $_
    try { $null = Repair-XskinTransaction -StateRoot $StateRoot }
    catch { throw (New-XskinFailure -Code maskFailedUnrestored -Message $_.Exception.Message) }
    if (-not (Test-DreamSkinPaused -StateRoot $StateRoot)) {
      try { & $Apply | Out-Null } catch {}
    }
    throw (New-XskinFailure -Code maskFailedRestored -Message $failure.Exception.Message)
  }
}

function Invoke-XskinApply {
  param(
    [Parameter(Mandatory = $true)][string]$ThemeDirectory,
    [Parameter(Mandatory = $true)][scriptblock]$Apply,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  $operation = Enter-DreamSkinOperationLock
  try {
    if (-not (Test-DreamSkinThemePathWithin -Path $ThemeDirectory -Root $StateRoot)) {
      throw 'Select an imported or saved Xskin theme.'
    }
    $candidate = Read-DreamSkinTheme -ThemeDirectory $ThemeDirectory
    $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
    $previous = Read-DreamSkinTheme -ThemeDirectory $paths.Active
    $newFiles = @()
    try {
      foreach ($source in @($candidate.ImagePath, $candidate.VideoPath)) {
        if (-not $source) { continue }
        $name = New-DreamSkinThemeImageName -Extension ([IO.Path]::GetExtension($source))
        $target = Join-Path $paths.Active $name
        Assert-DreamSkinNoReparseComponents -Path $target
        Copy-Item -LiteralPath $source -Destination $target -ErrorAction Stop
        $newFiles += $target
        $property = if ($source -ceq $candidate.ImagePath) { 'image' } else { 'video' }
        $candidate.Theme | Add-Member -NotePropertyName $property -NotePropertyValue $name -Force
      }
      $next = ($candidate.Theme | ConvertTo-Json -Depth 8) + "`r`n"
      Start-XskinTransaction -StateRoot $StateRoot -Next $next
      Write-DreamSkinUtf8FileAtomically -Path (Join-Path $paths.Active 'theme.json') -Content $next
      & $Apply | Out-Host
      Remove-Item -LiteralPath (Join-Path $paths.Active '.xskin-transaction.json') -Force
    } catch {
      $applyError = $_
      try {
        $null = Repair-XskinTransaction -StateRoot $StateRoot
      } catch {
        throw (New-XskinFailure -Code applyFailedUnrestored -Message $_.Exception.Message)
      }
      foreach ($file in $newFiles) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
      if (-not (Test-DreamSkinPaused -StateRoot $StateRoot)) {
        try { & $Apply | Out-Null } catch {}
      }
      throw (New-XskinFailure -Code applyFailedRestored -Message $applyError.Exception.Message)
    }
    foreach ($file in @($previous.ImagePath, $previous.VideoPath)) {
      if ($file) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
    }
  } finally {
    Exit-DreamSkinOperationLock -Mutex $operation
  }
}
