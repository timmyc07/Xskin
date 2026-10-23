param([Parameter(Mandatory = $true)][string]$PackageRoot)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'config-utf8.ps1')
$destination = Join-Path $PackageRoot 'docs'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
foreach ($source in Get-ChildItem -LiteralPath (Join-Path $repository 'docs') -Filter '*.md' -File) {
  $content = Read-DreamSkinUtf8File -Path $source.FullName
  $base = [uri]('https://github.com/timmyc07/Xskin/blob/main/docs/' + $source.Name)
  $content = [regex]::Replace($content, '(!?\[[^\]]*\]\()([^\)\r\n]+)(\))', {
    param($match)
    $target = $match.Groups[2].Value
    if ($target -match '^(?:#|[a-zA-Z][a-zA-Z0-9+.-]*:)') { return $match.Value }
    $local = [IO.Path]::GetFullPath((Join-Path $source.DirectoryName $target.Split('#')[0]))
    if ($local.StartsWith($source.DirectoryName.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetExtension($local) -ieq '.md' -and (Test-Path -LiteralPath $local -PathType Leaf)) {
      return $match.Value
    }
    $resolved = [uri]::new($base, $target).AbsoluteUri
    if ($match.Groups[1].Value.StartsWith('!')) {
      $resolved = $resolved.Replace('https://github.com/timmyc07/Xskin/blob/main/', 'https://raw.githubusercontent.com/timmyc07/Xskin/main/')
    }
    return $match.Groups[1].Value + $resolved + $match.Groups[3].Value
  })
  Write-DreamSkinUtf8FileAtomically -Path (Join-Path $destination $source.Name) -Content $content
}
foreach ($name in @('README.md', 'README.en.md')) {
  $file = Join-Path $PackageRoot $name
  if (Test-Path -LiteralPath $file -PathType Leaf) {
    $content = (Read-DreamSkinUtf8File -Path $file).Replace('../docs/', 'docs/')
    Write-DreamSkinUtf8FileAtomically -Path $file -Content $content
  }
}
