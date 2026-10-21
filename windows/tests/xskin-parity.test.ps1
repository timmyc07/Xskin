$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-parity-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
  $stateRoot = Join-Path $temporary 'state'
  $paths = Initialize-DreamSkinThemeStore -SkillRoot $root -StateRoot $stateRoot
  Write-XskinSettings -StateRoot $stateRoot -Values @{language='zh-Hant';pending='abc'}
  Write-XskinSettings -StateRoot $stateRoot -Values @{pending='def'}
  $settings = Read-XskinSettings -StateRoot $stateRoot
  if ($settings.language -ne 'zh-Hant' -or $settings.pending -ne 'def') { throw 'Preferences were overwritten by a pending selection.' }

  $active = Read-DreamSkinTheme -ThemeDirectory $paths.Active
  $hash = (Get-FileHash -LiteralPath $active.ImagePath).Hash
  Set-XskinMask -Opacity 0.27 -StateRoot $stateRoot -Apply {}
  $before = Read-DreamSkinUtf8File -Path $active.ThemePath
  try { Set-XskinMask -Opacity 0.8 -StateRoot $stateRoot -Apply { throw 'forced mask failure' }; throw 'Mask failure was ignored.' }
  catch { if ($_.Exception.Message -notmatch 'forced mask failure') { throw } }
  if ((Read-DreamSkinUtf8File -Path $active.ThemePath) -cne $before -or
    (Get-FileHash -LiteralPath $active.ImagePath).Hash -cne $hash -or
    (Read-XskinSettings -StateRoot $stateRoot).pending -ne 'def') { throw 'Mask rollback changed media or the pending import.' }

  $jpeg = Join-Path $temporary 'normalized.jpg'
  Convert-XskinImage -Source $active.ImagePath -Destination $jpeg
  Assert-DreamSkinImageFile -Path $jpeg
  Add-Type -AssemblyName PresentationCore
  $image = [Windows.Media.Imaging.BitmapImage]::new()
  $image.BeginInit()
  $image.CacheOption = [Windows.Media.Imaging.BitmapCacheOption]::OnLoad
  $imageStream = [IO.File]::OpenRead($active.ImagePath)
  try { $image.StreamSource = $imageStream; $image.EndInit(); $image.Freeze() } finally { $imageStream.Dispose() }
  $tiff = [Windows.Media.Imaging.TiffBitmapEncoder]::new()
  $tiff.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($image))
  $tiffPath = Join-Path $temporary 'image.tiff'
  $output = [IO.File]::Create($tiffPath)
  try { $tiff.Save($output) } finally { $output.Dispose() }
  $convertedTiff = Join-Path $temporary 'tiff.jpg'
  Convert-XskinImage -Source $tiffPath -Destination $convertedTiff
  Assert-DreamSkinImageFile -Path $convertedTiff
  $oversized = Join-Path $temporary 'large.png'
  $stream = [IO.File]::Create($oversized)
  try { $stream.SetLength(50MB + 1) } finally { $stream.Dispose() }
  try { Convert-XskinImage -Source $oversized -Destination (Join-Path $temporary 'bad.jpg'); throw 'Large source was accepted.' }
  catch { if ($_.Exception.Message -notmatch '50 MiB') { throw } }

  $shortcutFolder = Join-Path $temporary 'shortcuts'
  New-Item -ItemType Directory -Path $shortcutFolder | Out-Null
  function Get-XskinLaunchShortcutPaths { return @((Join-Path $shortcutFolder 'desktop.lnk'), (Join-Path $shortcutFolder 'start.lnk')) }
  # Match the registered Store package layout; WSH reads icons through the system code page.
  $codexExecutable = Join-Path $temporary 'OpenAI.Codex_fixture\app\ChatGPT.exe'
  New-Item -ItemType Directory -Path (Split-Path -Parent $codexExecutable) | Out-Null
  Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Destination $codexExecutable
  function Get-DreamSkinCodexInstall { return [pscustomobject]@{Executable=$codexExecutable} }
  Set-XskinAutostart -Enabled $true -SkillRoot $root -StateRoot $stateRoot
  $startup = Get-XskinAutostart -StateRoot $stateRoot
  if (-not $startup.Enabled -or -not $startup.Loaded) { throw 'The direct-launch entry was not installed.' }
  $foreign = (Get-XskinLaunchShortcutPaths)[0]
  $shell = New-Object -ComObject WScript.Shell
  foreach ($shortcut in $startup.Owned) {
    $createdLink = $shell.CreateShortcut($shortcut)
    if ($createdLink.IconLocation -ine "$codexExecutable,0") { throw "Incorrect launch icon: '$($createdLink.IconLocation)'; expected '$codexExecutable,0'." }
    if ($createdLink.Arguments -notmatch '-File' -or $createdLink.TargetPath -notlike '*\powershell.exe') { throw 'Setting the icon changed the background launcher.' }
  }
  $link = $shell.CreateShortcut($foreign)
  $link.Description = 'unrelated'
  $link.Save()
  Set-XskinAutostart -Enabled $false -SkillRoot $root -StateRoot $stateRoot
  if (-not (Test-Path -LiteralPath $foreign)) { throw 'Disable removed an unrelated shortcut.' }
  try { Set-XskinAutostart -Enabled $true -SkillRoot $root -StateRoot $stateRoot; throw 'Foreign shortcut was overwritten.' }
  catch { if ($_.Exception.Message -notmatch 'unrelated shortcut') { throw } }
  Remove-Item -LiteralPath $foreign
  Set-XskinAutostart -Enabled $true -SkillRoot $root -StateRoot $stateRoot
  Set-XskinAutostart -Enabled $false -SkillRoot $root -StateRoot $stateRoot
  if ((Get-XskinAutostart -StateRoot $stateRoot).Enabled) { throw 'Disable left the direct-launch entry enabled.' }
} finally {
  $fullPath = [IO.Path]::GetFullPath($temporary)
  if (-not $fullPath.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
  Remove-Item -LiteralPath $fullPath -Recurse -Force
}
Write-Host 'PASS: Mac-equivalent preferences, independent mask rollback, image/TIFF conversion, limits and direct-launch ownership.'
