[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('state','status','recover','import','apply','mask','autostart','preferences','pause','resume','launch','restore','save','select')][string]$Action,
  [Parameter(Mandatory = $true)][string]$RequestPath,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'),
  [switch]$Embedded
)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
. (Join-Path $PSScriptRoot 'xskin-theme.ps1')

function Get-XskinPanelState {
  $version = (Read-DreamSkinUtf8File -Path (Join-Path (Split-Path -Parent $PSScriptRoot) 'VERSION')).Trim()
  if (-not (Test-Path -LiteralPath (Join-Path $paths.Active 'theme.json') -PathType Leaf)) {
    $settings = Read-XskinSettings -StateRoot $StateRoot
    return @{ version = $version; stateRoot = $StateRoot; needsSetup = $true; pendingRecovery = $false;
      maskOpacity = 0.62; autostart = $false; autostartLoaded = $false;
      language = if ($settings.language) { $settings.language } else { 'en' };
      activeImagePath = $null; activeVideoPath = $null; activeBytes = $null; activeName = $null;
      pending = $false; paused = $false; applied = $false; selectionId = $null }
  }
  $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata
  $preview = $active
  $pending = $false
  if (Test-Path -LiteralPath $settingsPath) {
    Assert-DreamSkinNoReparseComponents -Path $settingsPath
    $settings = Read-XskinSettings -StateRoot $StateRoot
    if ($settings.pending -match '^[a-f0-9]{32}$') {
      $preview = Read-DreamSkinTheme -ThemeDirectory (Join-Path $StateRoot ('imports\' + $settings.pending)) -SkipImageMetadata
      $pending = $true
    }
  }
  $media = if ($preview.VideoPath) { $preview.VideoPath } else { $preview.ImagePath }
  $startup = Get-XskinAutostart -StateRoot $StateRoot
  $settings = Read-XskinSettings -StateRoot $StateRoot
  return @{
    version = $version
    stateRoot = $StateRoot
    needsSetup = $false
    pendingRecovery = Test-Path -LiteralPath (Join-Path $paths.Active '.xskin-transaction.json')
    selectionId = if ($pending) { $settings.pending } else { $null }
    directory = $preview.Directory
    name = $preview.Theme.name
    imagePath = $preview.ImagePath
    videoPath = $preview.VideoPath
    bytes = (Get-Item -LiteralPath $media).Length
    maskOpacity = if ($null -ne $active.Theme.maskOpacity) { $active.Theme.maskOpacity } else { 0.62 }
    activeName = $active.Theme.name
    activeImagePath = $active.ImagePath
    activeVideoPath = $active.VideoPath
    activeBytes = (Get-Item -LiteralPath $(if ($active.VideoPath) { $active.VideoPath } else { $active.ImagePath })).Length
    applied = Test-XskinApplied -StateRoot $StateRoot
    autostart = $startup.Enabled
    autostartLoaded = $startup.Loaded
    language = if ($settings.language) { $settings.language } else { 'en' }
    pending = $pending
    paused = Test-DreamSkinPaused -StateRoot $StateRoot
    saved = @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata | ForEach-Object {
      @{ id = $_.Id; name = $_.Name; directory = $_.Path }
    })
  }
}

try {
  Assert-DreamSkinNoReparseComponents -Path $RequestPath
  if ((Get-Item -LiteralPath $RequestPath).Length -gt 24MB) { throw (New-XskinFailure -Code invalidCommand -Message 'Panel request exceeds the size limit.') }
  $inputText = Read-DreamSkinUtf8File -Path $RequestPath
  $request = if ($inputText.Trim()) { $inputText | ConvertFrom-Json } else { [pscustomobject]@{} }
  if ($request -is [array] -or $request -is [string] -or $null -eq $request) { throw (New-XskinFailure -Code invalidCommand -Message 'Panel request must be an object.') }
  if ($Embedded -and $Action -notin @('status','recover','import','apply','mask','autostart','pause','resume','preferences')) {
    throw (New-XskinFailure -Code invalidCommand -Message 'This operation is unavailable in the embedded panel.')
  }
  if ($Action -ne 'status') {
    try { $panelOperation = Enter-DreamSkinOperationLock }
    catch { throw (New-XskinFailure -Code operationBusy -Message $_.Exception.Message) }
  }
  $StateRoot = Resolve-DreamSkinStateRoot -StateRoot $StateRoot
  $paths = Get-DreamSkinThemePaths -StateRoot $StateRoot
  $settingsPath = Join-Path $StateRoot 'studio.json'
  Assert-DreamSkinNoReparseComponents -Path $settingsPath
  if ($Embedded -and $Action -eq 'preferences') {
    Ensure-DreamSkinManagedDirectory -Path $StateRoot -Root $StateRoot
  } elseif ($Action -notin @('status','recover')) {
    if ($Embedded -and $Action -eq 'import') {
      $null = Install-DreamSkinRuntimeEngine -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
    }
    $paths = Initialize-DreamSkinThemeStore -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
    $null = Repair-XskinTransaction -StateRoot $StateRoot
  }
  $messageCode = $null
  switch ($Action) {
    'status' { }
    'recover' { $recovered = Repair-XskinTransaction -StateRoot $StateRoot }
    'state' { Initialize-XskinAutostart -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot }
    'import' {
      $videoPath = $null
      $converted = $null
      try {
        if (-not $request.path -or -not [IO.Path]::IsPathRooted([string]$request.path)) {
          throw (New-XskinFailure -Code invalidLocalFile -Message 'Select an absolute local file path.')
        }
        $source = [IO.Path]::GetFullPath([string]$request.path)
        if ([IO.Path]::GetFileName($source).Length -gt 240) {
          throw (New-XskinFailure -Code invalidLocalFile -Message 'The local filename exceeds 240 characters.')
        }
        $imagePath = $source
        if ([System.IO.Path]::GetExtension($imagePath) -ieq '.mp4') {
          $videoPath = $imagePath
          $imagePath = (Read-DreamSkinTheme -ThemeDirectory $paths.Active -SkipImageMetadata).ImagePath
        } else {
          $converted = Join-Path $StateRoot ('import-' + [guid]::NewGuid().ToString('N') + '.jpg')
          Convert-XskinImage -Source $source -Destination $converted
          $imagePath = $converted
        }
        $preview = New-XskinImport -ImagePath $imagePath -VideoPath $videoPath -StateRoot $StateRoot `
          -Name ([IO.Path]::GetFileName($source))
        $previousPending = (Read-XskinSettings -StateRoot $StateRoot).pending
        Write-XskinSettings -StateRoot $StateRoot -Values @{ pending = [IO.Path]::GetFileName($preview.Directory) }
        if ($previousPending -match '^[a-f0-9]{32}$') {
          try { Remove-DreamSkinRuntimeTree -Path (Join-Path $StateRoot ('imports\' + $previousPending)) -StateRoot $StateRoot }
          catch { Write-Warning "The new import is ready; the old draft could not be removed: $($_.Exception.Message)" }
        }
        $messageCode = 'imported'
      } finally { if ($converted) { Remove-Item -LiteralPath $converted -Force -ErrorAction SilentlyContinue } }
    }
    'apply' {
      $preview = Get-XskinPanelState
      if (-not $preview.pending) { throw (New-XskinFailure -Code selectMedia -Message 'Import or select a background before applying.') }
      if ($Embedded -and ($request.selectionId -notmatch '^[a-f0-9]{32}$' -or $request.selectionId -cne $preview.selectionId)) {
        throw (New-XskinFailure -Code selectMedia -Message 'The pending selection changed. Choose the background again.')
      }
      if ($request.maskOpacity -isnot [double] -and $request.maskOpacity -isnot [int] -and
        $request.maskOpacity -isnot [long] -and $request.maskOpacity -isnot [decimal]) {
        throw (New-XskinFailure -Code invalidMask -Message 'Mask opacity must be a number between 0 and 1.')
      }
      $opacity = [double]$request.maskOpacity
      if ([double]::IsNaN($opacity) -or [double]::IsInfinity($opacity) -or $opacity -lt 0 -or $opacity -gt 1) {
        throw (New-XskinFailure -Code invalidMask -Message 'Mask opacity must be a number between 0 and 1.')
      }
      if (-not (Test-DreamSkinPathEqual -Left $preview.imagePath -Right ([string]$request.imagePath))) {
        throw (New-XskinFailure -Code selectMedia -Message 'The preview changed in another Xskin window. Import or select the background again.')
      }
      $candidate = Read-DreamSkinTheme -ThemeDirectory $preview.directory
      $candidate.Theme | Add-Member -NotePropertyName maskOpacity -NotePropertyValue $opacity -Force
      $candidate.Theme | Add-Member -NotePropertyName layout -NotePropertyValue 'wallpaper' -Force
      $candidate.Theme.appearance = 'dark'
      Write-DreamSkinTheme -ThemeDirectory $candidate.Directory -Theme $candidate.Theme
      Write-XskinSettings -StateRoot $StateRoot -Values @{ pending = [IO.Path]::GetFileName($candidate.Directory) }
      Invoke-XskinApply -ThemeDirectory $candidate.Directory -StateRoot $StateRoot -Apply {
        if ($Embedded) {
          & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -ExistingOnly -Resume -StateRoot $StateRoot
        } else {
          $runtime = Install-DreamSkinRuntimeEngine -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
          & $runtime.Start -Resume -StateRoot $StateRoot
        }
      }
      Write-XskinSettings -StateRoot $StateRoot -Values @{ pending = $null }
      try { Remove-DreamSkinRuntimeTree -Path $candidate.Directory -StateRoot $StateRoot }
      catch { Write-Warning "The background is applied; its draft could not be removed: $($_.Exception.Message)" }
      $messageCode = 'applied'
    }
    'mask' {
      if ($request.maskOpacity -isnot [double] -and $request.maskOpacity -isnot [int] -and
        $request.maskOpacity -isnot [decimal] -and $request.maskOpacity -isnot [long]) { throw (New-XskinFailure -Code invalidMask -Message 'Mask opacity must be a number between 0 and 1.') }
      $live = Test-XskinApplied -StateRoot $StateRoot
      Set-XskinMask -Opacity $request.maskOpacity -StateRoot $StateRoot -Apply {
        if ($Embedded) {
          & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -ExistingOnly -Resume -StateRoot $StateRoot
        } elseif ($live) {
          & (Join-Path $PSScriptRoot 'verify-dream-skin.ps1') -StateRoot $StateRoot
          if ($LASTEXITCODE -ne 0) { throw 'The overlay did not verify. Previous overlay restored.' }
        }
      }
      $messageCode = 'maskUpdated'
    }
    'autostart' {
      if ($request.enabled -isnot [bool]) { throw (New-XskinFailure -Code invalidAutostart -Message 'Automatic apply must be true or false.') }
      Set-XskinAutostart -Enabled $request.enabled -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
      $messageCode = if ($request.enabled) { 'autostartEnabled' } else { 'autostartDisabled' }
    }
    'preferences' {
      if ($request.language -notin @('en','zh-Hant','zh-Hans','ja')) { throw 'Unsupported language.' }
      Write-XskinSettings -StateRoot $StateRoot -Values @{ language = $request.language }
    }
    'pause' {
      $paused = $Embedded -or -not (Test-DreamSkinPaused -StateRoot $StateRoot)
      $null = Set-DreamSkinPaused -Paused $paused -StateRoot $StateRoot
      if (-not $paused) {
        try {
          $runtime = Install-DreamSkinRuntimeEngine -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
          & $runtime.Start -Resume -StateRoot $StateRoot
        } catch {
          $null = Set-DreamSkinPaused -Paused $true -StateRoot $StateRoot
          throw
        }
      }
    }
    'resume' {
      try { & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -ExistingOnly -Resume -StateRoot $StateRoot }
      catch { throw (New-XskinFailure -Code resumeUnavailable -Message $_.Exception.Message) }
    }
    'launch' {
      $runtime = Install-DreamSkinRuntimeEngine -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
      & $runtime.Start -StateRoot $StateRoot
    }
    'restore' {
      & (Join-Path $PSScriptRoot 'restore-dream-skin.ps1') -PromptRestart -StateRoot $StateRoot
    }
    'save' { $null = Save-DreamSkinCurrentTheme -Name ([string]$request.name) -StateRoot $StateRoot }
    'select' {
      $directory = [System.IO.Path]::GetFullPath([string]$request.directory)
      if (-not (Test-DreamSkinThemePathWithin -Path $directory -Root $paths.Saved)) { throw 'Select a saved theme.' }
      $saved = Read-DreamSkinTheme -ThemeDirectory $directory
      $preview = New-XskinImport -ImagePath $saved.ImagePath -VideoPath $saved.VideoPath -StateRoot $StateRoot
      $preview.Theme = $saved.Theme
      $preview.Theme.image = [System.IO.Path]::GetFileName($preview.ImagePath)
      if ($saved.VideoPath) { $preview.Theme.video = 'background.mp4' }
      Write-DreamSkinTheme -ThemeDirectory $preview.Directory -Theme $preview.Theme
      Write-XskinSettings -StateRoot $StateRoot -Values @{ pending = [IO.Path]::GetFileName($preview.Directory) }
    }
  }
  $result = @{ ok = $true; state = Get-XskinPanelState; messageCode = $messageCode }
  if ($Action -eq 'recover') { $result.recovered = $recovered }
  [Console]::Out.WriteLine('XSKIN_RESULT:' + ($result | ConvertTo-Json -Depth 10 -Compress))
} catch {
  $errorCode = if ($_.Exception.Data['errorCode']) { $_.Exception.Data['errorCode'] }
    elseif ($_.CategoryInfo.Category -eq 'PermissionDenied') { 'fileAccessDenied' } else { 'operationFailed' }
  [Console]::Out.WriteLine('XSKIN_RESULT:' + (@{ ok = $false; error = $_.Exception.Message; errorCode = $errorCode } | ConvertTo-Json -Compress))
  exit 1
} finally { if ($panelOperation) { Exit-DreamSkinOperationLock -Mutex $panelOperation } }
