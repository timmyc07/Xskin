$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
Add-Type -AssemblyName System.Windows.Forms
$owner = [System.Windows.Forms.Form]::new()
$picker = [System.Windows.Forms.OpenFileDialog]::new()
try {
  # A hidden MCP process has no foreground owner for its native dialog.
  $owner.TopMost = $true
  $owner.ShowInTaskbar = $false
  $owner.Opacity = 0
  $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
  $owner.Show()
  $owner.Activate()
  $picker.Title = 'Choose an Xskin background'
  $picker.Filter = 'Images and MP4|*.png;*.jpg;*.jpeg;*.webp;*.heic;*.heif;*.tif;*.tiff;*.mp4'
  $picker.CheckFileExists = $true
  $picker.Multiselect = $false
  $selected = if ($picker.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $picker.FileName } else { '' }
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $selected -Compress))
} finally {
  $picker.Dispose()
  $owner.Dispose()
}
