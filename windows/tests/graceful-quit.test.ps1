$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\common-windows.ps1')
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-quit-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
$fixtures = @()
try {
  $fixturePath = Join-Path $temporary 'fixture.exe'
  $fixtureSource = Join-Path $temporary 'fixture.cs'
  [IO.File]::WriteAllText($fixtureSource, @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class QuitFixture {
  [DllImport("user32.dll")]
  private static extern bool ShowWindow(IntPtr window, int command);
  [STAThread]
  public static void Main(string[] args) {
    var form = new Form { ShowInTaskbar = true, Width = 1, Height = 1 };
    form.Shown += (sender, e) => {
      ShowWindow(form.Handle, 4);
      File.WriteAllText(args[0], "ready");
    };
    form.FormClosing += (sender, e) => {
      File.AppendAllText(args[1], e.CloseReason + "\n");
      e.Cancel = args.Length > 2 || e.CloseReason != CloseReason.WindowsShutDown;
    };
    Application.Run(form);
  }
}
'@)
  $compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  & $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll "/out:$fixturePath" $fixtureSource
  if ($LASTEXITCODE -ne 0) { throw 'Could not compile the Windows GUI quit fixture.' }
  foreach ($name in @('accept', 'refuse')) {
    $ready = Join-Path $temporary "$name.ready"
    $events = Join-Path $temporary "$name.events"
    $arguments = @($ready, $events)
    if ($name -eq 'refuse') { $arguments += 'refuse' }
    $process = Start-Process -FilePath $fixturePath -WindowStyle Hidden -PassThru `
      -ArgumentList (ConvertTo-DreamSkinArgumentLine -Arguments $arguments)
    $fixtures += $process
    $deadline = [datetime]::UtcNow.AddSeconds(15)
    while (-not (Test-Path -LiteralPath $ready)) {
      if ($process.HasExited -or [datetime]::UtcNow -ge $deadline) { throw 'Quit fixture did not become ready.' }
      Start-Sleep -Milliseconds 100
    }
    if ($name -eq 'accept') {
      $process.Refresh()
      if ($process.MainWindowHandle -eq [IntPtr]::Zero) { throw 'The GUI fixture has no main window.' }
      [void]$process.CloseMainWindow()
      if ($process.WaitForExit(300)) { throw "The close-to-tray fixture unexpectedly exited ($($process.ExitCode)): $([IO.File]::ReadAllText($events))" }
      Request-DreamSkinCodexQuit -Process $process
      if (-not $process.WaitForExit(5000)) { throw 'The graceful session-end request did not exit the tray fixture.' }
    } else {
      $refused = $false
      try { Request-DreamSkinCodexQuit -Process $process } catch { $refused = $true }
      if (-not $refused -or $process.HasExited) { throw 'A refused graceful shutdown was forced or accepted.' }
    }
    if ([IO.File]::ReadAllText($events) -notmatch 'WindowsShutDown') { throw 'The fixture did not receive a graceful session-end request.' }
  }
} finally {
  foreach ($process in $fixtures) {
    if (-not $process.HasExited) { Stop-Process -InputObject $process -Force }
    if (-not $process.WaitForExit(5000)) { throw 'Quit fixture cleanup did not finish.' }
  }
  if (-not ([IO.Path]::GetFullPath($temporary)).StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
  Remove-Item -LiteralPath $temporary -Recurse -Force
}
Write-Host 'PASS: real tray-window shutdown and refused session-end without force.'
