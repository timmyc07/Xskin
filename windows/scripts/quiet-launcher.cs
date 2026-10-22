using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

internal static class QuietLauncher {
  private sealed class Diagnostic {
    private readonly StringBuilder text = new StringBuilder();
    internal void Append(object sender, DataReceivedEventArgs e) {
      if (e.Data == null) return;
      lock (text) {
        text.AppendLine(e.Data);
        if (text.Length > 4096) text.Remove(0, text.Length - 4096);
      }
    }
    public override string ToString() { lock (text) { return text.ToString().Trim(); } }
  }

  private static string Quote(string argument) {
    var result = new StringBuilder("\"");
    int backslashes = 0;
    foreach (char character in argument) {
      if (character == '\\') { backslashes++; continue; }
      if (character == '"') {
        result.Append('\\', backslashes * 2 + 1).Append('"');
      } else {
        result.Append('\\', backslashes).Append(character);
      }
      backslashes = 0;
    }
    return result.Append('\\', backslashes * 2).Append('"').ToString();
  }

  [STAThread]
  private static int Main(string[] args) {
    string executable = Assembly.GetExecutingAssembly().Location;
    string directory = Path.GetDirectoryName(executable);
    bool installer = Path.GetFileName(executable).Equals("Install Xskin.exe", StringComparison.OrdinalIgnoreCase);
    string mode = args.Length == 0 && installer ? "install" : args.Length > 0 ? args[0] : "";
    try {
      string script;
      switch (mode) {
        case "watch": script = "watch-codex-launches.ps1"; break;
        case "start": script = "start-dream-skin.ps1"; break;
        case "restore": script = "restore-dream-skin.ps1"; break;
        case "tray": script = "tray-dream-skin.ps1"; break;
        case "install": script = "install-dream-skin.ps1"; break;
        default: throw new ArgumentException("Choose a supported Xskin operation.");
      }
      string scripts = installer ? Path.Combine(directory, "scripts") : directory;
      script = Path.Combine(scripts, script);
      if (!File.Exists(script)) throw new FileNotFoundException("Extract the complete Xskin package before opening it.", script);
      var command = new StringBuilder("-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File ");
      command.Append(Quote(script));
      for (int index = 1; index < args.Length; index++) command.Append(' ').Append(Quote(args[index]));
      var diagnostic = new Diagnostic();
      var start = new ProcessStartInfo {
        FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"),
        Arguments = command.ToString(),
        WorkingDirectory = directory,
        UseShellExecute = false,
        CreateNoWindow = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true
      };
      int exitCode;
      using (var process = new Process { StartInfo = start }) {
        process.OutputDataReceived += diagnostic.Append;
        process.ErrorDataReceived += diagnostic.Append;
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        process.WaitForExit();
        exitCode = process.ExitCode;
      }
      if (exitCode != 0) {
        Report(directory, mode, "Xskin could not complete the operation (code " + exitCode + ").\n" + diagnostic);
        return exitCode;
      }
      if (mode == "install") {
        string panel = Path.Combine(Path.GetDirectoryName(scripts), "xskin.exe");
        if (File.Exists(panel)) {
          using (Process process = Process.Start(new ProcessStartInfo {
            FileName = panel, WorkingDirectory = Path.GetDirectoryName(panel), UseShellExecute = false, CreateNoWindow = true
          })) { }
        }
      }
      return 0;
    } catch (Exception error) {
      Report(directory, mode, error.Message);
      return 1;
    }
  }

  private static void Report(string directory, string mode, string message) {
    if (message.Length > 4096) message = message.Substring(0, 4096);
    if (mode == "watch") {
      try { File.WriteAllText(Path.Combine(directory, "quiet-launcher-error.log"), DateTime.UtcNow.ToString("o") + "\n" + message); }
      catch (IOException) { }
      catch (UnauthorizedAccessException) { }
    } else {
      MessageBox.Show(message, "Xskin", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
  }
}
