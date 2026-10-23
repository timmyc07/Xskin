param([string]$PickerPath = (Join-Path $PSScriptRoot '..\scripts\choose-media.ps1'))

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class XskinPickerTest {
  public delegate bool Callback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, Callback callback, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr window, int index);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder value, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wparam, string text, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr wparam, IntPtr lparam);
  private static string ClassName(IntPtr window) {
    var name = new StringBuilder(128);
    GetClassName(window, name, name.Capacity);
    return name.ToString();
  }
  public static IntPtr Dialog(uint pid) {
    IntPtr result = IntPtr.Zero;
    EnumWindows(delegate(IntPtr window, IntPtr data) {
      uint actual; GetWindowThreadProcessId(window, out actual);
      if (actual == pid && ClassName(window) == "#32770") result = window;
      return true;
    }, IntPtr.Zero);
    return result;
  }
  public static IntPtr FileNameEdit(IntPtr dialog) {
    IntPtr result = IntPtr.Zero;
    EnumChildWindows(dialog, delegate(IntPtr window, IntPtr data) {
      if (GetDlgCtrlID(window) == 1148 && ClassName(window) == "Edit") result = window;
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@

$temporary = Join-Path ([IO.Path]::GetTempPath()) ('xskin-picker-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
  $unicode = ([char]0x5716).ToString() + [char]0x7247 + ' ' + [char]0x5F71 + [char]0x7247
  foreach ($extension in @('', '.png', '.mp4')) {
    $selected = ''
    if ($extension) {
      $selected = Join-Path $temporary ($unicode + $extension)
      [IO.File]::WriteAllBytes($selected, [byte[]]@(0))
    }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $start.Arguments = '-NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass -File "' + [IO.Path]::GetFullPath($PickerPath) + '"'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.WindowStyle = 'Hidden'
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.UTF8Encoding]::new($false, $true)
    $start.StandardErrorEncoding = [Text.UTF8Encoding]::new($false, $true)
    $process = [Diagnostics.Process]::Start($start)
    try {
      $deadline = [datetime]::UtcNow.AddSeconds(15)
      $dialog = [IntPtr]::Zero
      $edit = [IntPtr]::Zero
      while (-not $process.HasExited -and [datetime]::UtcNow -lt $deadline) {
        $dialog = [XskinPickerTest]::Dialog($process.Id)
        if ($dialog -ne [IntPtr]::Zero -and [XskinPickerTest]::IsWindowVisible($dialog)) {
          $edit = [XskinPickerTest]::FileNameEdit($dialog)
          if ($edit -ne [IntPtr]::Zero) { break }
        }
        Start-Sleep -Milliseconds 100
      }
      if ($dialog -eq [IntPtr]::Zero -or $edit -eq [IntPtr]::Zero -or -not [XskinPickerTest]::IsWindowVisible($dialog)) {
        throw 'The hidden PowerShell launch did not display a usable native picker.'
      }
      $owner = [XskinPickerTest]::GetWindow($dialog, 4)
      if ($owner -eq [IntPtr]::Zero -or ([XskinPickerTest]::GetWindowLong($owner, -20) -band 8) -eq 0 -or
        ([XskinPickerTest]::GetWindowLong($dialog, -20) -band 8) -eq 0) {
        throw 'The native picker can remain behind Codex: its owner and dialog must be topmost.'
      }
      if ($selected) {
        $sent = [IntPtr]::Zero
        if ([XskinPickerTest]::SendMessageTimeout($edit, 0x000C, [IntPtr]::Zero, $selected, 2, 3000, [ref]$sent) -eq [IntPtr]::Zero) {
          throw 'The native picker stopped responding to filename input.'
        }
        [void][XskinPickerTest]::PostMessage($dialog, 0x0111, [IntPtr]1, [IntPtr]::Zero)
      } else {
        [void][XskinPickerTest]::PostMessage($dialog, 0x0111, [IntPtr]2, [IntPtr]::Zero)
      }
      if (-not $process.WaitForExit(10000)) { throw 'The native picker did not finish after selection/cancellation.' }
      $output = $process.StandardOutput.ReadToEnd()
      if ($process.ExitCode -ne 0 -or $process.StandardError.ReadToEnd() -or
        ($output | ConvertFrom-Json) -cne $selected) {
        throw 'The native picker did not return the exact UTF-8 JSON path or cancellation.'
      }
    } finally {
      if (-not $process.HasExited) { $process.Kill(); [void]$process.WaitForExit(5000) }
      $process.Dispose()
    }
  }
} finally {
  if (-not ([IO.Path]::GetFullPath($temporary)).StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Unexpected picker fixture cleanup path.'
  }
  Remove-Item -LiteralPath $temporary -Recurse -Force
}
Write-Host 'PASS: visible owned native picker, cancellation and exact Unicode image/video paths from hidden PowerShell.'
