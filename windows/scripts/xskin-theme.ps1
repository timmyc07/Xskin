. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

function New-XskinImport {
  param(
    [Parameter(Mandatory = $true)][string]$ImagePath,
    [string]$VideoPath,
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'CodexDreamSkin')
  )
  Assert-DreamSkinImageFile -Path $ImagePath
  if ($VideoPath) { Assert-DreamSkinVideoFile -Path $VideoPath }
  $directory = Join-Path $StateRoot ('imports\' + [guid]::NewGuid().ToString('N'))
  Ensure-DreamSkinManagedDirectory -Path $directory -Root $StateRoot
  $imageName = 'background' + [System.IO.Path]::GetExtension($ImagePath).ToLowerInvariant()
  Copy-Item -LiteralPath $ImagePath -Destination (Join-Path $directory $imageName)
  $source = if ($VideoPath) { $VideoPath } else { $ImagePath }
  $name = [System.IO.Path]::GetFileNameWithoutExtension($source)
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
