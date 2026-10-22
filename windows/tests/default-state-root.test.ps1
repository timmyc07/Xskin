$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\xskin-theme.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-default-root-' + [guid]::NewGuid().ToString('N'))
$previousLocalAppData = $env:LOCALAPPDATA
$script:locatorFixture = $null
function Get-ItemProperty { return $script:locatorFixture }
$realGetTask = (Get-Command Get-DreamSkinAutostartTask).ScriptBlock
try {
  $env:LOCALAPPDATA = Join-Path $temporary 'ordinary-local'
  $defaultRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
  $physicalRoot = Join-Path $temporary ('package-private ' + [char]0x4E2D + [char]0x6587 + [char]::ConvertFromUtf32(0x1F311))
  New-Item -ItemType Directory -Path (Join-Path $physicalRoot 'active-theme') -Force | Out-Null
  Write-DreamSkinUtf8FileAtomically -Path (Join-Path $physicalRoot 'active-theme\theme.json') -Content '{"name":"saved"}'
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $action = [pscustomobject]@{
    Type = 0; Path = Join-Path $physicalRoot 'engine\scripts\xskin-quiet.exe'
    Arguments = Get-DreamSkinAutostartArguments -StateRoot $physicalRoot; WorkingDirectory = $physicalRoot
  }
  $trigger = [pscustomobject]@{ Type = 9; UserId = $sid }
  $actions = [pscustomobject]@{ Count = 1; Entry = $action }
  $actions | Add-Member -MemberType ScriptMethod -Name Item -Value { param($Index) return $this.Entry }
  $triggers = [pscustomobject]@{ Count = 1; Entry = $trigger }
  $triggers | Add-Member -MemberType ScriptMethod -Name Item -Value { param($Index) return $this.Entry }
  $taskFixture = [pscustomobject]@{
    Enabled = $false
    Definition = [pscustomobject]@{
      RegistrationInfo = [pscustomobject]@{ Description = 'Xskin official Codex launch monitor' }
      Principal = [pscustomobject]@{ UserId = $sid; LogonType = 3; RunLevel = 0 }
      Actions = $actions; Triggers = $triggers
    }
  }
  function Get-DreamSkinAutostartTask { return $taskFixture }
  if (-not (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $defaultRoot) -Right $physicalRoot) -or
    (Test-Path -LiteralPath $defaultRoot) -or (Test-Path -LiteralPath $action.Path) -or $taskFixture.Enabled) {
    throw 'Desktop launch did not recover the owned store with a missing launcher without creating defaults or enabling a disabled task.'
  }
  New-Item -ItemType Directory -Path $action.Path -Force | Out-Null
  try {
    try { $null = Resolve-DreamSkinStateRoot -StateRoot $defaultRoot; throw 'A launcher directory was accepted as an ordinary file.' }
    catch { if ($_.Exception.Message -cne 'The Xskin quiet launcher is not an ordinary file.') { throw } }
  } finally { [IO.Directory]::Delete($action.Path) }
  Write-DreamSkinUtf8FileAtomically -Path $action.Path -Content 'ordinary file fixture'
  New-Item -ItemType Directory -Path (Join-Path $defaultRoot 'active-theme') -Force | Out-Null
  $ordinaryTheme = Join-Path $defaultRoot 'active-theme\theme.json'
  Write-DreamSkinUtf8FileAtomically -Path $ordinaryTheme -Content '{"name":"separate"}'
  if (-not (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $defaultRoot) -Right $physicalRoot) -or
    (Read-DreamSkinUtf8File -Path $ordinaryTheme) -cne '{"name":"separate"}') {
    throw 'A separate ordinary default store displaced the saved task store or was rewritten.'
  }
  $customRoot = Join-Path $temporary 'explicit-custom'
  if (-not (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $customRoot) -Right $customRoot)) {
    throw 'An explicitly selected custom state root was replaced.'
  }
  foreach ($field in @('principal','trigger','action','arguments','working-directory','privilege')) {
    $savedPrincipal = $taskFixture.Definition.Principal.UserId
    $savedTrigger = $trigger.UserId
    $savedPath = $action.Path
    $savedArguments = $action.Arguments
    $savedDirectory = $action.WorkingDirectory
    switch ($field) {
      'principal' { $taskFixture.Definition.Principal.UserId = 'S-1-5-18' }
      'trigger' { $trigger.UserId = 'S-1-5-18' }
      'action' { $action.Path = Join-Path $physicalRoot 'unrelated.exe' }
      'arguments' { $action.Arguments = 'start' }
      'working-directory' {
        $action.WorkingDirectory = 'relative-state'
        $action.Path = Join-Path $action.WorkingDirectory 'engine\scripts\xskin-quiet.exe'
        $action.Arguments = Get-DreamSkinAutostartArguments -StateRoot $action.WorkingDirectory
      }
      'privilege' { $taskFixture.Definition.Principal.RunLevel = 1 }
    }
    if (-not (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $defaultRoot) -Right $defaultRoot)) {
      throw "An unrelated task selected the saved root based only on its description: $field"
    }
    $taskFixture.Definition.Principal.UserId = $savedPrincipal
    $trigger.UserId = $savedTrigger
    $action.Path = $savedPath
    $action.Arguments = $savedArguments
    $action.WorkingDirectory = $savedDirectory
    $taskFixture.Definition.Principal.RunLevel = 0
  }
  $junction = Join-Path $temporary 'linked-state'
  New-Item -ItemType Junction -Path $junction -Target $physicalRoot | Out-Null
  try {
    $action.Path = Join-Path $junction 'engine\scripts\xskin-quiet.exe'
    $action.Arguments = Get-DreamSkinAutostartArguments -StateRoot $junction
    $action.WorkingDirectory = $junction
    try { $null = Resolve-DreamSkinStateRoot -StateRoot $defaultRoot; throw 'An owned-looking task selected a reparse state root.' }
    catch { if ($_.Exception.Message -notmatch 'junction or symbolic link') { throw } }
  } finally { [IO.Directory]::Delete($junction) }
  $action.WorkingDirectory = $physicalRoot
  $action.Path = Join-Path $physicalRoot 'engine\scripts\xskin-quiet.exe'
  $action.Arguments = Get-DreamSkinAutostartArguments -StateRoot $physicalRoot
  $script:locatorFixture = @{ StateRoot = $physicalRoot }
  $taskFixture = $null
  if (-not (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $defaultRoot) -Right $physicalRoot)) {
    throw 'Removing the login task lost the physical store locator.'
  }
  $script:locatorFixture = $null
  $taskFixture = $null
  if (-not (Test-DreamSkinPathEqual -Left (Resolve-DreamSkinStateRoot -StateRoot $defaultRoot) -Right $defaultRoot)) {
    throw 'A default store without an existing task changed unexpectedly.'
  }
} finally {
  Remove-Item Function:\Get-ItemProperty
  Set-Item Function:\Get-DreamSkinAutostartTask -Value $realGetTask
  $env:LOCALAPPDATA = $previousLocalAppData
  $fullPath = [IO.Path]::GetFullPath($temporary)
  if (-not $fullPath.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
  if (Test-Path -LiteralPath $fullPath) { Remove-Item -LiteralPath $fullPath -Recurse -Force }
}
Write-Host 'PASS: desktop default store selection, disabled-task preservation, explicit roots, full task ownership and reparse rejection.'
