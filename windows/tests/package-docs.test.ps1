$ErrorActionPreference = 'Stop'
$scripts = Join-Path $PSScriptRoot '..\scripts'
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-package-docs-' + [guid]::NewGuid().ToString('N'))
$repository = Join-Path $temporary 'source'
$fixtureScripts = Join-Path $repository 'windows\scripts'
$package = Join-Path $temporary 'package with spaces'
New-Item -ItemType Directory -Path $fixtureScripts, (Join-Path $repository 'docs'), $package -Force | Out-Null
try {
  foreach ($name in @('prepare-package-docs.ps1','config-utf8.ps1')) { Copy-Item -LiteralPath (Join-Path $scripts $name) -Destination $fixtureScripts }
  $readme = '[Parity](../docs/windows-parity.md) [Usage](../docs/usage-fields.md) [English](README.en.md)'
  [IO.File]::WriteAllText((Join-Path $repository 'README.md'), $readme)
  foreach ($name in @('README.md','README.en.md')) { [IO.File]::WriteAllText((Join-Path $package $name), $readme) }
  $changelog = '# Earlier release' + "`r`n" + '[Usage validation](../docs/usage-fields.md#details)'
  [IO.File]::WriteAllText((Join-Path $repository 'CHANGELOG.md'), $changelog)
  [IO.File]::WriteAllText((Join-Path $package 'CHANGELOG.md'), $changelog)
  $document = '[Related](usage-fields.md#details) [Source](../macos/tests/fixture.html) ![Preview](images/example.png) [Anchor](#local) [External](https://example.com/guide)'
  [IO.File]::WriteAllText((Join-Path $repository 'docs\windows-parity.md'), $document)
  [IO.File]::WriteAllText((Join-Path $repository 'docs\usage-fields.md'), '# Details')
  [IO.File]::WriteAllText((Join-Path $repository 'docs\.env'), 'PACKAGING_FIXTURE_SECRET=never-ship')
  & (Join-Path $fixtureScripts 'prepare-package-docs.ps1') -PackageRoot $package
  foreach ($name in @('README.md','README.en.md')) {
    $content = [IO.File]::ReadAllText((Join-Path $package $name))
    if ($content -cne $readme.Replace('../docs/', 'docs/')) { throw 'Standalone README links do not point to shipped docs.' }
  }
  $packagedChangelog = [IO.File]::ReadAllText((Join-Path $package 'CHANGELOG.md'))
  if ($packagedChangelog -cne $changelog.Replace('../docs/', 'docs/')) { throw 'Standalone changelog links escape the shipped docs directory.' }
  foreach ($name in @('windows-parity.md','usage-fields.md')) {
    if (-not (Test-Path -LiteralPath (Join-Path $package "docs\$name"))) { throw 'A linked document was not packaged.' }
  }
  $content = [IO.File]::ReadAllText((Join-Path $package 'docs\windows-parity.md'))
  foreach ($expected in @(
    '(usage-fields.md#details)',
    '(https://github.com/timmyc07/Xskin/blob/main/macos/tests/fixture.html)',
    '(https://raw.githubusercontent.com/timmyc07/Xskin/main/docs/images/example.png)',
    '(#local)', '(https://example.com/guide)'
  )) { if (-not $content.Contains($expected)) { throw "Packaged documentation lost a portable link: $expected" } }
  if (Test-Path -LiteralPath (Join-Path $package 'docs\.env')) { throw 'Packaging copied a private dotfile.' }
  if ([IO.File]::ReadAllText((Join-Path $repository 'README.md')) -cne $readme -or
    [IO.File]::ReadAllText((Join-Path $repository 'CHANGELOG.md')) -cne $changelog -or
    [IO.File]::ReadAllText((Join-Path $repository 'docs\windows-parity.md')) -cne $document) { throw 'Packaging changed source documentation.' }
  & (Join-Path $fixtureScripts 'prepare-package-docs.ps1') -PackageRoot $package
  if ([IO.File]::ReadAllText((Join-Path $package 'docs\windows-parity.md')) -cne $content) { throw 'Repeated documentation packaging changed its output.' }
  if ([IO.File]::ReadAllText((Join-Path $package 'CHANGELOG.md')) -cne $packagedChangelog) { throw 'Repeated packaging changed the changelog links.' }
} finally { Remove-Item -LiteralPath $temporary -Recurse -Force }
Write-Host 'PASS: portable README/docs/image links, source preservation, repeated packaging and no private dotfiles.'
