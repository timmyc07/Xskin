$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\xskin-theme.ps1')
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('xskin-tests-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
  $stateRoot = Join-Path $temporary 'state'
  $paths = Initialize-DreamSkinThemeStore -SkillRoot $root -StateRoot $stateRoot
  $source = Join-Path $temporary 'source.mp4'
  $mp4 = [byte[]](0,0,0,24,102,116,121,112,105,115,111,109,0,0,2,0,105,115,111,109,109,112,52,49)
  [System.IO.File]::WriteAllBytes($source, $mp4)
  $original = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  $pending = New-XskinImport -ImagePath $original.ImagePath -VideoPath $source -StateRoot $stateRoot
  if ((Read-DreamSkinTheme -ThemeDirectory $paths.Active).Theme.video) { throw 'Import changed the active theme.' }
  if ((Get-FileHash -LiteralPath $pending.VideoPath).Hash -ne (Get-FileHash -LiteralPath $source).Hash) { throw 'Import changed video bytes.' }
  $null = Set-DreamSkinPaused -Paused $true -StateRoot $stateRoot
  $failed = $false
  $attempts = @{ Count = 0 }
  try {
    Invoke-XskinApply -ThemeDirectory $pending.Directory -StateRoot $stateRoot -Apply {
      $attempts.Count++
      $null = Set-DreamSkinPaused -Paused $false -StateRoot $stateRoot
      throw 'forced verification failure'
    }
  } catch {
    if ($_.Exception.Message -notmatch 'forced verification failure') { throw }
    $failed = $true
  }
  $restored = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  if (-not $failed -or $restored.Theme.id -ne $original.Theme.id -or $restored.VideoPath -or
    -not (Test-DreamSkinPaused -StateRoot $stateRoot) -or $attempts.Count -ne 1) { throw 'Failed apply did not restore theme and pause state.' }
  Invoke-XskinApply -ThemeDirectory $pending.Directory -StateRoot $stateRoot -Apply { }
  $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  if (-not $active.VideoPath -or (Get-FileHash -LiteralPath $active.VideoPath).Hash -ne (Get-FileHash -LiteralPath $source).Hash) { throw 'Video apply failed.' }
  $name = -join @([char]0x4E2D,[char]0x6587)
  $saved = Save-DreamSkinCurrentTheme -Name $name -StateRoot $stateRoot
  if ($saved.Theme.name -ne $name -or -not $saved.VideoPath) { throw 'Saved theme lost its Unicode name or video.' }
  $savedMetadata = Read-DreamSkinUtf8File -Path $saved.ThemePath
  $presetImage = Join-Path $paths.Saved 'preset-midnight-aurora\background.jpg'
  [IO.File]::WriteAllText($presetImage, 'corrupt bundled image')
  $null = Initialize-DreamSkinThemeStore -SkillRoot $root -StateRoot $stateRoot
  if ((Read-DreamSkinUtf8File -Path $saved.ThemePath) -cne $savedMetadata -or
    @(Get-DreamSkinSavedThemes -StateRoot $stateRoot).Count -ne 7 -or
    (Get-FileHash -LiteralPath $presetImage).Hash -cne (Get-FileHash -LiteralPath (Join-Path $root 'presets\preset-midnight-aurora\background.jpg')).Hash) {
    throw 'Preset refresh damaged a custom saved theme or did not restore the bundled image.'
  }
  $image = New-XskinImport -ImagePath $saved.ImagePath -StateRoot $stateRoot
  Invoke-XskinApply -ThemeDirectory $image.Directory -StateRoot $stateRoot -Apply { }
  if ((Read-DreamSkinTheme -ThemeDirectory $paths.Active).VideoPath) { throw 'Image apply retained the previous video.' }
  $switched = Use-DreamSkinSavedTheme -ThemeDirectory $saved.Directory -StateRoot $stateRoot
  if (-not $switched.VideoPath -or $switched.Theme.name -ne $name) { throw 'Switching a saved video theme failed.' }
  try {
    Invoke-XskinApply -ThemeDirectory $image.Directory -StateRoot $stateRoot -Apply { throw 'second forced failure' }
    throw 'Failed apply was accepted.'
  } catch { if ($_.Exception.Message -notmatch 'second forced failure') { throw } }
  if (-not (Read-DreamSkinTheme -ThemeDirectory $paths.Active).VideoPath) { throw 'Rollback lost the previous video.' }
  $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  $beforeInterrupted = Read-DreamSkinUtf8File -Path $active.ThemePath
  $active.Theme | Add-Member -NotePropertyName maskOpacity -NotePropertyValue 0.83 -Force
  $next = ($active.Theme | ConvertTo-Json -Depth 8) + "`r`n"
  Start-XskinTransaction -StateRoot $stateRoot -Next $next
  Write-DreamSkinUtf8FileAtomically -Path $active.ThemePath -Content $next
  $journal = Join-Path $paths.Active '.xskin-transaction.json'
  $journalBytes = Read-DreamSkinUtf8File -Path $journal
  Write-DreamSkinUtf8FileAtomically -Path $journal -Content '{broken'
  try { Repair-XskinTransaction -StateRoot $stateRoot; throw 'Invalid recovery journal was accepted.' }
  catch { if ($_.Exception.Data['errorCode'] -ne 'invalidBackground') { throw } }
  if ((Read-DreamSkinUtf8File -Path $journal) -cne '{broken') { throw 'Invalid journal was removed.' }
  Write-DreamSkinUtf8FileAtomically -Path $journal -Content $journalBytes
  Write-DreamSkinUtf8FileAtomically -Path $active.ThemePath -Content ($next + ' ')
  try { Repair-XskinTransaction -StateRoot $stateRoot; throw 'Recovery overwrote an external change.' }
  catch { if ($_.Exception.Data['errorCode'] -ne 'invalidBackground') { throw } }
  Write-DreamSkinUtf8FileAtomically -Path $active.ThemePath -Content $next
  if (-not (Repair-XskinTransaction -StateRoot $stateRoot) -or
    (Read-DreamSkinUtf8File -Path $active.ThemePath) -cne $beforeInterrupted -or
    (Repair-XskinTransaction -StateRoot $stateRoot)) { throw 'Interrupted recovery was not exact or idempotent.' }
  $lock = Enter-DreamSkinOperationLock
  Exit-DreamSkinOperationLock -Mutex $lock
} finally {
  $fullPath = [System.IO.Path]::GetFullPath($temporary)
  if (-not $fullPath.StartsWith([System.IO.Path]::GetTempPath(), [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected test cleanup path.' }
  Remove-Item -LiteralPath $fullPath -Recurse -Force
}
Write-Host 'PASS: imports preserve active media, apply rolls back, and saved video themes round-trip.'
