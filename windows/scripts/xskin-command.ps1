[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('state','validate','import','apply','pause','launch','restore','save','select')][string]$Action,
  [Parameter(Mandatory = $true)][string]$RequestPath,
  [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
. (Join-Path $PSScriptRoot 'xskin-theme.ps1')

function Get-XskinPanelState {
  $preview = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  $pending = $false
  if (Test-Path -LiteralPath $settingsPath) {
    Assert-DreamSkinNoReparseComponents -Path $settingsPath
    $settings = (Read-DreamSkinUtf8File -Path $settingsPath) | ConvertFrom-Json
    if ($settings.pending -match '^[a-f0-9]{32}$') {
      $preview = Read-DreamSkinTheme -ThemeDirectory (Join-Path $StateRoot ('imports\' + $settings.pending))
      $pending = $true
    }
  }
  $media = if ($preview.VideoPath) { $preview.VideoPath } else { $preview.ImagePath }
  return @{
    directory = $preview.Directory
    name = $preview.Theme.name
    imagePath = $preview.ImagePath
    videoPath = $preview.VideoPath
    bytes = (Get-Item -LiteralPath $media).Length
    maskOpacity = if ($null -ne $preview.Theme.maskOpacity) { $preview.Theme.maskOpacity } else { 0.62 }
    pending = $pending
    paused = Test-DreamSkinPaused -StateRoot $StateRoot
    saved = @(Get-DreamSkinSavedThemes -StateRoot $StateRoot -SkipImageMetadata)
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
    'validate' {
      if ([System.IO.Path]::GetExtension([string]$request.path) -ieq '.mp4') {
        Assert-DreamSkinVideoFile -Path ([string]$request.path)
      } else { Assert-DreamSkinImageFile -Path ([string]$request.path) }
    }
    'import' {
      $videoPath = $null
      $poster = $null
      try {
        $imagePath = [string]$request.path
        if ([System.IO.Path]::GetExtension($imagePath) -ieq '.mp4') {
          $videoPath = $imagePath
          Assert-DreamSkinVideoFile -Path $videoPath
          $poster = Join-Path $StateRoot ('import-poster-' + [guid]::NewGuid().ToString('N') + '.png')
          Assert-DreamSkinNoReparseComponents -Path $poster
          [System.IO.File]::WriteAllBytes($poster, [Convert]::FromBase64String([string]$request.posterPng))
          $imagePath = $poster
        }
        $preview = New-XskinImport -ImagePath $imagePath -VideoPath $videoPath -StateRoot $StateRoot
        Write-DreamSkinUtf8FileAtomically -Path $settingsPath -Content (
          @{ pending = [System.IO.Path]::GetFileName($preview.Directory) } | ConvertTo-Json)
      } finally { if ($poster) { Remove-Item -LiteralPath $poster -Force -ErrorAction SilentlyContinue } }
    }
    'apply' {
      $preview = Get-XskinPanelState
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
      if (-not $preview.pending) {
        $candidate = New-XskinImport -ImagePath $candidate.ImagePath -VideoPath $candidate.VideoPath -StateRoot $StateRoot
        $candidate.Theme.name = $preview.name
      }
      $candidate.Theme | Add-Member -NotePropertyName maskOpacity -NotePropertyValue $opacity -Force
      $candidate.Theme | Add-Member -NotePropertyName layout -NotePropertyValue 'wallpaper' -Force
      $candidate.Theme.appearance = 'dark'
      Write-DreamSkinTheme -ThemeDirectory $candidate.Directory -Theme $candidate.Theme
      Write-DreamSkinUtf8FileAtomically -Path $settingsPath -Content (
        @{ pending = [System.IO.Path]::GetFileName($candidate.Directory) } | ConvertTo-Json)
      Invoke-XskinApply -ThemeDirectory $candidate.Directory -StateRoot $StateRoot -Apply {
        & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -PromptRestart
        & (Join-Path $PSScriptRoot 'verify-dream-skin.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Codex did not verify the background. Previous theme restored.' }
      }
      Write-DreamSkinUtf8FileAtomically -Path $settingsPath -Content '{}'
    }
    'pause' { $null = Set-DreamSkinPaused -Paused (-not (Test-DreamSkinPaused -StateRoot $StateRoot)) -StateRoot $StateRoot }
    'launch' { & (Join-Path $PSScriptRoot 'start-dream-skin.ps1') -PromptRestart }
    'restore' { & (Join-Path $PSScriptRoot 'restore-dream-skin.ps1') -PromptRestart }
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
      Write-DreamSkinUtf8FileAtomically -Path $settingsPath -Content (
        @{ pending = [System.IO.Path]::GetFileName($preview.Directory) } | ConvertTo-Json)
    }
  }
  $result = @{ ok = $true; state = Get-XskinPanelState }
  [Console]::Out.WriteLine('XSKIN_RESULT:' + ($result | ConvertTo-Json -Depth 10 -Compress))
} catch {
  [Console]::Out.WriteLine('XSKIN_RESULT:' + (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  exit 1
} finally { if ($panelOperation) { Exit-DreamSkinOperationLock -Mutex $panelOperation } }
