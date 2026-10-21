[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('state','import','apply','mask','autostart','preferences','pause','launch','restore','save','select')][string]$Action,
  [Parameter(Mandatory = $true)][string]$RequestPath,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
. (Join-Path $PSScriptRoot 'xskin-theme.ps1')

function Get-XskinPanelState {
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
    directory = $preview.Directory
    name = $preview.Theme.name
    imagePath = $preview.ImagePath
    videoPath = $preview.VideoPath
    bytes = (Get-Item -LiteralPath $media).Length
    maskOpacity = if ($null -ne $active.Theme.maskOpacity) { $active.Theme.maskOpacity } else { 0.62 }
    activeName = $active.Theme.name
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
  if ((Get-Item -LiteralPath $RequestPath).Length -gt 24MB) { throw 'Panel request exceeds the size limit.' }
  $inputText = Read-DreamSkinUtf8File -Path $RequestPath
  $request = if ($inputText.Trim()) { $inputText | ConvertFrom-Json } else { [pscustomobject]@{} }
  if ($request -is [array] -or $request -is [string] -or $null -eq $request) { throw 'Panel request must be an object.' }
  $panelOperation = Enter-DreamSkinOperationLock
  $paths = Initialize-DreamSkinThemeStore -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
  $settingsPath = Join-Path $StateRoot 'studio.json'
  Assert-DreamSkinNoReparseComponents -Path $settingsPath
  switch ($Action) {
    'state' { }
    'import' {
      $videoPath = $null
      $converted = $null
      try {
        $source = [IO.Path]::GetFullPath([string]$request.path)
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
          -Name ([IO.Path]::GetFileNameWithoutExtension($source))
        $previousPending = (Read-XskinSettings -StateRoot $StateRoot).pending
        Write-XskinSettings -StateRoot $StateRoot -Values @{ pending = [IO.Path]::GetFileName($preview.Directory) }
        if ($previousPending -match '^[a-f0-9]{32}$') {
          try { Remove-DreamSkinRuntimeTree -Path (Join-Path $StateRoot ('imports\' + $previousPending)) -StateRoot $StateRoot }
          catch { Write-Warning "The new import is ready; the old draft could not be removed: $($_.Exception.Message)" }
        }
      } finally { if ($converted) { Remove-Item -LiteralPath $converted -Force -ErrorAction SilentlyContinue } }
    }
    'apply' {
      $preview = Get-XskinPanelState
      if (-not $preview.pending) { throw 'Import or select a background before applying.' }
      if ($request.maskOpacity -isnot [double] -and $request.maskOpacity -isnot [int] -and
        $request.maskOpacity -isnot [long] -and $request.maskOpacity -isnot [decimal]) {
        throw 'Mask opacity must be a number between 0 and 1.'
      }
      $opacity = [double]$request.maskOpacity
      if ([double]::IsNaN($opacity) -or [double]::IsInfinity($opacity) -or $opacity -lt 0 -or $opacity -gt 1) {
        throw 'Mask opacity must be a number between 0 and 1.'
      }
      if (-not (Test-DreamSkinPathEqual -Left $preview.imagePath -Right ([string]$request.imagePath))) {
        throw 'The preview changed in another Xskin window. Import or select the background again.'
      }
      $candidate = Read-DreamSkinTheme -ThemeDirectory $preview.directory
      $candidate.Theme | Add-Member -NotePropertyName maskOpacity -NotePropertyValue $opacity -Force
      $candidate.Theme | Add-Member -NotePropertyName layout -NotePropertyValue 'wallpaper' -Force
      $candidate.Theme.appearance = 'dark'
      Write-DreamSkinTheme -ThemeDirectory $candidate.Directory -Theme $candidate.Theme
      Write-XskinSettings -StateRoot $StateRoot -Values @{ pending = [IO.Path]::GetFileName($candidate.Directory) }
      Invoke-XskinApply -ThemeDirectory $candidate.Directory -StateRoot $StateRoot -Apply {
        $runtime = Install-DreamSkinRuntimeEngine -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
        & $runtime.Start -PromptRestart
      }
      Write-XskinSettings -StateRoot $StateRoot -Values @{ pending = $null }
      try { Remove-DreamSkinRuntimeTree -Path $candidate.Directory -StateRoot $StateRoot }
      catch { Write-Warning "The background is applied; its draft could not be removed: $($_.Exception.Message)" }
    }
    'mask' {
      if ($request.maskOpacity -isnot [double] -and $request.maskOpacity -isnot [int] -and
        $request.maskOpacity -isnot [decimal] -and $request.maskOpacity -isnot [long]) { throw 'Mask opacity must be a number between 0 and 1.' }
      $live = Test-XskinApplied -StateRoot $StateRoot
      Set-XskinMask -Opacity $request.maskOpacity -StateRoot $StateRoot -Apply {
        if ($live) { & (Join-Path $PSScriptRoot 'verify-dream-skin.ps1') }
        if ($live -and $LASTEXITCODE -ne 0) { throw 'The overlay did not verify. Previous overlay restored.' }
      }
    }
    'autostart' {
      if ($request.enabled -isnot [bool]) { throw 'Automatic apply must be true or false.' }
      Set-XskinAutostart -Enabled $request.enabled -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
    }
    'preferences' {
      if ($request.language -notin @('en','zh-Hant','zh-Hans','ja')) { throw 'Unsupported language.' }
      Write-XskinSettings -StateRoot $StateRoot -Values @{ language = $request.language }
    }
    'pause' {
      $paused = -not (Test-DreamSkinPaused -StateRoot $StateRoot)
      if ($paused) { Set-XskinAutostart -Enabled $false -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot }
      $null = Set-DreamSkinPaused -Paused $paused -StateRoot $StateRoot
    }
    'launch' {
      $runtime = Install-DreamSkinRuntimeEngine -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
      & $runtime.Start -PromptRestart
    }
    'restore' {
      Set-XskinAutostart -Enabled $false -SkillRoot (Split-Path -Parent $PSScriptRoot) -StateRoot $StateRoot
      & (Join-Path $PSScriptRoot 'restore-dream-skin.ps1') -PromptRestart
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
  $result = @{ ok = $true; state = Get-XskinPanelState }
  [Console]::Out.WriteLine('XSKIN_RESULT:' + ($result | ConvertTo-Json -Depth 10 -Compress))
} catch {
  [Console]::Out.WriteLine('XSKIN_RESULT:' + (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  exit 1
} finally { if ($panelOperation) { Exit-DreamSkinOperationLock -Mutex $panelOperation } }
